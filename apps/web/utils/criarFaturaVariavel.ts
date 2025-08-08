// utils/criarFaturaVariavel.ts
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface DetalheCalculo {
  ativo: string;
  indexador: string;
  isento: boolean;
  taxaContratada: number;
  taxaMedia: number;
  diferenca: number;
  taxaVariavel: number;
  valorAplicado: number;
  valorCobranca: number;
}

export async function criarFaturaVariavel(user_id: string, stripeCustomerId: string, stripe: Stripe) {
  console.log("📆 Iniciando cálculo da fatura variável para:", user_id);
  
  const hoje = new Date();
  const inicioDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const fimDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1);
  const dataReferencia = inicioDia.toISOString().split("T")[0];
  const detalhesCalculos: DetalheCalculo[] = [];
  
  try{

  
	  console.log("📅 Período da busca:", inicioDia.toISOString(), "até", fimDia.toISOString());

	  // Buscar compras feitas hoje
	  const { data: compras, error: erroCompras } = await supabase
		.from("ativos_comprados")
		.select("*")
		.eq("user_id", user_id)
		.gte("data_hora_compra", inicioDia.toISOString())
		.lt("data_hora_compra", fimDia.toISOString());

	  if (erroCompras) {
		console.error("❌ Erro ao buscar compras:", erroCompras.message || erroCompras);
		throw new Error("Erro ao buscar compras.");
	  }

	  if (!compras || compras.length === 0) {
		console.warn("⚠️ Nenhuma compra encontrada para o dia.");
		throw new Error("Nenhuma compra encontrada para gerar a fatura variável.");
	  }

	  console.log(`📦 Compras encontradas: ${compras.length}`);
	  
	  // DEBUG: Mostrar estrutura das compras
	  console.log("🔍 DEBUG - Estrutura das compras:");
	  compras.forEach((compra, i) => {
		console.log(`  Compra ${i + 1}:`, {
		  nome_ativo: compra.nome_ativo,
		  indexador: compra.indexador,
		  taxa_contratada: compra.taxa_contratada,
		  taxa_grossup: compra.taxa_grossup,
		  valor_aplicado: compra.valor_aplicado
		});
	  });

	  // Buscar taxas médias
	  const { data: taxas, error: erroTaxas } = await supabase
		.from("taxas_media_xp")
		.select("indexador, taxa_media, isento_imposto")
		.eq("data_referencia", dataReferencia)
		.eq("user_id", user_id);

	  if (erroTaxas) {
		console.error("❌ Erro ao buscar taxas médias:", erroTaxas.message || erroTaxas);
		throw new Error("Erro ao buscar taxas médias.");
	  }

	  console.log(`📊 Taxas médias encontradas: ${taxas?.length || 0}`);
	  
	  // DEBUG: Mostrar taxas médias encontradas
	  console.log("🔍 DEBUG - Taxas médias disponíveis:");
	  taxas?.forEach((taxa, i) => {
		console.log(`  Taxa ${i + 1}:`, {
		  indexador: taxa.indexador,
		  taxa_media: taxa.taxa_media,
		  isento_imposto: taxa.isento_imposto
		});
	  });

	  let valorTotal = 0;

	  for (let i = 0; i < compras.length; i++) {
		const compra = compras[i];
		
		console.log(`\n🔄 Processando compra ${i + 1}: ${compra.nome_ativo}`);
		
		// CORREÇÃO 1: Identificação correta de isenção (APENAS pelo nome do ativo)
		const nomeAtivo = (compra.nome_ativo || "").toUpperCase();
		const isIsento = nomeAtivo.includes("LCA") || nomeAtivo.includes("LCI") || nomeAtivo.includes("LCD");
		
		// taxa_grossup existe para TODOS os ativos tributados, não indica isenção!
		
		console.log(`   🏷️  Nome do ativo: ${compra.nome_ativo}`);
		console.log(`   🔍 É LCA/LCI/LCD: ${isIsento} | Tem taxa_grossup: ${compra.taxa_grossup != null}`);
		
		// CORREÇÃO 2: Usar APENAS a taxa contratada original (nunca gross up)
		let taxaContratada = 0;
		
		if (compra.taxa_contratada) {
		  const match = compra.taxa_contratada.match(/([\d,\.]+)/);
		  taxaContratada = match ? parseFloat(match[1].replace(",", ".")) : 0;
		  console.log(`   📈 Taxa contratada original: ${taxaContratada}%`);
		} else {
		  console.warn(`   ⚠️  taxa_contratada não encontrada para ${compra.nome_ativo}`);
		}
		
		console.log(`   🎯 Procurando taxa média para: indexador="${compra.indexador}", isento_imposto=${isIsento}`);
		
		const taxaRef = taxas?.find(
		  (t) => t.indexador.toLowerCase() === compra.indexador.toLowerCase() && t.isento_imposto === isIsento
		);

		if (!taxaRef) {
		  console.warn(`   ⚠️  Taxa média não encontrada para indexador ${compra.indexador} (isento: ${isIsento})`);
		  
		  // DEBUG: Mostrar o que está disponível
		  console.log("   🔍 Taxas disponíveis para comparação:");
		  taxas?.forEach(t => {
			console.log(`      - ${t.indexador} (isento: ${t.isento_imposto}) = ${t.taxa_media}`);
		  });
		  
		  continue;
		}

		// CORREÇÃO 3: Melhorar extração da taxa média
		let taxaMedia = 0;
		if (taxaRef.taxa_media) {
		  const normalizado = taxaRef.taxa_media
			.replace("do CDI", "")
			.replace("%", "")
			.replace(",", ".")
			.trim();

		  taxaMedia = parseFloat(normalizado);
		}

		
		console.log(`   📊 Taxa média encontrada: ${taxaRef.taxa_media} → ${taxaMedia}%`);
		
		const diferenca = Math.max(taxaContratada - taxaMedia, 0);
		const taxaVariavel = (0.2 * diferenca) / 100;
		const valorAplicado = compra.valor_aplicado || 0;
		const valor = valorAplicado * taxaVariavel;

		const detalhe = {
		  ativo: compra.nome_ativo,
		  indexador: compra.indexador,
		  isento: isIsento,
		  taxaContratada: taxaContratada,
		  taxaMedia: taxaMedia,
		  diferenca: diferenca,
		  taxaVariavel: taxaVariavel,
		  valorAplicado: valorAplicado,
		  valorCobranca: valor
		};

		detalhesCalculos.push(detalhe);
		
		console.log(`   ➡️  Cálculo detalhado:`, {
		  taxaContratada: `${taxaContratada}%`,
		  taxaMedia: `${taxaMedia}%`,
		  diferenca: `${diferenca}%`,
		  taxaVariavel: `${(taxaVariavel * 100).toFixed(4)}%`,
		  valorAplicado: `R$ ${valorAplicado.toFixed(2)}`,
		  valorCobranca: `R$ ${valor.toFixed(2)}`
		});

		valorTotal += valor;
	  }

	  valorTotal = Math.round(valorTotal * 100) / 100;
	  
	  console.log("\n📋 RESUMO DOS CÁLCULOS:");
	  console.log("=".repeat(50));
	  detalhesCalculos.forEach((d, i) => {
		console.log(`${i + 1}. ${d.ativo}`);
		console.log(`   Taxa contratada: ${d.taxaContratada}% | Média: ${d.taxaMedia}%`);
		console.log(`   Diferença: ${d.diferenca}% | Cobrança: R$ ${d.valorCobranca.toFixed(2)}`);
	  });
	  console.log("=".repeat(50));
	  console.log(`💰 VALOR TOTAL: R$ ${valorTotal.toFixed(2)}`);

	  if (valorTotal < 0.01) {
		  console.log("⚠️ Valor muito baixo. Detalhes dos cálculos salvos para análise.");
		  return { status: "sem_cobranca", detalhes: detalhesCalculos, valorTotal };
		}

	  
	  const { data: registroFatura, error: erroRegistro } = await supabase
		  .from("faturas_historico")
		  .insert([{
			data_criacao: new Date(),
			tipo: "variavel",
			status: "paid",
			valor: valorTotal,
			detalhes_fatura: detalhesCalculos,
			pago: true,
			user_id: user_id
		  }])
		  .select()
		  .single();

		if (erroRegistro) {
		  console.error("❌ Erro ao salvar histórico da fatura:", erroRegistro.message);
		  throw new Error("Falha ao registrar histórico da fatura.");
		}


	  // Criar fatura no Stripe
	  const stripeInvoice = await stripe.invoices.create({
		customer: stripeCustomerId,
		collection_method: "charge_automatically",
		metadata: {
		  user_id,
		  tipo_fatura: "variavel",
		  fatura_id: registroFatura.id
		},
		auto_advance: true,
	  });

	  console.log("🧾 Fatura Stripe criada:", stripeInvoice.id);

	  await stripe.invoiceItems.create({
		customer: stripeCustomerId,
		amount: Math.round(valorTotal * 100),
		currency: "brl",
		description: "Taxa variável Vega - rendimento acima da média da plataforma",
		invoice: stripeInvoice.id,
	  });
	  
	  // Registrar fatura principal vinculando ao histórico
		const { data: faturaPrincipal, error: erroFatura } = await supabase
		  .from("faturas")
		  .insert([{
			user_id,
			stripe_customer_id: stripeCustomerId,
			stripe_subscription_id: null,
			stripe_invoice_id: stripeInvoice.id,
			valor: valorTotal,
			tipo_fatura: "variavel",
			status: "ativa",
			problema_pagamento: false,
			criado_em: new Date().toISOString()
		  }])
		  .select()
		  .single();


		if (erroFatura || !faturaPrincipal) {
		  console.error("❌ Erro ao registrar fatura principal:", erroFatura?.message || "Fatura não criada");
		  throw new Error("Falha ao registrar fatura principal.");
		}


		
		await supabase
		  .from("faturas_historico")
		  .update({ fatura_id: faturaPrincipal.id })
		  .eq("id", registroFatura.id);


	  console.log("✅ Item da fatura criado com sucesso.");
	  return stripeInvoice;
	  
	} catch (erro) {
	  console.error("❌ Erro inesperado ao criar fatura variável:", erro);
	  throw new Error("Erro inesperado ao criar fatura variável.");
		}
}