import React, { useEffect, useState } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";
import CryptoJS from "crypto-js";
import { supabase } from "../lib/supabaseClient";

const vencimentos = ["ate_6_meses", "ate_1_ano", "ate_2_anos", "ate_3_anos", "ate_5_anos", "acima_5_anos"];
const liquidez = ["diaria", "no_venc", "carencia"];
const indexadores = ["pre_fixado", "ipca", "cdi"];
const aplicacaoMinima = ["ate_5k", "ate_10k", "ate_50k", "acima_50k"];
const outros = ["publico_geral", "garantia_fgc", "isento_ir", "investidor_qualificado", "investidor_profissional", "oferta_primaria"];

const labelIndexador: Record<string, string> = {
  cdi: "Taxa Min. CDI (%)",
  ipca: "Taxa Min. IPCA (%)",
  pre_fixado: "Taxa Min. Prefixado (%)",
};

export default function Configuracoes() {
  const [copiado, setCopiado] = useState(false);
  const [assinatura, setAssinatura] = useState("");
  const [limiteCompra, setLimiteCompra] = useState(10000);
  const [ordem, setOrdem] = useState(["cdi", "ipca", "pre_fixado"]);
  const [taxas, setTaxas] = useState({ cdi: 120, ipca: 8, pre_fixado: 17 });
  const [selecionados, setSelecionados] = useState<any>({});
  const [status, setStatus] = useState<"idle" | "sucesso" | "erro">("idle");
  const [mostrarAssinatura, setMostrarAssinatura] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [temPagamento, setTemPagamento] = useState(false);
  const [temFiltro, setTemFiltro] = useState(false);
  const [temFatura, setTemFatura] = useState(false);
  const [statusPermissao, setStatusPermissao] = useState<any>(null);
  const [verificandoPagamento, setVerificandoPagamento] = useState(true);

  const categorias = [
    { titulo: "Vencimento", chave: "vencimento", opcoes: vencimentos },
    { titulo: "Liquidez", chave: "liquidez", opcoes: liquidez },
    { titulo: "Indexador", chave: "indexador", opcoes: indexadores },
    { titulo: "Aplicação Mínima", chave: "aplicacao_minima", opcoes: aplicacaoMinima },
    { titulo: "Outros", chave: "outros", opcoes: outros },
  ];  

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data?.user);
    });
  }, []);
  
  // Função para verificar status da assinatura e forma de pagamento
  const verificarStatusPagamento = async (userId: string) => {
    try {
      setVerificandoPagamento(true);
      
      const res = await fetch(`/api/assinatura?user_id=${encodeURIComponent(userId)}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" }
      });

      if (res.ok) {
        const permissaoData = await res.json();
        console.log("🔐 Status de permissão:", permissaoData);
        setStatusPermissao(permissaoData);
        
        // Usuario tem permissão se:
        // 1. Tem assinatura ativa com método de pagamento válido
        // 2. OU tem assinatura cancelada mas ainda no período ativo
        const temPermissao = permissaoData.permitido === true;
        setTemPagamento(temPermissao);
        
        return temPermissao;
      } else {
        console.error("❌ Erro ao verificar permissão:", res.status);
        setStatusPermissao({ permitido: false, motivo: "erro_api" });
        setTemPagamento(false);
        return false;
      }
    } catch (err) {
      console.error("❌ Erro ao verificar status de pagamento:", err);
      setStatusPermissao({ permitido: false, motivo: "erro_network" });
      setTemPagamento(false);
      return false;
    } finally {
      setVerificandoPagamento(false);
    }
  };

  useEffect(() => {
    if (!user?.id) return;

    const carregarFiltros = async () => {
      // Verifica filtros
      const { data: filtrosData } = await supabase
        .from("filtros")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (filtrosData) {
        setTemFiltro(true);
        setLimiteCompra(filtrosData.limite_compra || 10000);
        setOrdem(filtrosData.ordem_classe || ["cdi", "ipca", "pre_fixado"]);
        setTaxas(filtrosData.taxa_minima || { cdi: 105, ipca: 7, pre_fixado: 13 });
        setSelecionados(filtrosData.selecionados || {});
        if (filtrosData.assinatura) {
          try {
            const bytes = CryptoJS.AES.decrypt(filtrosData.assinatura, user.id);
            const decrypted = bytes.toString(CryptoJS.enc.Utf8);
            if (decrypted) setAssinatura(decrypted);
          } catch (e) {
            console.warn("Erro ao descriptografar assinatura salva.", e);
          }
        }
      }

      // Verifica fatura ativa
      const { data: faturasData } = await supabase
        .from("faturas")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "ativa") 
        .limit(1)
        .maybeSingle();

      if (faturasData) setTemFatura(true);

      // Verifica status da assinatura e método de pagamento
      await verificarStatusPagamento(user.id);
    };

    carregarFiltros();
  }, [user?.id]);

  useEffect(() => {
    const selecionadosAtuais = selecionados.indexador || [];

    // Atualiza a ordem para conter apenas os indexadores selecionados
    const novaOrdem = ordem.filter((item) => selecionadosAtuais.includes(item));

    // Adiciona novos selecionados ao final (ordem de clique)
    const adicionais = selecionadosAtuais.filter((item) => !novaOrdem.includes(item));
    setOrdem([...novaOrdem, ...adicionais]);
  }, [selecionados.indexador]);

  const copiarToken = () => {
    if (user?.id) {
      navigator.clipboard.writeText(user.id);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    }
  };

  const salvarFiltros = async () => {
    setErro(null);	  

    if (!user?.id) {
      setErro("ID do usuário não disponível.");
      return;
    }	  
    
    let assinaturaCriptografada = "";
    try {
      assinaturaCriptografada = CryptoJS.AES.encrypt(assinatura, user.id).toString();
    } catch (e) {
      console.error("Erro ao criptografar a assinatura:", e);
      setErro("Erro ao criptografar assinatura.");
      return;
    }

    const filtros = {
      user_id: user.id,
      assinatura: assinaturaCriptografada,
      limite_compra: limiteCompra,
      ordem_classe: ordem.filter((classe) =>
        selecionados.indexador?.includes(classe)
      ),
      taxa_minima: taxas,
      selecionados,
    };

    const { error } = await supabase
        .from("filtros")
        .upsert(filtros, { onConflict: ["user_id"] });

    if (error) {
        console.error("Erro ao salvar no Supabase:", error.message);
        setErro("Erro ao salvar filtros.");
        setStatus("erro");
      } else {
        setStatus("sucesso");
        setTemFiltro(true);
        
        const urlXP = `https://experiencia.xpi.com.br/conta-corrente/extrato/#/`;
        window.open(urlXP, "_blank");
      }
  };
  
  const alternarCheckbox = (categoria: string, opcao: string) => {
    setSelecionados((prev: any) => {
      const atuais = prev[categoria] || [];
      const existe = atuais.includes(opcao);
      const atualizados = existe
        ? atuais.filter((v: string) => v !== opcao)
        : [...atuais, opcao];
      return { ...prev, [categoria]: atualizados };
    });
  };

  // Função para determinar se pode rodar a automação
  const podeRodarAutomacao = () => {
    return temPagamento && !verificandoPagamento;
  };

  // Função para obter a mensagem de status
  const obterMensagemStatus = () => {
    if (verificandoPagamento) {
      return "🔄 Verificando status da assinatura...";
    }

    if (!temFatura) {
      return "💳 Para rodar a automação, é necessário cadastrar uma forma de pagamento na aba Faturas.";
    }

    if (!temPagamento && statusPermissao) {
      switch (statusPermissao.motivo) {
        case "cartao_removido":
          return "💳 Forma de pagamento removida. Adicione um novo cartão na aba Faturas para continuar usando a automação.";
        case "cartao_expirado":
          return "💳 Cartão expirado. Atualize sua forma de pagamento na aba Faturas para continuar usando a automação.";
        case "assinatura_inativa":
          return "⚠️ Assinatura inativa. Renove sua assinatura na aba Faturas.";
        case "cliente_nao_encontrado":
          return "❌ Cliente não encontrado no sistema de pagamentos.";
        case "erro_api":
          return "❌ Erro ao verificar status da assinatura. Tente novamente.";
        case "erro_network":
          return "🌐 Erro de conexão. Verifique sua internet e tente novamente.";
        default:
          return "❌ Problema com a forma de pagamento. Verifique na aba Faturas.";
      }
    }

    if (statusPermissao?.cancelada && statusPermissao?.expira_em) {
      const dataExpiracao = new Date(statusPermissao.expira_em).toLocaleDateString();
      return `⚠️ Assinatura cancelada. Acesso válido até ${dataExpiracao}.`;
    }

    return null;
  };

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto space-y-6 text-vega-text">
      <h2 className="text-xl font-bold text-vega-accent">Configurações da Automação</h2>

      {/* Card da assinatura eletrônica */}
      <div className="bg-black text-white p-4 rounded-xl shadow space-y-2">
        <label className="block text-sm font-medium">Assinatura eletrônica</label>
        <div className="relative">
          <input
            type={mostrarAssinatura ? "text" : "password"}
            inputMode="numeric"
            pattern="\d{0,8}"
            maxLength={8}
            className="w-full bg-zinc-900 text-white p-2 pr-10 rounded"
            value={assinatura}
            onChange={(e) => {
              const valor = e.target.value.replace(/\D/g, "");
              if (valor.length <= 8) setAssinatura(valor);
            }}
          />
          <button
            type="button"
            className="absolute right-2 top-2 text-white hover:text-yellow-400"
            onClick={() => setMostrarAssinatura(!mostrarAssinatura)}
          >
            {mostrarAssinatura ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        <p className="text-xs text-gray-400">
          Sua assinatura eletrônica XP (apenas números) é usada localmente e protegida com criptografia.
        </p>
      </div>

      <div className="bg-vega-surface p-4 rounded-xl shadow space-y-6">
        <p className="text-sm text-vega-textSoft">
          Configure abaixo os filtros desejados e clique em "Rodar Automação" para aplicar na XP.
        </p>

        <div className="space-y-4">
          {categorias.map((cat) => (
            <fieldset key={cat.chave} className="border border-vega-primary p-4 rounded-md">
              <legend className="font-semibold text-vega-accent mb-2">{cat.titulo}</legend>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {cat.opcoes.map((op) => (
                  <label key={op} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selecionados[cat.chave]?.includes(op) || false}
                      onChange={() => alternarCheckbox(cat.chave, op)}
                    />
                    <span className="capitalize">{op.replace(/_/g, " ")}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

          {/* Card dos parâmetros de valor */}
          <div className="bg-black text-white p-4 rounded-xl shadow space-y-4">
            <h3 className="text-md font-semibold text-white">Parâmetros de Valor</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm mb-1">Limite de compra por ativo (R$)</label>
                <input
                  type="number"
                  className="w-full bg-zinc-900 text-white p-2 rounded"
                  value={limiteCompra}
                  onChange={(e) => setLimiteCompra(Number(e.target.value))}
                />
              </div>
            </div>
            
            {(selecionados.indexador?.length ?? 0) > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-1">
                  <div>
                    <label className="block text-sm font-semibold mb-2 text-white">
                      Escolha a prioridade de compra
                    </label>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2 text-white">
                      Entre com o valor mínimo de taxa por classe
                    </label>
                  </div>
                </div>
              )}

            {ordem
                .filter((idx) => selecionados.indexador?.includes(idx))
                .map((prioridadeAtual, idx) => {
                  const opcoesDisponiveis = indexadores.filter(
                    (op) => !ordem.slice(0, idx).includes(op) && selecionados.indexador?.includes(op)
                  );

                  return (
                    <div key={prioridadeAtual} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm mb-1">Prioridade {idx + 1}</label>
                        <select
                          value={prioridadeAtual}
                          onChange={(e) => {
                            const novaOrdem = [...ordem];
                            novaOrdem[idx] = e.target.value;

                            // Evita duplicações entre prioridades
                            const usados = novaOrdem.slice(0, idx + 1);
                            const restantes = indexadores.filter(
                              (v) => !usados.includes(v) && selecionados.indexador?.includes(v)
                            );
                            for (let j = idx + 1; j < novaOrdem.length; j++) {
                              novaOrdem[j] = restantes[j - (idx + 1)] || "";
                            }

                            setOrdem(novaOrdem);
                          }}
                          className="w-full bg-zinc-900 text-white p-2 rounded"
                        >
                          {opcoesDisponiveis.map((op) => (
                            <option key={op} value={op}>
                              {op}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm mb-1">
                          {labelIndexador[prioridadeAtual] || "Taxa mínima"}
                        </label>
                        <input
                          type="number"
                          className="w-full bg-zinc-900 text-white p-2 rounded"
                          value={taxas[prioridadeAtual] ?? ""}
                          onChange={(e) =>
                            setTaxas({ ...taxas, [prioridadeAtual]: Number(e.target.value) })
                          }
                        />
                      </div>
                    </div>
                  );
                })}
          </div>
        </div>
        
        <div className="pt-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex flex-col gap-4">
            <div className="flex gap-2">
              <button
                onClick={salvarFiltros}
                disabled={!podeRodarAutomacao()}
                className={`px-4 py-2 rounded shadow text-black ${
                  podeRodarAutomacao()
                    ? "bg-vega-accent hover:bg-vega-primary"
                    : "bg-zinc-500 cursor-not-allowed"
                }`}
              >
                {verificandoPagamento ? "Verificando..." : "Rodar Automação"}
              </button>

              {/* Botão para recarregar status se houver problema de pagamento */}
              {!temPagamento && !verificandoPagamento && user?.id && (
                <button
                  onClick={() => verificarStatusPagamento(user.id)}
                  className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 transition text-sm"
                >
                  🔄 Recarregar Status
                </button>
              )}
            </div>

            {/* Mensagem de status */}
            {obterMensagemStatus() && (
              <span className={`text-sm ${
                verificandoPagamento ? "text-blue-400" :
                temPagamento ? "text-yellow-400" : "text-red-400"
              }`}>
                {obterMensagemStatus()}
              </span>
            )}

            {/* Mensagens de sucesso/erro */}
            {status === "sucesso" && (
              <span className="text-green-400 text-sm">✅ Filtros aplicados com sucesso</span>
            )}
            {status === "erro" && (
              <span className="text-red-400 text-sm">❌ Erro ao aplicar os filtros</span>
            )}
          </div>          
        </div>        
      </div>
    </div>
  );
}