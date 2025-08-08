"use client";

import { useEffect, useState } from "react";
import { parse, differenceInBusinessDays, differenceInMonths } from "date-fns";
import { supabase } from "../lib/supabaseClient"; 

type Compra = {
  ativo: string;
  classe: string;
  taxaInformada: string;
  taxaEfetiva: string;
  valorMinimo: string;
  valorComprado: string;
  saldoAntesCompra: string;
  vencimento: string;
  horarioCompra: string;
};

function normalizarClasse(indexador: string): "PRE" | "POS" | "INFLACAO" {
  const idx = indexador.toUpperCase();
  if (idx === "CDI") return "POS";
  if (idx === "IPCA" || idx === "INFLAÇÃO" || idx === "INFLACAO") return "INFLACAO";
  if (idx === "PRE" || idx === "PRÉ") return "PRE";
  return "POS"; // fallback
}


export default function Investimentos() {
  const [dados, setDados] = useState<Compra[]>([]);
  const [filtrados, setFiltrados] = useState<Compra[]>([]);
  const [classeFiltro, setClasseFiltro] = useState("TODOS");
  const [prazoFiltro, setPrazoFiltro] = useState("TODOS");
  const [totalAplicado, setTotalAplicado] = useState(0);
  const [diasRestantes, setDiasRestantes] = useState<Record<string, number[]>>({ PRE: [], POS: [], INFLACAO: [] });
  const [rentabilidades, setRentabilidades] = useState<Record<string, number[]>>({ PRE: [], POS: [], INFLACAO: [] });


  useEffect(() => {
	  const carregarDados = async () => {
		const { data: comprasProcessadas, error } = await supabase
		  .from("ativos_comprados")
		  .select("*")
		  .order("data_hora_compra", { ascending: false });

		if (error) {
		  console.error("Erro ao buscar dados:", error.message);
		  return;
		}

		const formatados = comprasProcessadas.map((compra: any) => {
		  return {
			ativo: compra.nome_ativo,
			classe: normalizarClasse(compra.indexador),
			taxaInformada: compra.taxa_contratada,
			taxaEfetiva: compra.taxa_grossup,
			valorMinimo: `R$ ${Number(compra.valor_minimo).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
			valorComprado: `R$ ${Number(compra.valor_aplicado).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
			vencimento: new Date(compra.vencimento).toLocaleDateString("pt-BR"),
			horarioCompra: new Date(compra.data_hora_compra).toLocaleString("pt-BR"),
		  };
		});

		const total = formatados.reduce((acc, item) => {
		  const valor = Number(item.valorComprado.replace(/[R$\s.]/g, "").replace(",", "."));
		  return acc + valor;
		}, 0);

		const dias: Record<string, number[]> = { PRE: [], POS: [], INFLACAO: [] };
		const taxas: Record<string, number[]> = { PRE: [], POS: [], INFLACAO: [] };

		formatados.forEach((compra) => {
		  const vencimento = parse(compra.vencimento, "dd/MM/yyyy", new Date());
		  const hoje = new Date();
		  const diasUteis = differenceInBusinessDays(vencimento, hoje);
		  const classe = compra.classe.toUpperCase();
		  const taxaLimpa = parseFloat(compra.taxaEfetiva.replace(/[^0-9.,]/g, "").replace(",", "."));

		  dias[classe]?.push(diasUteis);
		  taxas[classe]?.push(taxaLimpa);
		});

		setDados(formatados);
		setFiltrados(formatados);
		setTotalAplicado(total);
		setDiasRestantes(dias);
		setRentabilidades(taxas);
	  };

	  carregarDados();
	}, []);

  // Atualiza a lista filtrada
  useEffect(() => {
    const hoje = new Date();
    const ativosFiltrados = dados.filter((compra) => {
      const vencimento = parse(compra.vencimento, "dd/MM/yyyy", new Date());
      const meses = differenceInMonths(vencimento, hoje);
      const classeOk = classeFiltro === "TODOS" || compra.classe.toUpperCase() === classeFiltro;
      const vencimentoOk =
        prazoFiltro === "TODOS" ||
        (prazoFiltro === "12" && meses <= 12) ||
        (prazoFiltro === "24" && meses <= 24) ||
        (prazoFiltro === "36" && meses <= 36) ||
		(prazoFiltro === "48" && meses <= 48) ||
        (prazoFiltro === "60+" && meses > 60);
      return classeOk && vencimentoOk;
    });

    setFiltrados(ativosFiltrados);
  }, [classeFiltro, prazoFiltro, dados]);

  const calcularMedia = (lista: number[]) =>
    lista.length ? (lista.reduce((a, b) => a + b, 0) / lista.length).toFixed(2) : "0,00";

  const calcularDias = (lista: number[]) =>
    lista.length ? `${Math.round(lista.reduce((a, b) => a + b, 0) / lista.length)} dias` : "0 dias";

  return (
    <div className="p-8 text-vega-text space-y-6 bg-vega-background">
      {/* Filtros */}
      <div className="flex flex-wrap gap-4 items-center justify-between mb-4">
        <div className="space-x-2">
          <label className="text-sm text-vega-textSoft">Classe:</label>
          <select
            value={classeFiltro}
            onChange={(e) => setClasseFiltro(e.target.value)}
            className="bg-vega-surface border border-vega-border p-2 rounded"
          >
            <option value="TODOS">Todos</option>
            <option value="PRE">Pré</option>
            <option value="POS">Pós</option>
            <option value="INFLACAO">Inflação</option>
          </select>
        </div>

        <div className="space-x-2">
          <label className="text-sm text-vega-textSoft">Vencimento:</label>
          <select
            value={prazoFiltro}
            onChange={(e) => setPrazoFiltro(e.target.value)}
            className="bg-vega-surface border border-vega-border p-2 rounded"
          >
            <option value="TODOS">Todos</option>
            <option value="12">Até 12 meses</option>
            <option value="24">Até 24 meses</option>
            <option value="36">Até 36 meses</option>
			<option value="48">Até 48 meses</option>
            <option value="60+">60+ meses</option>
          </select>
        </div>
      </div>

      {/* Resumos */}
      {filtrados.length > 0 && (
		  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
			<div className="bg-vega-surface rounded-xl p-6 shadow-inner space-y-4">
			  <h2 className="vega-label text-vega-accent uppercase tracking-wider">Investimentos</h2>
			  <div className="flex justify-between">
				<div>
				  <p className="text-xs text-vega-textSoft uppercase">Total Aplicado</p>
				  <p className="text-vega-accent text-xl font-bold">
					R$ {totalAplicado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
				  </p>
				</div>
				<div>
				  <p className="text-xs text-vega-textSoft uppercase">A vencer</p>
				  <p className="text-vega-accent text-xl font-bold">
					{filtrados.length} ativos
				  </p>
				</div>
			  </div>
			</div>

			<div className="bg-vega-surface rounded-xl p-6 shadow-inner space-y-4">
			  <h2 className="vega-label text-vega-accent uppercase tracking-wider">Rentabilidade Média</h2>
			  <div className="grid grid-cols-3 gap-4 text-center">
				<div>
				  <p className="text-xs text-vega-textSoft uppercase">Prefixados</p>
				  <p className="text-vega-accent font-bold text-lg">{calcularMedia(rentabilidades.PRE)}%</p>
				  <p className="text-xs text-vega-textSoft">{calcularDias(diasRestantes.PRE)}</p>
				</div>
				<div>
				  <p className="text-xs text-vega-textSoft uppercase">Inflação</p>
				  <p className="text-vega-accent font-bold text-lg">IPCA + {calcularMedia(rentabilidades.INFLACAO)}%</p>
				  <p className="text-xs text-vega-textSoft">{calcularDias(diasRestantes.INFLACAO)}</p>
				</div>
				<div>
				  <p className="text-xs text-vega-textSoft uppercase">Pós-fixados</p>
				  <p className="text-vega-accent font-bold text-lg">{calcularMedia(rentabilidades.POS)}% CDI</p>
				  <p className="text-xs text-vega-textSoft">{calcularDias(diasRestantes.POS)}</p>
				</div>
			  </div>
			</div>
		  </div>
		)}


      {/* Lista de ativos */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filtrados.map((ativo, index) => (
          <div
            key={index}
            className="bg-vega-surface border border-vega-border rounded-xl p-4 shadow hover:shadow-lg transition"
          >
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-vega-accent">{ativo.ativo}</h3>
              <span className="text-xs px-2 py-1 rounded bg-vega-background text-vega-textSoft border border-vega-border">
                {ativo.classe}
              </span>
            </div>
            <div className="text-sm space-y-1">
              <p><span className="text-vega-textSoft">Taxa Informada:</span> {ativo.taxaInformada}</p>
              <p><span className="text-vega-textSoft">Taxa com gross up:</span> {ativo.taxaEfetiva}</p>
              <p><span className="text-vega-textSoft">Valor Mínimo:</span> {ativo.valorMinimo}</p>
              <p><span className="text-vega-textSoft">Valor Comprado:</span> {ativo.valorComprado}</p>
              <p><span className="text-vega-textSoft">Vencimento:</span> {ativo.vencimento}</p>
              <p><span className="text-vega-textSoft">Data e hora da Compra:</span> {ativo.horarioCompra}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Rodapé */}
      <div className="bg-vega-surface rounded-xl p-6 text-center text-vega-textSoft text-sm">
        {filtrados.length === 0
          ? "Nenhum investimento encontrado com os filtros selecionados."
          : `${filtrados.length} investimento(s) carregado(s).`}
      </div>
    </div>
  );
}
