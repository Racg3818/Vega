"use client";

import { useEffect, useState } from "react";
import { parse, differenceInBusinessDays } from "date-fns";
import { supabase } from "../lib/supabaseClient";


type Compra = {
  ativo: string;
  banco: string;
  classe: string;
  taxaEfetiva: string;
  valorComprado: string;
  vencimento: string;
};

type PosicaoBanco = {
  banco: string;
  valorAtual: number;
  valorFuturo: number;
  percentual: number;
  fgcAtual: boolean;
  fgcFuturo: boolean;
  taxaMedia: number;
  vencimentoMedio: string;
};

export default function Posicoes() {
  const [posicoes, setPosicoes] = useState<PosicaoBanco[]>([]);
  const [totalAtual, setTotalAtual] = useState(0);
  const [bancoSelecionado, setBancoSelecionado] = useState("TODOS");
  const [bancosUnicos, setBancosUnicos] = useState<string[]>([]);
  const [cdi, setCdi] = useState(0.11);
  const [ipca, setIpca] = useState(0.05);

  function extrairBanco(ativo: string): string {
    const partes = ativo.split("-");
    if (!partes.length) return "Outro";
    const nomeCompleto = partes[0].trim();
    const semTipo = nomeCompleto.replace(/^(CDB|LCI|LCA|LC|CRI|CRA|Debênture|Tesouro)\s*/i, "");
    return semTipo.trim() || "Outro";
  }

  function calcularValorFuturo(valor: number, taxaAnual: number, diasUteis: number) {
    const taxaDiaria = Math.pow(1 + taxaAnual, 1 / 252) - 1;
    return valor * Math.pow(1 + taxaDiaria, diasUteis);
  }

  useEffect(() => {
    fetch("/api/taxas")
      .then((res) => res.json())
      .then((taxas) => {
        setCdi(typeof taxas.cdi === "number" ? taxas.cdi / 100 : 0.11);
        setIpca(typeof taxas.ipca === "number" ? taxas.ipca / 100 : 0.05);
      });
  }, []);

  useEffect(() => {
    const carregarDados = async () => {
      const { data: compras, error } = await supabase
        .from("ativos_comprados")
        .select("*");

      if (error) {
        console.error("Erro ao buscar ativos:", error.message);
        return;
      }

      const formatados: Compra[] = compras.map((compra: any) => ({
        ativo: compra.nome_ativo,
        banco: extrairBanco(compra.nome_ativo),
        classe: compra.indexador.toUpperCase(),
        taxaEfetiva: compra.taxa_contratada,
        valorComprado: `R$ ${Number(compra.valor_aplicado).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        vencimento: new Date(compra.vencimento).toLocaleDateString("pt-BR")
      }));

      const agrupados: Record<string, { totalAtual: number; totalFuturo: number; taxas: number[]; dias: number[] }> = {};
      let totalGeralAtual = 0;

      formatados.forEach((compra) => {
        const banco = compra.banco;
        const classeBruta = compra.classe.toUpperCase();
		const classe = classeBruta === "CDI" ? "POS" : classeBruta;

		let taxa = 0;
		
        if (classe === "INFLACAO") {
		  const match = compra.taxaEfetiva?.replace(/[^\d,.-]/g, "").match(/[\d,]+/);
		  const spread = match ? parseFloat(match[0].replace(",", ".")) / 100 : 0;
		  taxa = ipca + spread;
		} else if (classe === "POS") {
		  const match = compra.taxaEfetiva?.replace(/[^\d,.-]/g, "").match(/[\d,]+/);
		  const percentualCDI = match ? parseFloat(match[0].replace(",", ".")) / 100 : 1;
		  taxa = cdi * percentualCDI;
		} else if (classe === "PRE") {
		  const match = compra.taxaEfetiva?.replace(/[^\d,.-]/g, "").match(/[\d,]+/);
		  taxa = match ? parseFloat(match[0].replace(",", ".")) / 100 : 0;
		}

        const valorAtual = parseFloat(compra.valorComprado.replace("R$", "").replace(/\./g, "").replace(",", ".").trim());
        const vencimento = parse(compra.vencimento, "dd/MM/yyyy", new Date());
        const dias = differenceInBusinessDays(vencimento, new Date());
        const valorFuturo = calcularValorFuturo(valorAtual, taxa, dias);

        if (!agrupados[banco]) agrupados[banco] = { totalAtual: 0, totalFuturo: 0, taxas: [], dias: [] };

        agrupados[banco].totalAtual += valorAtual;
        agrupados[banco].totalFuturo += valorFuturo;
        agrupados[banco].taxas.push(taxa);
        agrupados[banco].dias.push(dias);

        totalGeralAtual += valorAtual;
      });

      const lista: PosicaoBanco[] = Object.entries(agrupados).map(([banco, dados]) => {
        const taxaMedia = dados.taxas.reduce((a, b) => a + b, 0) / dados.taxas.length;
        const diasMedios = dados.dias.reduce((a, b) => a + b, 0) / dados.dias.length;
        const vencimentoEstimado = new Date();
        vencimentoEstimado.setDate(vencimentoEstimado.getDate() + diasMedios);

        return {
          banco,
          valorAtual: dados.totalAtual,
          valorFuturo: dados.totalFuturo,
          percentual: (dados.totalAtual / totalGeralAtual) * 100,
          fgcAtual: dados.totalAtual <= 250000,
          fgcFuturo: dados.totalFuturo <= 250000,
          taxaMedia,
          vencimentoMedio: vencimentoEstimado.toLocaleDateString("pt-BR")
        };
      });

      setPosicoes(lista);
      setTotalAtual(totalGeralAtual);
      setBancosUnicos(["TODOS", ...Object.keys(agrupados).sort()]);
    };

    carregarDados();
  }, [cdi, ipca]);

  const posicoesFiltradas = bancoSelecionado === "TODOS"
    ? posicoes
    : posicoes.filter((p) => p.banco === bancoSelecionado);

  const totalAtualFiltrado = posicoesFiltradas.reduce((acc, p) => acc + p.valorAtual, 0);
  const totalFuturoFiltrado = posicoesFiltradas.reduce((acc, p) => acc + p.valorFuturo, 0);

  return (
    <div className="p-8 text-vega-text space-y-6 bg-vega-background">
      <h2 className="vega-label text-vega-accent uppercase tracking-wider">Posições por Banco Emissor</h2>

      <div className="flex flex-wrap gap-6 items-center justify-between mb-4">
        <div>
          <label className="text-sm text-vega-textSoft mr-2">Filtrar por Banco:</label>
          <select
            value={bancoSelecionado}
            onChange={(e) => setBancoSelecionado(e.target.value)}
            className="bg-vega-surface border border-vega-border p-2 rounded"
          >
            {bancosUnicos.map((banco, idx) => (
              <option key={idx} value={banco}>{banco}</option>
            ))}
          </select>
        </div>
        <div className="text-base font-medium space-x-6">
          <span>
            <span className="text-white">Valor Atual Total:</span>{" "}
            <span className="text-vega-accent">
              R$ {totalAtualFiltrado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
          </span>
          <span>
            <span className="text-white">Valor no Vencimento Total (*):</span>{" "}
            <span className="text-vega-accent">
              R$ {totalFuturoFiltrado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
          </span>
        </div>
      </div>

      {posicoesFiltradas.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-left text-vega-text border border-vega-border rounded-xl">
            <thead className="bg-vega-surface border-b border-vega-border uppercase text-xs text-vega-textSoft">
              <tr>
                <th className="px-4 py-3">Banco</th>
                <th className="px-4 py-3">Valor Atual</th>
                <th className="px-4 py-3">Valor no Vencimento (*)</th>
                <th className="px-4 py-3">% do Total</th>
                <th className="px-4 py-3">Taxa Média</th>
                <th className="px-4 py-3">Vencimento Médio</th>
                <th className="px-4 py-3">FGC Hoje</th>
                <th className="px-4 py-3">FGC Futuro</th>
              </tr>
            </thead>
            <tbody>
              {posicoesFiltradas.map((p, idx) => (
                <tr key={idx} className="border-b border-vega-border hover:bg-vega-hover transition">
                  <td className="px-4 py-2 font-medium">{p.banco}</td>
                  <td className="px-4 py-2">R$ {p.valorAtual.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2">R$ {p.valorFuturo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2">{p.percentual.toFixed(2)}%</td>
                  <td className="px-4 py-2">{(p.taxaMedia * 100).toFixed(2)}%</td>
                  <td className="px-4 py-2">{p.vencimentoMedio}</td>
                  <td className="px-4 py-2">{p.fgcAtual ? "✔️ Sim" : "❌ Não"}</td>
                  <td className="px-4 py-2">{p.fgcFuturo ? "✔️ Sim" : "❌ Não"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-vega-surface p-6 rounded-xl text-center text-vega-textSoft">
          Nenhuma posição encontrada.
        </div>
      )}

      <div className="text-xs text-vega-textSoft mt-4">
        ⚠️ (*) As projeções de CDI e IPCA são estimativas com base no Boletim Focus e podem sofrer alterações ao longo dos próximos meses. Os valores futuros apresentados são apenas simulações.
      </div>
    </div>
  );
}
