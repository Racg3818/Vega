import { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { criarFaturaVariavel } from "@/utils/criarFaturaVariavel"; // ajuste se o caminho for diferente

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log("📩 Requisição recebida em /api/fecharFaturaVariavel");

  if (req.method === "OPTIONS") {
	  return res.status(200).end(); // responde o preflight
	}

  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido" });	  
  }

  const { user_id } = req.body;
  console.log("🔍 user_id recebido:", user_id);

  if (!user_id) {
    console.warn("⚠️ user_id ausente na requisição.");
    return res.status(400).json({ error: "user_id é obrigatório" });
  }

  try {
    console.log("🔎 Buscando stripe_customer_id para user_id...");
    const { data: fatura } = await supabase
      .from("faturas")
      .select("stripe_customer_id")
      .eq("user_id", user_id)
      .eq("tipo_fatura", "mensal")
      .maybeSingle();

    if (!fatura?.stripe_customer_id) {
      console.warn("⚠️ stripe_customer_id não encontrado para o usuário.");
      return res.status(404).json({ error: "Cliente não encontrado" });
    }

    console.log("🧾 Chamando criarFaturaVariavel para user_id:", user_id);
    const resultado = await criarFaturaVariavel(user_id, fatura.stripe_customer_id, stripe);

	if (resultado?.status === "sem_cobranca") {
	  console.log("🟡 Fatura não gerada: valor total muito baixo.");
	  return res.status(200).json({
		sucesso: true,
		mensagem: "Sem cobrança necessária",
		detalhes: resultado.detalhes,
		valorTotal: resultado.valorTotal
	  });
	}

	console.log("✅ Fatura criada com sucesso:", resultado.id);
	return res.status(200).json({
	  sucesso: true,
	  invoice_id: resultado.id,
	  mensagem: "Fatura variável criada com sucesso"
	});


  } catch (error: any) {
    console.error("❌ Erro ao criar fatura variável:", error);
    return res.status(500).json({ 
      sucesso: false,
      erro: error.message || "Erro desconhecido"
    });
  }
}
