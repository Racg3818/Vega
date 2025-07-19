import type { NextApiRequest, NextApiResponse } from "next";
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
  const { user_id } = req.body;

  if (!user_id) return res.status(400).json({ erro: "user_id ausente" });

  // Pega o stripe_customer_id no Supabase
  const { data, error } = await supabase
    .from("faturas")
    .select("stripe_customer_id")
    .eq("user_id", user_id)
    .single();

  if (error || !data?.stripe_customer_id) {
    return res.status(404).json({ erro: "Cliente não encontrado." });
  }

  try {
    const invoices = await stripe.invoices.list({
      customer: data.stripe_customer_id,
      limit: 10,
    });

    return res.status(200).json({ faturas: invoices.data });
  } catch (err: any) {
    console.error("Erro ao buscar faturas:", err.message);
    return res.status(500).json({ erro: "Erro ao buscar faturas do Stripe" });
  }
}
