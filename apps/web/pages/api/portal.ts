import { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  const { user_id } = req.body;

  if (!user_id) return res.status(400).json({ error: "user_id é obrigatório" });

  try {
    const clientes = await stripe.customers.list({ limit: 10 });
    const cliente = clientes.data.find(c => c.metadata?.user_id === user_id);

    if (!cliente) return res.status(404).json({ error: "Cliente não encontrado" });

    const portal = await stripe.billingPortal.sessions.create({
      customer: cliente.id,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
    });

    return res.status(200).json({ url: portal.url });
  } catch (err) {
    console.error("❌ Erro ao criar sessão do portal:", err);
    return res.status(500).json({ error: "Erro ao abrir portal do cliente Stripe" });
  }
}
