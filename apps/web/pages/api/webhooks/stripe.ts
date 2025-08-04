// ✅ VERSÃO FAIL-SAFE COM LOGS DETALHADOS
import { buffer } from "micro";
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const config = {
  api: {
    bodyParser: false,
  },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function sincronizarHistoricoFaturas(faturaId: string, subscriptionId: string) {
  try {
    console.log("📋 Sincronizando histórico para fatura:", faturaId);
    
    // Buscar invoices do Stripe
    const invoices = await stripe.invoices.list({
      subscription: subscriptionId,
      limit: 10,
      status: 'paid' // Apenas faturas pagas
    });

    for (const invoice of invoices.data) {
      // Verificar se já existe no histórico
      const { data: existente } = await supabase
        .from("faturas_historico")
        .select("id")
        .eq("fatura_id", faturaId)
        .eq("subscription_id", invoice.subscription)
        .eq("data_criacao", new Date(invoice.created * 1000).toISOString())
        .maybeSingle();

      if (!existente) {
        const { error } = await supabase
          .from("faturas_historico")
          .insert({
            fatura_id: faturaId,
            data_criacao: new Date(invoice.created * 1000).toISOString(),
            valor: invoice.amount_paid || 0,
            status: invoice.status || 'unknown',
            pago: invoice.status === 'paid',
            link_fatura: invoice.hosted_invoice_url,
            subscription_id: invoice.subscription as string
          });

        if (error) {
          console.error("❌ Erro ao inserir histórico:", error);
        } else {
          console.log("✅ Histórico inserido para invoice:", invoice.id);
        }
      }
    }
  } catch (err) {
    console.error("❌ Erro ao sincronizar histórico:", err);
  }
}

async function upsertFatura(userId: string, subscription: Stripe.Subscription) {
	  
	  console.log("📦 Subscription recebida no upsert:", {
	  id: subscription.id,
	  status: subscription.status,
	  cancel_at_period_end: subscription.cancel_at_period_end,
	  current_period_end: subscription.current_period_end,
	  canceled_at: subscription.canceled_at
	});

  
  try {
    const status = getStatusFromStripe(subscription);
    const valor = await getSubscriptionValue(subscription);
    
    const dadosFatura = {
      user_id: userId,
      stripe_customer_id: subscription.customer as string,
      stripe_subscription_id: subscription.id,
      tipo_fatura: "mensal",
      status,
      plano: "mensal",
      valor,
      proxima_fatura: subscription.status === 'active' && !subscription.cancel_at_period_end && typeof subscription.current_period_end === 'number'
		  ? new Date(subscription.current_period_end * 1000).toISOString()
		  : null,
      expiracao_em: (subscription.cancel_at_period_end || subscription.status === 'canceled') && typeof subscription.current_period_end === 'number'
		  ? new Date(subscription.current_period_end * 1000).toISOString()
		  : null,
      cancelada_em: typeof subscription.canceled_at === 'number'
		  ? new Date(subscription.canceled_at * 1000).toISOString()
		  : null,
      problema_pagamento: subscription.status === 'past_due',
      motivo_problema: subscription.status === 'past_due' ? 'pagamento_falhado' : null,
      criado_em: typeof subscription.created === 'number'
		  ? new Date(subscription.created * 1000).toISOString()
		  : null,

    };

    console.log("📝 Dados da fatura:", dadosFatura);

    const { data: insertData, error: insertError  } = await supabase
      .from("faturas")
      .upsert(dadosFatura, { 
        onConflict: 'user_id,tipo_fatura',
        ignoreDuplicates: false 
      })
      .select("id")
      .maybeSingle();

    if (!insertError  && insertData) {
      console.log("✅ Upsert successful:", insertData);
      
      // ✅ SINCRONIZAR HISTÓRICO
      await sincronizarHistoricoFaturas(insertData.id, subscription.id);
      
      return true;
    }

    console.warn("⚠️ Upsert falhou, tentando fallback:", insertError);

    // ✅ FALLBACK com sincronização
    const { data: faturaExistente } = await supabase
      .from("faturas")
      .select("id")
      .eq("user_id", userId)
      .eq("tipo_fatura", "mensal")
      .maybeSingle();

    if (faturaExistente) {
      const { error: updateError } = await supabase
        .from("faturas")
        .update(dadosFatura)
        .eq("id", faturaExistente.id);

      if (!updateError) {
        await sincronizarHistoricoFaturas(faturaExistente.id, subscription.id);
        console.log("✅ Update + histórico successful via fallback");
      }
    } else {
      const { data: insertData, error: insertError } = await supabase
        .from("faturas")
        .insert(dadosFatura)
        .select("id")
        .single();

      if (!insertError && insertData) {
        await sincronizarHistoricoFaturas(insertData.id, subscription.id);
        console.log("✅ Insert + histórico successful via fallback");
      }
    }

    return true;

  } catch (err) {
    console.error("❌ Erro crítico no upsert:", err);
    return false;
  }
}

function getStatusFromStripe(subscription: Stripe.Subscription): string {
  console.log("🔍 Determinando status para subscription:", {
    status: subscription.status,
    cancel_at_period_end: subscription.cancel_at_period_end,
    current_period_end: subscription.current_period_end
  });

  if (subscription.status === 'active') {
    return subscription.cancel_at_period_end ? 'cancelada_fim_periodo' : 'ativa';
  }
  if (subscription.status === 'canceled') {
    return subscription.current_period_end * 1000 > Date.now() 
      ? 'cancelada_fim_periodo' 
      : 'cancelada';
  }
  if (subscription.status === 'past_due') return 'ativa';
  if (subscription.status === 'incomplete') return 'incompleto';
  return 'cancelada';
}

async function getSubscriptionValue(subscription: Stripe.Subscription): Promise<number> {
  try {
    if (subscription.items.data.length > 0) {
      const priceId = subscription.items.data[0].price.id;
      console.log("💰 Buscando preço para:", priceId);
      
      const price = await stripe.prices.retrieve(priceId);
      const valor = parseFloat(((price.unit_amount || 0) / 100).toFixed(2));
      console.log("💰 Valor encontrado:", valor);
      return valor;
    }
  } catch (err) {
    console.warn("⚠️ Erro ao buscar preço:", err);
  }
  return 0;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	
  console.log("🔔 Webhook Stripe recebido", req.method);
  if (req.method !== "POST") {
    return res.status(405).end("Method Not Allowed");
  }
  
  const buf = await buffer(req);
  const sig = req.headers["stripe-signature"]!;
  let event: Stripe.Event;

  try {	  

    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET!);
    console.log("✅ Webhook recebido:", event.type, "ID:", event.id);
  } catch (err: any) {
    console.error("❌ Webhook signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    async function getUserId(customerId: string): Promise<string | null> {
	  try {
		const customer = await stripe.customers.retrieve(customerId);
		const metadata = (customer as Stripe.Customer).metadata;

		console.log("📦 Metadata recebida do Stripe:", metadata);

		return metadata?.user_id || null;
	  } catch (erro) {
		console.error("❌ Erro ao buscar user_id via Stripe:", erro);
		return null;
	  }
	}

    switch (event.type) {
      
      // Adicione esta lógica no caso "checkout.session.completed" do seu stripe.ts

		case "checkout.session.completed": {
		  console.log("🛒 Processando checkout.session.completed");
		  const session = event.data.object as Stripe.Checkout.Session;
		  const customerId = session.customer as string;
		  const subscriptionId = session.subscription as string;

		  console.log("🛒 Dados do checkout:", { customerId, subscriptionId });

		  const userId = await getUserId(customerId);
		  if (!userId) {
			console.warn("⚠️ UserID não encontrado, abortando");
			break;
		  }

		  try {
			const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
			  expand: ['items.data.price']
			});
			console.log("📋 Subscription recuperada:", subscription.id);
			
			// ✅ NOVO: Definir método de pagamento como padrão
			if (subscription.default_payment_method || subscription.latest_invoice) {
			  let paymentMethodId = subscription.default_payment_method as string;
			  
			  // Se não tiver payment_method na subscription, buscar na invoice
			  if (!paymentMethodId && subscription.latest_invoice) {
				try {
				  const invoice = await stripe.invoices.retrieve(subscription.latest_invoice as string, {
					expand: ['payment_intent']
				  });
				  
				  if (invoice.payment_intent && typeof invoice.payment_intent === 'object') {
					paymentMethodId = invoice.payment_intent.payment_method as string;
				  }
				} catch (invoiceError) {
				  console.warn("⚠️ Erro ao buscar payment_method da invoice:", invoiceError);
				}
			  }
			  
			  // Definir como padrão na subscription
			  if (paymentMethodId) {
				try {
				  await stripe.subscriptions.update(subscriptionId, {
					default_payment_method: paymentMethodId
				  });
				  
				  // Opcional: Definir como padrão no customer também
				  await stripe.customers.update(customerId, {
					invoice_settings: {
					  default_payment_method: paymentMethodId
					}
				  });
				  
				  console.log("✅ Método de pagamento definido como padrão:", paymentMethodId);
				} catch (paymentMethodError) {
				  console.warn("⚠️ Erro ao definir método padrão:", paymentMethodError);
				}
			  }
			}
			
			const success = await upsertFatura(userId, subscription);
			if (success) {
			  console.log("✅ Checkout processado com sucesso");
			} else {
			  console.error("❌ Falha ao processar checkout");
			}
		  } catch (err) {
			console.error("❌ Erro ao buscar subscription:", err);
		  }
		  break;
		}

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        console.log(`🔄 Processando ${event.type}`);
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const userId = await getUserId(customerId);
        if (!userId) break;

        const success = await upsertFatura(userId, subscription);
        console.log(`✅ ${event.type} processado:`, success);
        break;
      }

      case "customer.subscription.deleted": {
        console.log("🗑️ Processando subscription.deleted");
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const userId = await getUserId(customerId);
        if (!userId) break;

        const { error } = await supabase
          .from("faturas")
          .update({
            status: 'cancelada',
            proxima_fatura: null,
            expiracao_em: null,
            cancelada_em: new Date().toISOString(),
            problema_pagamento: false,
            motivo_problema: null
          })
          .eq("user_id", userId)
          .eq("tipo_fatura", "mensal");

        if (error) {
          console.error("❌ Erro ao marcar como cancelada:", error);
        } else {
          console.log("✅ Subscription marcada como cancelada");
        }
        break;
      }

      case "invoice.payment_failed": {
        console.log("💳 Processando payment_failed");
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        const userId = await getUserId(customerId);
        if (!userId) break;

        const { error } = await supabase
          .from("faturas")
          .update({
            problema_pagamento: true,
            motivo_problema: 'pagamento_falhado'
          })
          .eq("user_id", userId)
          .eq("tipo_fatura", "mensal");

        if (error) {
          console.error("❌ Erro ao marcar problema pagamento:", error);
        } else {
          console.log("✅ Problema de pagamento registrado");
        }
        break;
      }

      case "invoice.payment_succeeded": {
		  console.log("💰 Processando invoice.payment_succeeded");
		  const invoice = event.data.object as Stripe.Invoice;
		  const customerId = invoice.customer as string;
		  const subscriptionId = invoice.subscription as string | null;

		  const userId = await getUserId(customerId);
		  if (!userId) break;

		  // 🧠 Verifica se é fatura mensal ou variável
		  if (subscriptionId) {
			// 🔄 MENSAL (código mantido igual)
			const { data: fatura } = await supabase
			  .from("faturas")
			  .select("id")
			  .eq("user_id", userId)
			  .eq("stripe_subscription_id", subscriptionId)
			  .maybeSingle();

			if (fatura) {
			  await supabase.from("faturas_historico").upsert({
				fatura_id: fatura.id,
				data: new Date(invoice.created * 1000).toISOString(),
				valor: invoice.amount_paid || 0,
				status: invoice.status || 'paid',
				pago: invoice.status === 'paid',
				link_fatura: invoice.hosted_invoice_url,
				subscription_id: subscriptionId
			  }, {
				onConflict: 'fatura_id,data,subscription_id',
				ignoreDuplicates: true
			  });
			  console.log("✅ Histórico atualizado para fatura mensal");
			}

		  } else {
			// 📊 VARIÁVEL - COM VALIDAÇÃO DE VALOR
			console.log("🔍 Verificando se é fatura variável...");
			
			// Verificar se é fatura variável pelo metadata ou description
			const isVariavel = invoice.metadata?.tipo_fatura === 'variavel' || 
							 invoice.lines.data.some(line => 
							   line.description?.includes('Taxa variável Vega')
							 );

			if (isVariavel) {
			  console.log("📊 Confirmado: É uma fatura variável");
			  
			  // 🚨 VALIDAÇÃO CRÍTICA: Verificar se o valor é maior que zero
			  const valorFatura = invoice.amount_paid || 0;
			  
			  if (valorFatura <= 0) {
				console.log(`⚠️ Fatura variável com valor R$ ${valorFatura / 100} ignorada (valor zero ou negativo)`);
				console.log("ℹ️ Motivo: Não há diferença nas taxas contratuais, portanto não há cobrança adicional");
				break; // Sai do case sem processar
			  }
			  
			  console.log(`💰 Valor válido detectado: R$ ${valorFatura / 100}`);
			  
			  // 🔑 Capturar forma de pagamento
			  let formaPagamento = 'unknown';
			  let detalhesFormaPagamento = {};
			  
			  try {
				if (invoice.payment_intent) {
				  console.log("🔍 Buscando detalhes do PaymentIntent:", invoice.payment_intent);
				  
				  const paymentIntent = await stripe.paymentIntents.retrieve(
					invoice.payment_intent as string,
					{ expand: ['payment_method'] }
				  );
				  
				  if (paymentIntent.payment_method) {
					const paymentMethod = paymentIntent.payment_method as Stripe.PaymentMethod;
					formaPagamento = paymentMethod.type;
					
					// Capturar detalhes específicos baseado no tipo
					switch (paymentMethod.type) {
					  case 'card':
						detalhesFormaPagamento = {
						  brand: paymentMethod.card?.brand,
						  last4: paymentMethod.card?.last4,
						  exp_month: paymentMethod.card?.exp_month,
						  exp_year: paymentMethod.card?.exp_year,
						  funding: paymentMethod.card?.funding
						};
						break;
					  case 'boleto':
						detalhesFormaPagamento = {
						  tax_id: paymentMethod.boleto?.tax_id
						};
						break;
					  case 'pix':
						detalhesFormaPagamento = {
						  bank: paymentMethod.pix?.bank
						};
						break;
					  default:
						detalhesFormaPagamento = { type: paymentMethod.type };
					}
					
					console.log("💳 Forma de pagamento identificada:", {
					  type: formaPagamento,
					  details: detalhesFormaPagamento
					});
				  }
				}
			  } catch (paymentError) {
				console.warn("⚠️ Erro ao buscar forma de pagamento:", paymentError);
				formaPagamento = 'error_retrieving';
			  }
			  
			  console.log("📝 Registrando fatura variável individual...");
			  
			  const { data: faturaVariavel, error: erroFaturaVar } = await supabase
				.from("faturas")
				.insert({
				  user_id: userId,
				  stripe_customer_id: customerId,
				  stripe_invoice_id: invoice.id,
				  tipo_fatura: "variavel",
				  valor: valorFatura, // Usar a variável validada
				  status: 'paid',
				  plano: "variavel",
				  problema_pagamento: false,
				  motivo_problema: null,
				  criado_em: new Date(invoice.created * 1000).toISOString(),
				  periodo_cobranca: new Date().toISOString().split('T')[0],
				  forma_pagamento: formaPagamento,
				  detalhes: JSON.stringify({
					stripe_invoice_id: invoice.id,
					amount_paid: valorFatura,
					currency: invoice.currency,
					invoice_pdf: invoice.invoice_pdf,
					payment_method: {
					  type: formaPagamento,
					  details: detalhesFormaPagamento,
					  payment_intent_id: invoice.payment_intent
					}
				  })
				})
				.select("id")
				.single();

			  if (erroFaturaVar) {
				console.error("❌ Erro ao salvar fatura variável:", erroFaturaVar);
				
				if (erroFaturaVar.code === '23505') {
				  console.log("ℹ️ Fatura já processada anteriormente (duplicate key)");
				}
			  } else {
				// Registrar no histórico
				await supabase.from("faturas_historico").insert({
				  fatura_id: faturaVariavel.id,
				  data_criacao: new Date(invoice.created * 1000).toISOString(),
				  valor: valorFatura,
				  status: 'paid',
				  pago: true,
				  link_fatura: invoice.hosted_invoice_url,
				  subscription_id: null
				});
				
				console.log(`✅ Fatura variável registrada: R$ ${valorFatura / 100} (Invoice: ${invoice.id}) - Forma: ${formaPagamento}`);
			  }
			} else {
			  console.log("ℹ️ Fatura não identificada como variável, ignorando...");
			}
		  }

		  break;
		}

      default:
        console.log(`🤷 Evento não tratado: ${event.type}`);
    }

    console.log("✅ Webhook processado com sucesso");
    return res.status(200).json({ received: true });
    
  } catch (err: any) {
    console.error("❌ Erro crítico no webhook:", {
      message: err.message,
      stack: err.stack,
      event_type: event?.type,
      event_id: event?.id
    });
    return res.status(500).send("Erro interno");
  }
}