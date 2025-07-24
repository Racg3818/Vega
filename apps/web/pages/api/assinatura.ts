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
  
  // Para GET, pegamos user_id da query string, para POST do body
  const user_id = method === "GET" ? req.query.user_id as string : req.body?.user_id;
  const { email, nome } = req.body || {};

  if (!user_id) return res.status(400).json({ error: "user_id é obrigatório" });
  if (method === "POST" && !email) return res.status(400).json({ error: "user_id e email são obrigatórios" });

  try {
    const { data: existente } = await supabase
      .from("faturas")
      .select("*")
      .eq("user_id", user_id)
      .maybeSingle();

    let stripeCustomerId = existente?.stripe_customer_id;

    // Buscar ou criar cliente no Stripe (apenas para POST)
    if (method === "POST" && !stripeCustomerId) {
      const clientes = await stripe.customers.list({ email, limit: 10 });
      let cliente = clientes.data.find((c) => c.metadata?.user_id === user_id);

      if (!cliente) {
        if (clientes.data.length > 0) {
          cliente = await stripe.customers.update(clientes.data[0].id, {
            metadata: { user_id },
            name: nome,
          });
        } else {
          cliente = await stripe.customers.create({
            name: nome,
            email,
            metadata: { user_id },
          });
        }
      }

      stripeCustomerId = cliente.id;

      if (existente) {
        await supabase
          .from("faturas")
          .update({ stripe_customer_id: stripeCustomerId })
          .eq("user_id", user_id);
      }
    }

    if (method === "POST") {
      const subscriptions = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        limit: 3,
      });

      // Buscar assinatura ativa ou cancelada que ainda está no período
      const assinatura = subscriptions.data.find(sub =>
        ["active", "incomplete"].includes(sub.status) || 
        (sub.status === "canceled" && sub.current_period_end * 1000 > Date.now())
      );

      // Se existe assinatura ativa cancelada, reativar
      if (assinatura?.cancel_at_period_end) {
        await stripe.subscriptions.update(assinatura.id, { cancel_at_period_end: false });
        
        // Atualizar status no Supabase
        await supabase
          .from("faturas")
          .update({ 
            status: "ativa",
            cancelada_em: null,
            proxima_fatura: new Date(assinatura.current_period_end * 1000).toISOString()
          })
          .eq("user_id", user_id);

        return res.status(200).json({ session_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?aba=faturas` });
      }

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        customer: stripeCustomerId,
        line_items: [
          {
            price: "price_1RjtuPEKq04CUdXtKrYokfZ6",
            quantity: 1,
          },
        ],
        success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?aba=faturas`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?aba=faturas`,
        metadata: {
          user_id: user_id,
        },
      });

      if (!session?.url) {
        return res.status(500).json({ error: "Falha ao criar sessão Stripe" });
      }

      if (!existente) {
        const { error } = await supabase.from("faturas").insert([
          {
            user_id,
            stripe_customer_id: stripeCustomerId,
            stripe_checkout_session_id: session.id,
            stripe_subscription_id: "",
            plano: "mensal",
            status: "incompleto",
            data_criacao: new Date().toISOString(),
            proxima_fatura: null,
            cancelada_em: null,
          },
        ]);

        if (error) {
          console.error("❌ Erro ao inserir fatura:", error);
        }
      } else {
        const { error } = await supabase
          .from("faturas")
          .update({
            stripe_customer_id: stripeCustomerId,
            stripe_checkout_session_id: session.id,
            status: "incompleto",
          })
          .eq("user_id", user_id);

        if (error) {
          console.error("❌ Erro ao atualizar fatura:", error);
        }
      }

      return res.status(200).json({ session_url: session.url });
    }

    if (method === "GET") {
      if (!stripeCustomerId) {
        console.log("❌ GET: stripe_customer_id não encontrado para user_id:", user_id);
        return res.status(200).json({ permitido: false, motivo: "cliente_nao_encontrado" });
      }

      console.log("🔍 GET: Verificando permissões para customer:", stripeCustomerId);

      const subscriptions = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        limit: 5,
        expand: ["data.default_payment_method"]
      });

      console.log("📋 GET: Assinaturas encontradas:", subscriptions.data.map(s => ({
        id: s.id,
        status: s.status,
        cancel_at_period_end: s.cancel_at_period_end,
        current_period_end: s.current_period_end,
        has_payment_method: !!s.default_payment_method
      })));

      // Verificar assinatura ativa
      const assinatura = subscriptions.data.find(sub =>
        ["active", "incomplete"].includes(sub.status)
      );

      if (!assinatura) {
        // Verificar se há assinatura cancelada mas ainda no período ativo
        const assinaturaCancelada = subscriptions.data.find(sub =>
          sub.status === "canceled" && sub.current_period_end * 1000 > Date.now()
        );
        
        console.log("🔍 GET: Assinatura cancelada mas ainda ativa?", !!assinaturaCancelada);
        
        if (assinaturaCancelada) {
          return res.status(200).json({ 
            permitido: true, 
            cancelada: true,
            expira_em: new Date(assinaturaCancelada.current_period_end * 1000).toISOString()
          });
        }
        
        console.log("❌ GET: Nenhuma assinatura ativa ou válida encontrada");
        return res.status(200).json({ permitido: false, motivo: "assinatura_inativa" });
      }

      // Verificar se assinatura incompleta tem faturas pagas
      if (assinatura.status === "incomplete") {
        const faturas = await stripe.invoices.list({ customer: stripeCustomerId, limit: 5 });
        const possuiFaturaPaga = faturas.data.some(f => f.status === "paid");
        if (!possuiFaturaPaga) {
          console.log("❌ GET: Assinatura incompleta sem faturas pagas");
          return res.status(200).json({ permitido: false, motivo: "assinatura_inativa" });
        }
      }
	  
	  if (!assinatura.default_payment_method && assinatura.customer) {
		  const cliente = await stripe.customers.retrieve(assinatura.customer as string) as Stripe.Customer;
		  assinatura.default_payment_method = cliente.invoice_settings?.default_payment_method || cliente.default_source || null;
		}


      // Verificar método de pagamento válido
      let metodo = assinatura.default_payment_method;
      
      // Se não há método expandido, buscar separadamente
      if (!metodo && assinatura.default_payment_method) {
        try {
          metodo = await stripe.paymentMethods.retrieve(assinatura.default_payment_method as string);
        } catch (err) {
          console.log("❌ GET: Erro ao buscar método de pagamento:", err);
          return res.status(200).json({ permitido: false, motivo: "cartao_removido" });
        }
      }

      // Verificar se método de pagamento é válido
      if (!metodo) {
        console.log("❌ GET: Nenhum método de pagamento encontrado");
        return res.status(200).json({ permitido: false, motivo: "cartao_removido" });
      }

      // Verificar se é cartão válido
      if (typeof metodo === "object" && metodo.type === "card") {
        const agora = new Date();
        const mesAtual = agora.getMonth() + 1; // getMonth() retorna 0-11
        const anoAtual = agora.getFullYear();
        
        if (!metodo.card?.exp_month || !metodo.card?.exp_year) {
          console.log("❌ GET: Cartão sem data de expiração");
          return res.status(200).json({ permitido: false, motivo: "cartao_removido" });
        }
        
        // Verificar se cartão está expirado
        if (metodo.card.exp_year < anoAtual || 
           (metodo.card.exp_year === anoAtual && metodo.card.exp_month < mesAtual)) {
          console.log("❌ GET: Cartão expirado");
          return res.status(200).json({ permitido: false, motivo: "cartao_expirado" });
        }
      }

      const resultado = { 
        permitido: true,
        cancelada: assinatura.cancel_at_period_end,
        expira_em: assinatura.cancel_at_period_end 
          ? new Date(assinatura.current_period_end * 1000).toISOString()
          : null
      };

      console.log("✅ GET: Resultado final:", resultado);
      return res.status(200).json(resultado);
    }

    return res.status(405).json({ error: "Método não suportado" });
  } catch (err) {
    console.error("❌ Erro interno:", err);
    return res.status(500).json({ error: "Erro no processamento Stripe" });
  }
}