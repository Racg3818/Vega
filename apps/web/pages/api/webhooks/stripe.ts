import { buffer } from "micro";
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

// Desabilita body parser do Next.js
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    console.warn("❌ Método não permitido:", req.method);
    return res.status(405).end("Method Not Allowed");
  }

  const buf = await buffer(req);
  const sig = req.headers["stripe-signature"]!;
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET!);
    //console.log("✅ Webhook recebido:", event.type);
  } catch (err: any) {
    console.error("❌ Erro ao verificar assinatura do webhook:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
		
      case "checkout.session.completed": {
        //console.log("📦 Evento: checkout.session.completed");
        const session = event.data.object as Stripe.Checkout.Session;
		console.log("Session:", session)

        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        //console.log("🧾 Dados da sessão:", { customerId, subscriptionId });

        const customer = await stripe.customers.retrieve(customerId);
        if (!customer || typeof customer === "string") {
          console.warn("⚠️ Cliente não encontrado ou inválido");
          return res.status(200).json({ ok: true });
        }

        const user_id = (customer.metadata as any)?.user_id;
        //console.log("👤 Metadata do cliente:", customer.metadata);

        if (!user_id) {
          console.error("❌ user_id ausente no metadata do cliente Stripe");
          return res.status(200).json({ error: "user_id ausente" });
        }

        //console.log("✅ Sessão concluída - user_id:", user_id);

        const { data: existente, error: erroBusca } = await supabase
          .from("faturas")
          .select("*")
          .eq("user_id", user_id)
          .single();

        if (erroBusca) {
          console.error("❌ Erro ao buscar fatura existente:", erroBusca);
        }

        if (!existente) {
          //console.log("🆕 Inserindo nova fatura no Supabase...");
          const { error } = await supabase.from("faturas").insert([
            {
              user_id,
              stripe_customer_id: customerId,
			  stripe_checkout_session_id: session.id,
              stripe_subscription_id: subscriptionId,
              plano: "mensal",
              status: "ativa",
              data_criacao: new Date().toISOString(),
              //proxima_fatura: null, // será atualizada no subscription.updated
            },
          ]);

          if (error) {
            console.error("❌ Erro ao inserir nova fatura:", error);
          } else {
            console.log("✅ Fatura inserida com sucesso no Supabase");
          }
        } else {
          console.log("✏️ Atualizando fatura existente para status 'ativa'");
          const { error } = await supabase
            .from("faturas")
            .update({
              status: "ativa",
              stripe_subscription_id: subscriptionId,			  			  
            })
            .eq("user_id", user_id);

          if (error) {
            console.error("❌ Erro ao atualizar fatura:", error);
          } else {
            console.log("✅ Fatura atualizada com sucesso");
          }
        }

        break;
      }

      case "customer.subscription.updated": {
			console.log("🔄 Evento: customer.subscription.updated");

			const subscription = event.data.object as Stripe.Subscription;
			const customerId = subscription.customer as string;
			
			// Recuperar a assinatura com o latest_invoice expandido
			const fullSubscription = await stripe.subscriptions.retrieve(subscription.id, {
				expand: ['latest_invoice'],
			});		

			console.log("Full Subs:", fullSubscription)

			let nextInvoiceDate: string | null = null;

			if (fullSubscription.status === 'active' && fullSubscription.latest_invoice && typeof fullSubscription.latest_invoice !== 'string') {
				// Usar period_end da última fatura como a próxima data de cobrança
				nextInvoiceDate = new Date(fullSubscription?.current_period_end * 1000).toISOString();
			} else if (fullSubscription.status !== 'active') {
				// Se a assinatura não estiver ativa, não há próxima fatura
				nextInvoiceDate = null;
			}			

			const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
			const user_id = customer.metadata?.user_id;

			if (!user_id) {
				console.warn("⚠️ user_id ausente no metadata para subscription.updated. Não foi possível atualizar a fatura.");
				break;
			}

			const { data, error, count } = await supabase
				.from("faturas")
				.update({ proxima_fatura: nextInvoiceDate })
				.eq("user_id", user_id)
				.select('*', { count: 'exact' });

			if (error) {
				console.error("❌ Erro ao atualizar próxima fatura:", error);
			} else if (count === 0) {
				console.warn(`⚠️ Nenhuma linha encontrada para user_id = ${user_id}.`);
			} else {
				//console.log(`✅ Próxima fatura atualizada com sucesso:`, data);
			}

			break;
		}

	  case "invoice.paid": {
        
		  const invoice = event.data.object as Stripe.Invoice;
		  const subscriptionId = invoice.subscription as string;

		  if (subscriptionId) {
			const { error } = await supabase
			  .from("faturas")
			  .update({
				proxima_fatura: invoice.next_payment_attempt
				  ? new Date(invoice.next_payment_attempt * 1000).toISOString()
				  : null,
			  })
			  .eq("stripe_subscription_id", subscriptionId);

			if (error) {
			  console.error("Erro ao atualizar proxima_fatura:", error.message);
			}
		  }
		

        break;
      }

      case "invoice.payment_failed": {
        console.warn("⚠️ Pagamento da fatura falhou. ID do evento:", event.id);
        break;
      }
	}
      
    return res.status(200).json({ received: true });
  } catch (err: any) {
    console.error("❌ Erro interno no webhook:", {
      message: err.message,
      stack: err.stack,
    });
    return res.status(500).send("Erro interno no webhook.");
  }
}