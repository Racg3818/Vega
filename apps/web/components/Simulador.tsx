// components/Simulador.tsx
import { useEffect, useState } from "react";
import { parseISO, differenceInMonths } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { CircleDollarSign, CalendarDays, Percent } from "lucide-react";

function calcularDiasUteis(inicio: Date, fim: Date, feriados: Date[]) {
  let count = 0;
  const current = new Date(inicio);

  while (current <= fim) {
    const dia = current.getDay();
    const isFinalDeSemana = dia === 0 || dia === 6;
    const isFeriado = feriados.some(
      (f) =>
        f.getDate() === current.getDate() &&
        f.getMonth() === current.getMonth() &&
        f.getFullYear() === current.getFullYear()
    );

    if (!isFinalDeSemana && !isFeriado) {
      count++;
    }

    current.setDate(current.getDate() + 1);
  }

  return count;
}

function calcularJurosCompostos(valorInicial: number, taxaAnual: number, diasUteis: number) {
  const anos = diasUteis / 252;
  return valorInicial * (Math.pow(1 + taxaAnual / 100, anos) - 1);
}

function formatarValor(valor: number): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Simulador() {
  const [valor, setValor] = useState(10000);
  const [valorInput, setValorInput] = useState(formatarValor(10000));
  const [taxa, setTaxa] = useState(17);
  const [vencimento, setVencimento] = useState("");
  const [feriados, setFeriados] = useState<Date[]>([]);
  const [tipoIndexador, setTipoIndexador] = useState("pre");
  const [cdi, setCdi] = useState<number | null>(null);
  const [ipca, setIpca] = useState<number | null>(null);
  const [mostrarResultado, setMostrarResultado] = useState(false);

  const hoje = new Date();
  const dataFim = vencimento ? parseISO(vencimento) : null;

  useEffect(() => {
    const dataValida = /^\d{4}-\d{2}-\d{2}$/.test(vencimento);
    const dataAnoValido = dataValida && new Date(vencimento).getFullYear() >= new Date().getFullYear();
    const valorValido = !isNaN(valor) && valor > 0;
    const taxaValida = !isNaN(taxa) && taxa > 0;

    if (dataAnoValido && valorValido && taxaValida) {
      setMostrarResultado(true);
    } else {
      setMostrarResultado(false);
    }
  }, [valor, vencimento, taxa]);

  useEffect(() => {
    if (!vencimento) return;
    const inicio = new Date();
    const fim = new Date(vencimento);
    const anos: number[] = [];

    for (let ano = inicio.getFullYear(); ano <= fim.getFullYear(); ano++) {
      anos.push(ano);
    }

    Promise.all(
      anos.map((ano) =>
        fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`)
          .then((res) => res.json())
          .catch(() => [])
      )
    ).then((respostas) => {
      const todasDatas = respostas.flat().map((f: any) => new Date(f.date));
      setFeriados(todasDatas);
    });
  }, [vencimento]);

  useEffect(() => {
    fetch("/api/taxas")
      .then((res) => res.json())
      .then((data) => {
        setCdi(data.cdi);
        setIpca(data.ipca);
      })
      .catch(() => {
        setCdi(11.81);
        setIpca(5.32);
      });
  }, []);

  const handleTipoIndexadorChange = (tipo: string) => {
    setTipoIndexador(tipo);
    if (tipo === "pre") setTaxa(17);
    if (tipo === "ipca") setTaxa(8);
    if (tipo === "pos") setTaxa(120);
    setMostrarResultado(false);
  };

  const diasUteis = dataFim ? calcularDiasUteis(hoje, dataFim, feriados) : 0;
  const diasCorridos = dataFim ? Math.ceil((dataFim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const meses = dataFim ? differenceInMonths(dataFim, hoje) : 0;

  let taxaEfetiva = taxa;
  if (tipoIndexador === "pos" && cdi !== null) taxaEfetiva = (cdi * taxa) / 100;
  if (tipoIndexador === "ipca" && ipca !== null) taxaEfetiva = ipca + taxa;

  let rendimentoBruto = 0;
  if (tipoIndexador === "ipca" && ipca !== null) {
    rendimentoBruto = calcularJurosCompostos(valor, taxaEfetiva, diasUteis);
  } else {
    rendimentoBruto = valor * (taxaEfetiva / 100) * (diasUteis / 252);
  }

  let aliquota = 0.225;
  if (diasCorridos > 180 && diasCorridos <= 360) aliquota = 0.20;
  else if (diasCorridos > 360 && diasCorridos <= 720) aliquota = 0.175;
  else if (diasCorridos > 720) aliquota = 0.15;

  const impostoRenda = rendimentoBruto * aliquota;
  const rendimentoLiquido = rendimentoBruto - impostoRenda;

  // 💰 NOVO CÁLCULO DE SERVIÇO
  const mensalidadeFixa = 20.0;
  let taxaMediaMercado = 0;

  if (tipoIndexador === "pre") {
    taxaMediaMercado = 15.5;
  } else if (tipoIndexador === "ipca" && ipca !== null) {
    taxaMediaMercado = ipca + 7.0;
  } else if (tipoIndexador === "pos" && cdi !== null) {
    taxaMediaMercado = (cdi * 110) / 100;
  }

  const diferencaPositiva = Math.max(taxaEfetiva - taxaMediaMercado, 0);
  const taxaVariavel = diferencaPositiva * 0.2 * valor / 100;
  const valorServico = mensalidadeFixa + taxaVariavel;

  return (
    <div className="vega-card space-y-8">
      <div className="bg-vega-background p-6 rounded-xl border border-vega-primary mb-6">
        <div className="flex flex-wrap gap-6 mb-6 items-center">
          {[
            { tipo: "pre", label: "Prefixado" },
            { tipo: "ipca", label: "IPCA+" },
            { tipo: "pos", label: "Pós-fixado" },
          ].map(({ tipo, label }) => (
            <label key={tipo} className="flex items-center gap-2 text-vega-textSoft">
              <input type="radio" name="indexador" value={tipo} checked={tipoIndexador === tipo} onChange={() => handleTipoIndexadorChange(tipo)} />
              {label}
            </label>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="vega-label flex items-center gap-2 mb-1"><CircleDollarSign className="w-4 h-4" /> Valor aplicado (R$)</label>
            <input type="text" value={valorInput} onChange={(e) => {
              const texto = e.target.value;
              setValorInput(texto);
              const valorNumerico = parseFloat(texto.replace(/\./g, "").replace(",", "."));
              if (!isNaN(valorNumerico)) setValor(valorNumerico);
            }} onBlur={() => setValorInput(formatarValor(valor))} className="bg-vega-surface text-vega-text p-3 rounded w-full" />
          </div>

          <div>
            <label className="vega-label flex items-center gap-2 mb-1"><Percent className="w-4 h-4" /> Taxa anual (%)</label>
            <input type="number" value={isNaN(taxa) ? '' : taxa} onChange={(e) => setTaxa(parseFloat(e.target.value))} className="bg-vega-surface text-vega-text p-3 rounded w-full" />
          </div>

          <div>
            <label className="vega-label flex items-center gap-2 mb-1"><CalendarDays className="w-4 h-4" /> Data de vencimento</label>
            <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} className="bg-vega-surface text-vega-text p-3 rounded w-full" />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {mostrarResultado && vencimento && dataFim && (
          <motion.div
            className="bg-vega-background p-8 rounded-xl border border-vega-primary shadow-xl"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} transition={{ duration: 0.4 }}
          >
            <h2 className="vega-title text-lg text-vega-accent mb-6 uppercase border-b border-vega-primary pb-2">Rendimento Bruto do CDB</h2>

            <div className="grid gap-3 text-sm max-w-2xl mx-auto">
			  {[
				["Meses até o vencimento:", `${meses} meses`],
				["Dias úteis no período:", `${diasUteis} dias`],
				["Rendimento anual efetivo:", `${formatarValor(taxaEfetiva)}%`],
				["Rendimento bruto:", `R$ ${formatarValor(rendimentoBruto)}`],
				["Imposto de renda:", `R$ ${formatarValor(impostoRenda)}`],
				["Rendimento líquido:", `R$ ${formatarValor(rendimentoLiquido)}`],
				["Total final (principal + rendimento):", `R$ ${formatarValor(valor + rendimentoBruto)}`],
			  ].map(([label, val], idx) => (
				<div className="flex justify-between" key={idx}>
				  <span>{label}</span>
				  <strong className={label.includes("Imposto") ? "text-orange-400" : "text-vega-accent"}>{val}</strong>
				</div>
			  ))}

			  {/* Separador visual */}
			  <div className="border-t border-vega-primary my-2" />

			  {[
				["Taxa média do mercado:", `${formatarValor(taxaMediaMercado)}%`],
				["Diferença para a média:", `${formatarValor(taxaEfetiva - taxaMediaMercado)}%`],
			  ].map(([label, val], idx) => (
				<div className="flex justify-between" key={`mercado-${idx}`}>
				  <span>{label}</span>
				  <strong className="text-vega-textSoft">{val}</strong>
				</div>
			  ))}
			</div>


            <div className="mt-8 p-4 rounded-md border border-vega-primary">
			  <h2 className="vega-label text-vega-accent mb-1">Valor do serviço</h2>
			  <div className="text-sm text-center text-vega-text space-y-1">
				<p><strong>Plano mensal:</strong> R$ {formatarValor(mensalidadeFixa)}</p>
				<p><strong>Taxa variável:</strong> R$ {formatarValor(taxaVariavel)}</p>
				<hr className="my-2 border-vega-primary" />
				<p><strong>Total:</strong> R$ {formatarValor(valorServico)}</p>
			  </div>
			  <p className="text-xs text-center text-vega-textSoft mt-2">
				A taxa variável representa 20% da diferença positiva entre a taxa obtida pelo vega do Vega e a taxa média de mercado, ambas no momento da compra, aplicada sobre o valor investido.
			  </p>
			</div>

          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-xs text-center text-vega-textSoft mt-6">* Simulação baseada nas condições informadas. Não constitui recomendação.</p>
    </div>
  );
}
