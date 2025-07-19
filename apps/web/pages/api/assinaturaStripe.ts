import { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

// Inicialização do Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

// Inicialização do Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const { user_id, email, nome } = req.body;

  console.log("📩 Requisição recebida com:", { user_id, email });

  if (!user_id || !email) {
	console.error("❌ user_id ou email ausente no corpo da requisição");
    return res.status(400).json({ error: "user_id e email são obrigatórios" });
  }

  try {
		// Verifica se já existe uma fatura no Supabase
		const { data: existente, error: erroBusca } = await supabase
		  .from("faturas")
		  .select("*")
		  .eq("user_id", user_id)
		  .maybeSingle();
		  
		if (erroBusca) {
		  console.warn("⚠️ Erro ao buscar fatura existente:", erroBusca.message);
		} else if (existente) {
		  console.log("🔎 Fatura existente encontrada:", existente);
		}

		let stripeCustomerId = existente?.stripe_customer_id;

		// Sempre cria ou garante que o cliente Stripe tenha metadata.user_id
		if (!stripeCustomerId) {
		  const clientes = await stripe.customers.list({ email, limit: 10 });

		  let cliente = clientes.data.find((c) => c.metadata?.user_id === user_id);

		  if (!cliente) {
			if (clientes.data.length > 0) {
			  // Reaproveita o primeiro cliente e garante o metadata
			  cliente = await stripe.customers.update(clientes.data[0].id, {
				metadata: { user_id },
			  });
			} else {
			  // Cria novo cliente com metadata
			  cliente = await stripe.customers.create({
				name: nome,
				email,
				metadata: { user_id },
			  });
			}
		  } else if (cliente.metadata?.user_id !== user_id) {
			// Atualiza metadata mesmo se cliente já tiver sido encontrado
			await stripe.customers.update(cliente.id, {
			  metadata: { user_id },
			});
		  }

		  stripeCustomerId = cliente.id;
		}
		
		// Cria a sessão de checkout de assinatura
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
		  success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
		  cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
		});
		
		console.log("Session:", session)
		
		// Se ainda não houver registro no Supabase, cria com status incompleto
		if (!existente) {
		  const { error } = await supabase.from("faturas").insert([
			{
			  user_id,
			  stripe_customer_id: stripeCustomerId,
			  stripe_checkout_session_id: session.id,
			  stripe_subscription_id: "", // será preenchido pelo webhook após confirmação
			  plano: "mensal",
			  status: "incompleto",
			  data_criacao: new Date().toISOString(),
			  proxima_fatura: null,
			  
			},
		  ]);

		  if (error) {
			console.error("Erro ao salvar fatura no Supabase:", error);
			return res.status(500).json({ error: "Erro ao salvar na tabela faturas" });
		  }
		}

		return res.status(200).json({ session_url: session.url });
  } catch (err: any) {
	    console.error("❌ Erro interno:", err);
		return res.status(500).json({ error: "Erro ao criar sessão de pagamento" });
  }
}