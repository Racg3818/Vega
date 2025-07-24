"use client";

import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { useState } from "react";

ChartJS.register(
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler
);

export type LinhaGrafico = {
  data: string;
  indexador: string;
  isento: boolean;
  taxa_vega: number;
  taxa_plataforma: number;
};

interface Props {
  dados: LinhaGrafico[];
}

export default function Graficos({ dados }: Props) {
  const classes = ["CDI", "IPCA", "PRE"];
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState(() => new Date().toISOString().split("T")[0]);
  const [visiveis, setVisiveis] = useState<Record<string, boolean>>({
	  CDI: true,
	  IPCA: true,
	  PRE: true,
	});

  if (dados.length === 0) {
    return <p className="text-white">Nenhum dado disponível para exibir gráficos.</p>;
  }

  const gerarOpcoes = (titulo: string) => ({
    responsive: true,
    plugins: {
      legend: { position: "top" as const },
      title: { display: true, text: titulo },
    },
    scales: {
      y: {
        ticks: {
          callback: (value: number) => `${value.toFixed(1)}%`,
        },
      },
    },
  });

  const gerarDadosGrafico = (dados: LinhaGrafico[]) => {
    const dadosOrdenados = [...dados].sort(
      (a, b) => new Date(a.data).getTime() - new Date(b.data).getTime()
    );

    return {
      labels: dadosOrdenados.map((d) => d.data),
      datasets: [
        {
          label: "Comprado",
          data: dadosOrdenados.map((d) => d.taxa_vega),
          borderColor: "#10b981",
          backgroundColor: "#10b98155",
          tension: 0.3,
          fill: false,
        },
        {
          label: "Plataforma",
          data: dadosOrdenados.map((d) => d.taxa_plataforma),
          borderColor: "#f97316",
          backgroundColor: "#f9731655",
          tension: 0.3,
          fill: false,
        },
      ],
    };
  };

  const dentroDoPeriodo = (d: LinhaGrafico) => {
    if (dataInicio && new Date(d.data) < new Date(dataInicio)) return false;
    if (dataFim && new Date(d.data) > new Date(dataFim)) return false;
    return true;
  };

  const dadosFiltrados = dados.filter(dentroDoPeriodo);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white mb-4 border-b border-vega-accent pb-2">
        Dashboard de Compras
      </h1>

      {/* Filtro de período */}
      <div className="flex items-center gap-4 mb-4 text-white">
        <div>
          <label className="block text-sm mb-1">Data inicial</label>
          <input
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            className="px-2 py-1 rounded text-black"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Data final</label>
          <input
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            className="px-2 py-1 rounded text-black"
          />
        </div>
      </div>
	  
	  <div className="flex gap-2 text-white">
		  {classes.map((classe) => (
			<button
			  key={classe}
			  onClick={() =>
				setVisiveis((prev) => ({ ...prev, [classe]: !prev[classe] }))
			  }
			  className={`px-3 py-1 rounded ${
				visiveis[classe] ? "bg-green-600" : "bg-gray-600"
			  }`}
			>
			  {visiveis[classe] ? `Ocultar ${classe}` : `Mostrar ${classe}`}
			</button>
		  ))}
		</div>


      {classes.filter((classe) => visiveis[classe]).map((classe) => {

        const porClasse = dadosFiltrados.filter((d) => d.indexador === classe);
        const dadosIsento = porClasse.filter((d) => d.isento === true);
        const dadosNaoIsento = porClasse.filter((d) => d.isento === false);

        return (
          <div key={classe}>
            <h2 className="text-xl font-bold text-vega-accent mb-2">{classe}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* ISENTO */}
              <div className="bg-white p-4 rounded shadow">
                <h3 className="text-md font-semibold mb-2 text-gray-800">Isento de IR</h3>
                {dadosIsento.length > 0 ? (
                  <>
					  <Line
						options={gerarOpcoes("Isento")}
						data={gerarDadosGrafico(dadosIsento)}
					  />
					  {/* Comparativo abaixo do gráfico */}
					  <div className="mt-4 text-sm text-gray-800">
						{(() => {
						  const somaVega = dadosIsento.reduce((acc, cur) => acc + cur.taxa_vega, 0);
						  const somaPlataforma = dadosIsento.reduce((acc, cur) => acc + cur.taxa_plataforma, 0);
						  const mediaVega = somaVega / dadosIsento.length;
						  const mediaPlataforma = somaPlataforma / dadosIsento.length;
						  const ganho = mediaPlataforma > 0 ? ((mediaVega / mediaPlataforma - 1) * 100) : 0;

						  return (
							<p className="mt-2">
							  💰 Você está ganhando{" "}
							  <span className="font-bold text-green-600">
								{ganho.toFixed(2)}%
							  </span>{" "}
							  acima da média da plataforma nesse período.
							</p>
						  );
						})()}
					  </div>
					</>

                ) : (
                  <p className="text-gray-500 text-sm">Sem dados para mostrar</p>
                )}
              </div>

              {/* NÃO ISENTO + COMPARAÇÃO */}
              <div className="bg-white p-4 rounded shadow">
                <h3 className="text-md font-semibold mb-2 text-gray-800">Não Isento</h3>
                {dadosNaoIsento.length > 0 ? (
                  <>
                    <Line
                      options={gerarOpcoes("Não Isento")}
                      data={gerarDadosGrafico(dadosNaoIsento)}
                    />
                    {/* Comparativo abaixo do gráfico */}
                    <div className="mt-4 text-sm text-gray-800">
                      {(() => {
                        const somaVega = dadosNaoIsento.reduce((acc, cur) => acc + cur.taxa_vega, 0);
                        const somaPlataforma = dadosNaoIsento.reduce((acc, cur) => acc + cur.taxa_plataforma, 0);
                        const mediaVega = somaVega / dadosNaoIsento.length;
                        const mediaPlataforma = somaPlataforma / dadosNaoIsento.length;
                        const ganho = mediaPlataforma > 0 ? ((mediaVega / mediaPlataforma - 1) * 100) : 0;

                        return (
                          <p className="mt-2">
                            💰 Você está ganhando{" "}
                            <span className="font-bold text-green-600">
                              {ganho.toFixed(2)}%
                            </span>{" "}
                            acima da média da plataforma nesse período.
                          </p>
                        );
                      })()}
                    </div>
                  </>
                ) : (
                  <p className="text-gray-500 text-sm">Sem dados para mostrar</p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
