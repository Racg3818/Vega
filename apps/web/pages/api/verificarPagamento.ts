// pages/api/verificarPagamento.ts
import { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { supabase } from "@/lib/supabaseClient";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2022-11-15" });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { user_id } = req.body;

  const { data, error } = await supabase
    .from("clientes_stripe")
    .select("stripe_customer_id")
    .eq("user_id", user_id)
    .single();

  if (error || !data?.stripe_customer_id) {
    return res.status(200).json({ temPagamento: false });
  }

  const subscriptions = await stripe.subscriptions.list({
    customer: data.stripe_customer_id,
    status: "active",
    limit: 1,
  });

  const temPagamento = subscriptions.data.length > 0 && subscriptions.data[0].status === "active";
  return res.status(200).json({ temPagamento });
}
