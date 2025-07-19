import { Banknote } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { SiSimpleanalytics } from "react-icons/si";
import { useState, useEffect } from "react";

import ProtectedLayout from "@/components/ProtectedLayout";
import Layout from "@/components/Layout";
import Simulador from "@/components/Simulador";
import Investimentos from "@/components/Investimentos";
import Posicoes from "@/components/Posicoes";
import Configuracoes from "@/components/Configuracoes";
import Graficos from "@/components/Graficos";
import Faturas from "@/components/Faturas";

import {
  FaUniversity,
  FaReceipt,
  FaCogs,
  FaQuestionCircle,
  FaSignOutAlt,
  FaTags,
} from "react-icons/fa";

export default function Dashboard() {
  
  const [telaAtiva, setTelaAtiva] = useState("graficos");
  const [menuAberto, setMenuAberto] = useState(true);
  const [usuario, setUsuario] = useState<any>(null);
  const { dados, loading } = useDadosTaxasComparadas(usuario?.id);
  
  
  useEffect(() => {
	  const inicializarVEGA_AUTH = async () => {
		const { data, error } = await supabase.auth.getSession();

		if (!data.session || !data.session.user) {
		  //setUsuario(data.session.user);
		  window.location.href = "/login";
		  return;
		}
		
		const user = data.session.user;
		setUsuario(user);

		const auth = {
		  access_token: data.session.access_token,
		  user_id: data.session.user.id,
		};

		window.VEGA_AUTH = auth;
		window.postMessage({ type: "VEGA_AUTH", ...auth }, "*");
		//console.log("🟢 VEGA_AUTH definido inicialmente e enviado via postMessage:", auth);
	  };

	  inicializarVEGA_AUTH();

	  const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
		 
		if (session) {
			setUsuario(session.user);
			 
		  const auth = {
			access_token: session.access_token,
			user_id: session.user.id,
		  };

		  window.VEGA_AUTH = auth;
		  window.postMessage({ type: "VEGA_AUTH", ...auth }, "*");
		  //console.log("🟢 VEGA_AUTH atualizado via onAuthStateChange e reenviado:", auth);
		}
	  });

	  return () => {
		listener.subscription.unsubscribe();
	  };
	}, []);

  const itemClass = (slug: string) =>
    `vega-menu-item transition-all duration-300 ease-in-out transform hover:scale-105 ${telaAtiva === slug ? "vega-menu-active" : ""}`;

  const iconClass = (active: boolean) => `text-vega-primary transition-all duration-300 ${active ? "text-vega-accent" : ""}`;

  const renderItem = (slug: string, Icon: any, label: string) => {
    const active = telaAtiva === slug;
    return (
      <li
        onClick={() => setTelaAtiva(slug)}
        className={
          menuAberto
            ? `${itemClass(slug)} flex items-center gap-2 cursor-pointer` 
            : `${itemClass(slug)} flex flex-col items-center justify-center cursor-pointer`
        }
      >
        <Icon className={`${iconClass(active)} ${menuAberto ? "w-4 h-4" : "w-6 h-6"}`} />
        <span
          className={`text-vega-text ${menuAberto ? "text-sm" : "text-[12px] mt-1 leading-tight text-center"}`}
        >
          {label}
        </span>
      </li>
    );
  };

  return (
	  <ProtectedLayout>
		<Layout>
		  <div className="flex min-h-screen">
			{/* Sidebar */}
			<aside
			  className={`${
				menuAberto ? "w-54" : "w-20"
			  } transition-[width] duration-500 ease-in-out bg-vega-surface p-2 flex flex-col border-r border-vega-primary shadow-xl overflow-hidden relative`}
			>

			  <button
				  onClick={() => setMenuAberto(!menuAberto)}
				  className="absolute top-4 ml-4 right-4 z-50 bg-vega-primary text-white p-1 rounded-full shadow hover:opacity-90 transition"
				>
				  {menuAberto ? "←" : "→"}
				</button>


			  {/* Logo no topo */}
			  <div
				  className="flex justify-center mt-8 items-center cursor-pointer"
				  onClick={() => setTelaAtiva("graficos")}
				>
				  <img
					  src={menuAberto ? "/images/logo-vega.png" : "/images/logo-vega-simbolo.png"}
					  alt="Logo Vega"
					  className={`transition-all duration-500 ease-in-out ${
						menuAberto ? "h-20" : "h-20"
					  }`}
					  />

				</div>


			  <div className="flex flex-col gap-8">
				{/* Perfil */}
				<div
				  className={`flex items-center gap-4 transition-all duration-200 ${
					menuAberto ? "opacity-100" : "opacity-0 h-0 overflow-hidden"
				  }`}
				>
				  <div className="w-12 h-12 rounded-full bg-vega-accent text-white flex items-center justify-center text-lg font-bold uppercase border-2 border-vega-accent">
					  {usuario?.user_metadata?.name
						?.split(" ")
						.slice(0, 2)
						.map((n) => n[0])
						.join("")}
					</div>

				  <div>
					<p className="text-sm text-vega-text font-semibold">Olá,</p>
					<p className="text-md text-vega-accent font-bold">{usuario?.user_metadata?.name}</p>
				  </div>
				</div>

				{/* Menu Navegação */}
				<nav className="space-y-8 text-sm">
				  <div>
					{menuAberto && (
					  <h3 className="uppercase text-vega-primary text-xs font-semibold mb-3 tracking-wider">
						Investimentos
					  </h3>
					)}
					<ul className="space-y-2">
					  {renderItem("investimentos", Banknote, "Investimentos")}
					  {renderItem("posicoes", FaUniversity, "Posições")}
					  {renderItem("simulador", SiSimpleanalytics, "Simulador")}
					  {renderItem("indicacoes", FaTags, "Indicações")}
					  {renderItem("faturas", FaReceipt, "Faturas")}
					</ul>
				  </div>
				  <div>
					{menuAberto && (
					  <h3 className="uppercase text-vega-primary text-xs font-semibold mb-3 tracking-wider">
						Conta
					  </h3>
					)}
					<ul className="space-y-2">
					  {renderItem("configuracoes", FaCogs, "Configurações")}
					  {renderItem("duvidas", FaQuestionCircle, "Dúvidas")}
					  <li
						  onClick={async () => {
							await supabase.auth.signOut();
							window.location.href = "/login";
						  }}
						  className={`${itemClass("sair")} flex items-center gap-2 cursor-pointer`}
						>
						  <FaSignOutAlt className={iconClass(false)} />
						  <span className="text-vega-text text-sm">Sair</span>
						</li>
					</ul>
				  </div>
				</nav>
			  </div>
			</aside>

			{/* Conteúdo principal */}
			<main
			  className="flex-1 px-10 py-8 space-y-6 bg-cover bg-center relative"
			  style={{ backgroundImage: "url('/images/vega-fundo.png')" }}
			>
			  <div className="absolute inset-0 bg-black bg-opacity-50 z-0"></div>
			  <div className="relative z-10">
			  
			  {telaAtiva === "graficos" && (
				  <div className="vega-card">
					<Graficos dados={dados} />
				  </div>
				)}				
				{telaAtiva === "simulador" && (
				  <div className="vega-card">
					<Simulador />
				  </div>
				)}

				{telaAtiva === "investimentos" && (
				  <div className="vega-card">
					<Investimentos />
				  </div>
				)}
				
				{telaAtiva === "posicoes" && (
				  <div className="vega-card">
					<Posicoes />
				  </div>
				)}
				
				{telaAtiva === "indicacoes" && <div className="vega-card">🎁 Área de Indicações</div>}
				{telaAtiva === "faturas" && (
				  <div className="vega-card">
					<Faturas />
				  </div>
				)}

				{telaAtiva === "configuracoes" && (
				  <div className="vega-card">
					<Configuracoes />
				  </div>
				)}
				{telaAtiva === "duvidas" && <div className="vega-card">❓ FAQ e suporte</div>}				
			  </div>
			</main>
		  </div>
		</Layout>
	</ProtectedLayout>
  );
}

type LinhaGrafico = {
  data: string;
  indexador: string;
  isento: boolean;
  taxa_vega: number;
  taxa_plataforma: number;
};

export function useDadosTaxasComparadas(userId: string | undefined) {
  const [dados, setDados] = useState<LinhaGrafico[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    const buscarDados = async () => {
      setLoading(true);

      const { data: comprados, error: err1 } = await supabase
        .from("ativos_comprados")
        .select("data_hora_compra, indexador, taxa_contratada, valor_aplicado, taxa_grossup")
        .eq("user_id", userId);

      const { data: taxasRef, error: err2 } = await supabase
        .from("taxas_media_xp")
        .select("data_referencia, indexador, isento_imposto, taxa_media");

      if (err1 || err2) {
        console.error("Erro ao buscar dados", err1 || err2);
        return;
      }

      const agrupados: Record<string, { soma: number; peso: number }> = {};

      comprados.forEach((c) => {
        const isento = c.taxa_grossup?.toLowerCase().includes("isento");
        const data = c.data_hora_compra?.split("T")[0]; // pega apenas a data
		const key = `${data}|${c.indexador}|${isento}`;
        const taxa = parseFloat(c.taxa_grossup?.toString() || "0");
        const valor = Number(c.valor_aplicado) || 0;

        if (!agrupados[key]) agrupados[key] = { soma: 0, peso: 0 };
        agrupados[key].soma += taxa * valor;
        agrupados[key].peso += valor;
      });

      const dadosVega = Object.entries(agrupados).map(([key, { soma, peso }]) => {
		  const [data, indexador, isento] = key.split("|");
		  const indexadorUpper = indexador.toUpperCase();
		  const isentoBool = isento === "true";
		  const taxa_vega = peso > 0 ? soma / peso : 0;

		  const taxa_plat = taxasRef.find((t) => {
			const matchData = t.data_referencia?.slice(0, 10) === data;
			const matchIndexador = t.indexador?.toUpperCase() === indexadorUpper;
			const matchIsento = t.isento_imposto === isentoBool;

			if (!matchData || !matchIndexador || !matchIsento) {
			  console.log("❌ Não bateu:", {
				referencia: t.data_referencia,
				esperado_data: data,
				matchData,

				indexador: t.indexador,
				esperado_indexador: indexadorUpper,
				matchIndexador,

				isento_imposto: t.isento_imposto,
				esperado_isento: isentoBool,
				matchIsento,
			  });
			}

			return matchData && matchIndexador && matchIsento;
		  });

		  if (!taxa_plat) {
			console.warn("⚠️ Nenhuma taxa encontrada para:", {
			  data,
			  indexador: indexadorUpper,
			  isento: isentoBool,
			});
		  } else {
			console.log("✅ Taxa encontrada:", {
			  data,
			  indexador: indexadorUpper,
			  isento: isentoBool,
			  taxa_media: taxa_plat.taxa_media,
			});
		  }

		  return {
			data,
			indexador: indexadorUpper,
			isento: isentoBool,
			taxa_vega: parseFloat(taxa_vega.toFixed(2)),
			taxa_plataforma:
			  taxa_plat && taxa_plat.taxa_media
				? parseFloat(
					typeof taxa_plat.taxa_media === "string"
					  ? taxa_plat.taxa_media.replace(/[^\d.]/g, "")
					  : taxa_plat.taxa_media.toFixed(2)
				  )
				: 0,

		  };
		});

      setDados(dadosVega);
      setLoading(false);
    };

    buscarDados();
  }, [userId]);

  return { dados, loading };
}
