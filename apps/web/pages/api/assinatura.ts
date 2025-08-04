// ✅ NOVO: assinatura.ts - SEM SINCRONIZAÇÃO, APENAS CRUD
import { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;
  const user_id = method === "GET" ? req.query.user_id as string : req.body?.user_id;
  const { email, nome } = req.body || {};

  if (!user_id) {
    return res.status(400).json({ error: "user_id é obrigatório" });
  }

  try {
    
    // ✅ POST - Criar/Reativar assinatura (SEM SINCRONIZAÇÃO)
    if (method === "POST") {
		  
		  if (!email) {
			return res.status(400).json({ error: "email é obrigatório" });
		  }

		  // ✅ Buscar customer existente com melhor tratamento
		  let stripeCustomerId: string;
		  
		  const { data: faturaExistente } = await supabase
			.from("faturas")
			.select("stripe_customer_id, stripe_subscription_id")
			.eq("user_id", user_id)
			.eq("tipo_fatura", "mensal")
			.maybeSingle();

		  if (faturaExistente?.stripe_customer_id) {
			stripeCustomerId = faturaExistente.stripe_customer_id;
			
			// ✅ Verificar se o customer ainda existe no Stripe
			try {
			  const customer = await stripe.customers.retrieve(stripeCustomerId);
			  if (customer.deleted) {
				console.warn("⚠️ Customer foi deletado no Stripe, criando novo");
				throw new Error("Customer deletado");
			  }
			} catch (err) {
			  console.warn("⚠️ Erro ao verificar customer, criando novo:", err);
			  stripeCustomerId = ''; // Força criação de novo customer
			}
		  }

		  // ✅ Criar customer se necessário
		  if (!stripeCustomerId) {
			try {
			  const clientes = await stripe.customers.list({ email, limit: 1 });
			  
			  if (clientes.data.length > 0) {
				const cliente = await stripe.customers.update(clientes.data[0].id, {
				  metadata: { user_id },
				  name: nome,
				});
				stripeCustomerId = cliente.id;
			  } else {
				const cliente = await stripe.customers.create({
				  name: nome,
				  email,
				  metadata: { user_id },
				});
				stripeCustomerId = cliente.id;
			  }
			} catch (err) {
			  console.error("❌ Erro ao criar/atualizar customer:", err);
			  return res.status(500).json({ 
				error: "Erro ao criar customer no Stripe",
				details: err instanceof Error ? err.message : "Erro desconhecido"
			  });
			}
		  }

		  // ✅ Verificar assinaturas com tratamento de erro melhor
		  try {
			const subscriptions = await stripe.subscriptions.list({
			  customer: stripeCustomerId,
			  limit: 10, // ✅ Buscar mais para ter certeza
			  status: 'all' // ✅ Incluir todas para análise completa
			});

			console.log("🔍 Subscriptions encontradas:", subscriptions.data.map(s => ({
			  id: s.id,
			  status: s.status,
			  cancel_at_period_end: s.cancel_at_period_end,
			  current_period_end: s.current_period_end
			})));

			const assinatura = subscriptions.data.find(sub =>
			  ["active", "incomplete", "trialing"].includes(sub.status) || 
			  (sub.status === "canceled" && sub.current_period_end * 1000 > Date.now())
			);

			// ✅ Reativar se cancelada mas ainda no período
			if (assinatura?.cancel_at_period_end && assinatura.status === 'active') {
			  await stripe.subscriptions.update(assinatura.id, { 
				cancel_at_period_end: false 
			  });
			  
			  return res.status(200).json({ 
				message: "Assinatura reativada com sucesso",
				session_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?aba=faturas&reativada=true` 
			  });
			}

			// ✅ Se já ativa, redirecionar com mais informações
			if (assinatura && ["active", "incomplete", "trialing"].includes(assinatura.status)) {
			  return res.status(200).json({ 
				message: `Assinatura já ${assinatura.status === 'active' ? 'ativa' : assinatura.status}`,
				session_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?aba=faturas&status=${assinatura.status}` 
			  });
			}

			// ✅ Criar checkout session com mais configurações
			const session = await stripe.checkout.sessions.create({
			  mode: "subscription",
			  payment_method_types: ["card"],
			  customer: stripeCustomerId,
			  line_items: [{ price: "price_1RjtuPEKq04CUdXtKrYokfZ6", quantity: 1 }],
			  success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?aba=faturas&success=true`,
			  cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?aba=faturas&canceled=true`,
			  metadata: { user_id },
			  allow_promotion_codes: true, // ✅ Permitir códigos promocionais
			  billing_address_collection: 'auto', // ✅ Coletar endereço se necessário
			  	  
			});

			return res.status(200).json({ session_url: session.url });

		  } catch (err) {
			console.error("❌ Erro ao processar subscriptions:", err);
			return res.status(500).json({ 
			  error: "Erro ao verificar assinaturas",
			  details: err instanceof Error ? err.message : "Erro desconhecido"
			});
		  }
		}

    // ✅ GET - Consultar status (DIRETO DO BANCO)
    if (method === "GET") {
		  const { data: fatura, error } = await supabase
			.from("faturas")
			.select("*")
			.eq("user_id", user_id)
			.eq("tipo_fatura", "mensal")
			.maybeSingle();

		  if (error) {
			console.error("❌ Erro ao buscar fatura:", error);
			return res.status(500).json({ 
			  error: "Erro ao consultar fatura",
			  details: error.message 
			});
		  }

		  if (!fatura) {
			return res.status(200).json({ 
			  permitido: false, 
			  motivo: "fatura_nao_encontrada",
			  status: null
			});
		  }

		  // ✅ Verificar se assinatura ainda está válida no Stripe (opcional)
		  let stripeStatus = null;
		  if (fatura.stripe_subscription_id) {
			try {
			  const subscription = await stripe.subscriptions.retrieve(fatura.stripe_subscription_id);
			  stripeStatus = subscription.status;
			  
			  // ✅ Se status no Stripe diferir do banco, logar para investigação
			  if (subscription.status !== fatura.status && subscription.status === 'canceled') {
				console.warn("⚠️ Inconsistência detectada:", {
				  banco: fatura.status,
				  stripe: subscription.status,
				  subscription_id: fatura.stripe_subscription_id
				});
			  }
			} catch (err) {
			  console.warn("⚠️ Erro ao verificar status no Stripe:", err);
			}
		  }

		  const permitido = ['ativa', 'cancelada_fim_periodo'].includes(fatura.status);

		  return res.status(200).json({
			permitido,
			cancelada: fatura.status === 'cancelada_fim_periodo',
			status: fatura.status,
			stripe_status: stripeStatus, // ✅ Incluir status do Stripe para debug
			expira_em: fatura.expiracao_em,
			proxima_fatura: fatura.proxima_fatura,
			problema_pagamento: fatura.problema_pagamento,
			motivo_problema: fatura.motivo_problema,
			valor: fatura.valor,
			plano: fatura.plano
		  });
		}

    // ✅ PUT - Portal do Stripe
    if (method === "PUT") {
      const { data: fatura } = await supabase
        .from("faturas")
        .select("stripe_customer_id")
        .eq("user_id", user_id)
        .eq("tipo_fatura", "mensal")
        .maybeSingle();

      if (!fatura?.stripe_customer_id) {
        return res.status(400).json({ error: "Cliente não encontrado" });
      }

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: fatura.stripe_customer_id,
        return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?aba=faturas`,
      });

      return res.status(200).json({ url: portalSession.url });
    }

    // ✅ DELETE - Cancelar assinatura (SEM SINCRONIZAÇÃO)
    if (method === "DELETE") {
      const { data: fatura } = await supabase
        .from("faturas")
        .select("stripe_subscription_id")
        .eq("user_id", user_id)
        .eq("tipo_fatura", "mensal")
        .maybeSingle();

      if (!fatura?.stripe_subscription_id) {
        return res.status(400).json({ error: "Assinatura não encontrada" });
      }

      await stripe.subscriptions.update(fatura.stripe_subscription_id, {
        cancel_at_period_end: true,
      });

      return res.status(200).json({ 
        sucesso: true,
        message: "Assinatura cancelada ao fim do período"
      });
    }

    return res.status(405).json({ error: "Método não suportado" });

  } catch (err) {
    console.error("❌ Erro:", err);
    return res.status(500).json({ 
      error: "Erro interno",
      details: err instanceof Error ? err.message : "Erro desconhecido"
    });
  }
}