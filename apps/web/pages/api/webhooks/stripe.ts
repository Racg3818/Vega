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
    console.log("✅ Webhook recebido:", event.type);
  } catch (err: any) {
    console.error("❌ Erro ao verificar assinatura do webhook:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
		
      case "checkout.session.completed": {
        console.log("📦 Evento: checkout.session.completed");
        const session = event.data.object as Stripe.Checkout.Session;
        console.log("Session:", session);

        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        console.log("🧾 Dados da sessão:", { customerId, subscriptionId });

        const customer = await stripe.customers.retrieve(customerId);
        if (!customer || typeof customer === "string") {
          console.warn("⚠️ Cliente não encontrado ou inválido");
          return res.status(200).json({ ok: true });
        }

        const user_id = (customer.metadata as any)?.user_id;
        console.log("👤 user_id do cliente:", user_id);

        if (!user_id) {
          console.error("❌ user_id ausente no metadata do cliente Stripe");
          return res.status(200).json({ error: "user_id ausente" });
        }

        // Buscar fatura existente
        const { data: existente, error: erroBusca } = await supabase
          .from("faturas")
          .select("*")
          .eq("user_id", user_id)
          .maybeSingle();

        if (erroBusca) {
          console.error("❌ Erro ao buscar fatura existente:", erroBusca);
        }

        // Buscar dados da assinatura para obter a próxima data de cobrança
        let proximaFatura = null;
        if (subscriptionId) {
          try {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            proximaFatura = new Date(subscription.current_period_end * 1000).toISOString();
            console.log("📅 Próxima fatura calculada:", proximaFatura);
          } catch (err) {
            console.error("❌ Erro ao buscar assinatura:", err);
          }
        }

        if (!existente) {
          console.log("🆕 Inserindo nova fatura no Supabase...");
          const { error } = await supabase.from("faturas").insert([
            {
              user_id,
              stripe_customer_id: customerId,
              stripe_checkout_session_id: session.id,
              stripe_subscription_id: subscriptionId,
              plano: "mensal",
              status: "ativa",
              data_criacao: new Date().toISOString(),
              proxima_fatura: proximaFatura,
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
              stripe_customer_id: customerId, // Garantir que seja salvo
              stripe_subscription_id: subscriptionId,
              status: "ativa",
              proxima_fatura: proximaFatura,
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

        console.log("Subscription data:", {
          id: subscription.id,
          status: subscription.status,
          current_period_end: subscription.current_period_end,
          cancel_at_period_end: subscription.cancel_at_period_end,
          canceled_at: subscription.canceled_at
        });

        let nextInvoiceDate: string | null = null;
        let status = 'ativa';
        let canceladaEm: string | null = null;

        if (subscription.status === 'active' && !subscription.cancel_at_period_end) {
          // Assinatura ativa normal
          nextInvoiceDate = new Date(subscription.current_period_end * 1000).toISOString();
          status = 'ativa';
          console.log("📅 Próxima fatura definida para:", nextInvoiceDate);
        } else if (subscription.cancel_at_period_end && subscription.status === 'active') {
          // Assinatura cancelada mas ainda ativa até o fim do período
          nextInvoiceDate = null; // Não haverá próxima cobrança
          status = 'cancelada_fim_periodo';
          canceladaEm = new Date().toISOString();
          console.log("🚫 Assinatura cancelada no fim do período atual");
        } else if (subscription.status === 'canceled') {
          // Assinatura completamente cancelada
          nextInvoiceDate = null;
          status = 'cancelada';
          canceladaEm = subscription.canceled_at 
            ? new Date(subscription.canceled_at * 1000).toISOString()
            : new Date().toISOString();
          console.log("❌ Assinatura completamente cancelada");
        } else {
          // Outros status (incomplete, past_due, etc)
          nextInvoiceDate = null;
          status = subscription.status;
          console.log(`⚠️ Status da assinatura: ${subscription.status}`);
        }

        const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
        const user_id = customer.metadata?.user_id;

        if (!user_id) {
          console.warn("⚠️ user_id ausente no metadata para subscription.updated");
          break;
        }

        const updateData: any = { 
          proxima_fatura: nextInvoiceDate,
          status: status
        };

        // Só atualizar cancelada_em se realmente foi cancelada
        if (canceladaEm) {
          updateData.cancelada_em = canceladaEm;
        }

        const { data, error, count } = await supabase
          .from("faturas")
          .update(updateData)
          .eq("user_id", user_id)
          .select('*', { count: 'exact' });

        if (error) {
          console.error("❌ Erro ao atualizar próxima fatura:", error);
        } else if (count === 0) {
          console.warn(`⚠️ Nenhuma linha encontrada para user_id = ${user_id}`);
        } else {
          console.log(`✅ Assinatura atualizada com sucesso para user_id ${user_id}:`, {
            status,
            proxima_fatura: nextInvoiceDate,
            cancelada_em: canceladaEm
          });
        }

        break;
      }

      case "invoice.paid": {
        console.log("💰 Evento: invoice.paid");
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string;

        if (subscriptionId) {
          // Buscar a assinatura para obter o período atual
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const proximaFatura = new Date(subscription.current_period_end * 1000).toISOString();

          const { error } = await supabase
            .from("faturas")
            .update({
              proxima_fatura: proximaFatura,
              status: 'ativa'
            })
            .eq("stripe_subscription_id", subscriptionId);

          if (error) {
            console.error("❌ Erro ao atualizar após pagamento:", error);
          } else {
            console.log("✅ Fatura atualizada após pagamento bem-sucedido");
          }
        }

        break;
      }

      case "invoice.payment_failed": {
        console.warn("⚠️ Pagamento da fatura falhou. ID do evento:", event.id);
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string;

        if (subscriptionId) {
          const { error } = await supabase
            .from("faturas")
            .update({ status: 'pagamento_falhado' })
            .eq("stripe_subscription_id", subscriptionId);

          if (error) {
            console.error("❌ Erro ao atualizar status após falha no pagamento:", error);
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        console.log("🗑️ Evento: customer.subscription.deleted");
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
        const user_id = customer.metadata?.user_id;

        if (user_id) {
          const { error } = await supabase
            .from("faturas")
            .update({ 
              status: 'cancelada',
              proxima_fatura: null,
              cancelada_em: subscription.canceled_at 
                ? new Date(subscription.canceled_at * 1000).toISOString()
                : new Date().toISOString()
            })
            .eq("user_id", user_id);

          if (error) {
            console.error("❌ Erro ao atualizar status após cancelamento:", error);
          } else {
            console.log("✅ Assinatura marcada como cancelada com data");
          }
        }
        break;
      }

      default:
        console.log(`🤷 Evento não tratado: ${event.type}`);
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