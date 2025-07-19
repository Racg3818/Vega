import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
  try {
    const agora = new Date();
    const offsetMS = 3 * 60 * 60 * 1000; // UTC-3
    const brasilAgora = new Date(agora.getTime() - offsetMS);
    const inicio = new Date(Date.UTC(
      brasilAgora.getUTCFullYear(),
      brasilAgora.getUTCMonth(),
      brasilAgora.getUTCDate()
    ));
    const fim = new Date(inicio);
    fim.setUTCDate(fim.getUTCDate() + 1);
	
	console.log("✅ Supabase client instanciado com:", {
	  url: supabaseUrl,
	  keyPrefix: supabaseKey.slice(0, 6) + "...",
	});
	
	const { data: compras, error } = await supabase
      .from("ativos_comprados")
      .select(`
        user_id,
        nome_ativo,
        indexador,
        taxa_contratada,
        taxa_grossup,
        valor_minimo,
        valor_aplicado,
        vencimento,
        data_hora_compra
      `)
      .gte("data_hora_compra", inicio.toISOString())
      .lt("data_hora_compra", fim.toISOString());

    if (error) {
      console.error("Erro ao buscar ativos:", error);
      return new Response("Erro ao buscar ativos", { status: 500 });
    }

    if (!compras || compras.length === 0) {
      console.log("Nenhuma compra encontrada hoje.");
      return new Response("Nenhuma compra hoje", { status: 200 });
    }

    const usuariosUnicos = [...new Set(compras.map((c) => c.user_id))];
    let perfis: any[] = [];

    try {
      const resultado = await supabase.rpc("buscar_emails_por_ids", { ids: usuariosUnicos });
      perfis = resultado.data;
	  
      const erroPerfis = resultado.error;

      if (erroPerfis) {
        console.error("Erro ao buscar e-mails (dentro do try):", JSON.stringify(erroPerfis));
        return new Response(JSON.stringify({
          sucesso: false,
          erro: erroPerfis.message || erroPerfis
        }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    } catch (err) {
      console.error("Erro inesperado ao chamar RPC buscar_emails_por_ids:", String(err));
      return new Response(JSON.stringify({
        sucesso: false,
        erro: String(err)
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const perfilMap = new Map(perfis.map((p: any) => [p.id, { email: p.email, nome: p.nome }]));
	
    for (const userId of usuariosUnicos) {
		
	  const perfil = perfilMap.get(userId);
  
	  if (!perfil || !perfil.email) {
		console.warn("Perfil não encontrado para o usuário:", userId);
		continue;
	  }

	  const { email, nome } = perfil;
	  
	  const nome_usuario = perfil.nome?.split(" ")[0] || "cliente"; 

      const ativosDoUsuario = compras.filter((c) => c.user_id === userId);
      const ativosFormatados = ativosDoUsuario.map(a => ({
        nome_ativo: a.nome_ativo,
        indexador: a.indexador,
        taxa_contratada: a.taxa_contratada,
        taxa_grossup: a.taxa_grossup,
        valor_aplicado: `R$ ${Number(a.valor_aplicado).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        valor_minimo: `R$ ${Number(a.valor_minimo).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        vencimento: new Date(a.vencimento).toISOString().split("T")[0],
        data_hora_compra: new Date(a.data_hora_compra).toLocaleString("pt-BR")
      }));

      const response = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          to: email,
          tipo: "resumo",
          nome: nome_usuario,
          ativos: ativosFormatados
        }),
      });
	  console.log("Ativos resgistrados",ativosFormatados)
      console.log("E-mail enviado para:", email);
    }

    return new Response(JSON.stringify({
      status: "sucesso",
      total_emails: usuariosUnicos.length
    }), { status: 200 });

  } catch (err) {
    console.error("Erro na função enviar-resumos-diarios:", err);
    return new Response("Erro interno no servidor", { status: 500 });
  }
});
