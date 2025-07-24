import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { RefreshCw, AlertTriangle, CheckCircle, XCircle, CreditCard } from "lucide-react";

export default function Faturas() {
  const [fatura, setFatura] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [historico, setHistorico] = useState<any[]>([]);
  const [proximaCobranca, setProximaCobranca] = useState<string | null>(null);
  const [statusPermissao, setStatusPermissao] = useState<any>(null);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [verificandoPagamento, setVerificandoPagamento] = useState(false);

  // Função para verificar status da forma de pagamento
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
        return permissaoData;
      } else {
        console.error("❌ Erro ao verificar permissão:", res.status);
        setStatusPermissao({ permitido: false, motivo: "erro_api" });
        return { permitido: false, motivo: "erro_api" };
      }
    } catch (err) {
      console.error("❌ Erro ao verificar status de pagamento:", err);
      setStatusPermissao({ permitido: false, motivo: "erro_network" });
      return { permitido: false, motivo: "erro_network" };
    } finally {
      setVerificandoPagamento(false);
    }
  };

  const carregarTudo = async () => {
    setCarregando(true);

    const { data: { user } } = await supabase.auth.getUser();

    if (!user?.id || !user?.email) {
      console.error("❌ Usuário não autenticado");
      setCarregando(false);
      return;
    }

    console.log("🔍 Carregando dados para user_id:", user.id);
    console.log("📧 Email do usuário:", user.email);

    try {
      // Buscar fatura no Supabase
      const { data: fatura, error: faturaError } = await supabase
        .from("faturas")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      console.log("📊 Resultado da busca no Supabase:", { fatura, faturaError });

      if (faturaError) {
        console.error("❌ Erro ao buscar fatura:", faturaError);
      }

      if (!fatura) {
        console.log("⚠️ Nenhuma fatura encontrada no Supabase");
        setFatura(null);
        setCarregando(false);
        return;
      }

      console.log("✅ Fatura encontrada:", fatura);
      setFatura(fatura);

      if (fatura.proxima_fatura) {
        setProximaCobranca(new Date(fatura.proxima_fatura).toLocaleDateString());
      }

      // Carregar histórico e verificar permissão em paralelo
      const [historicoRes, permissaoData] = await Promise.allSettled([
        fetch("/api/faturas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: user.id }),
        }),
        verificarStatusPagamento(user.id)
      ]);

      // Processar histórico
      if (historicoRes.status === 'fulfilled') {
        try {
          const historicoJson = await historicoRes.value.json();
          console.log("📋 Histórico carregado:", historicoJson);
          if (historicoJson?.faturas) {
            setHistorico(historicoJson.faturas);
          }
        } catch (err) {
          console.error("❌ Erro ao processar histórico:", err);
        }
      } else {
        console.error("❌ Erro ao carregar histórico:", historicoRes.reason);
      }

    } catch (err) {
      console.error("❌ Erro geral ao carregar dados:", err);
    }

    setCarregando(false);
  };

  const getStatusDisplay = () => {
    if (!fatura) return null;

    const status = fatura.status;
    const canceladaEm = fatura.cancelada_em;
    const isIncompleto = status === "incompleto" && historico.some((f: any) => f.payment_status === "paid" || f.paid);

    // Verificar se há problema com forma de pagamento
    const temProblemasPagamento = statusPermissao && !statusPermissao.permitido && 
      ["cartao_removido", "cartao_expirado"].includes(statusPermissao.motivo);

    if (isIncompleto) {
      return (
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-500" />
          <span className="text-green-500">Ativa</span>
        </div>
      );
    }

    switch (status) {
      case "ativa":
        if (temProblemasPagamento) {
          return (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-500" />
                <span className="text-orange-500">Ativa - Problema com pagamento</span>
              </div>
              <span className="text-xs text-orange-400">
                {statusPermissao.motivo === "cartao_removido" ? 
                  "Forma de pagamento removida" : 
                  "Cartão expirado"}
              </span>
            </div>
          );
        }
        return (
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-green-500">Ativa</span>
          </div>
        );
      
      case "cancelada_fim_periodo":
        return (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              <span className="text-orange-500">Cancelada - Ativa até o fim do período</span>
            </div>
            {canceladaEm && (
              <span className="text-xs text-zinc-400">
                Cancelada em: {new Date(canceladaEm).toLocaleDateString()}
              </span>
            )}
          </div>
        );
      
      case "cancelada":
        return (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-500" />
              <span className="text-red-500">Cancelada</span>
            </div>
            {canceladaEm && (
              <span className="text-xs text-zinc-400">
                Cancelada em: {new Date(canceladaEm).toLocaleDateString()}
              </span>
            )}
          </div>
        );
      
      case "incompleto":
        return (
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
            <span className="text-yellow-500">Incompleto</span>
          </div>
        );
      
      default:
        return (
          <div className="flex items-center gap-2">
            <span className="capitalize">{status}</span>
          </div>
        );
    }
  };

  const mostrarBotaoReativar = () => {
    return fatura?.status === "cancelada_fim_periodo" || 
           (statusPermissao?.cancelada && statusPermissao?.permitido);
  };

  const mostrarAvisoPagamento = () => {
    if (!statusPermissao || verificandoPagamento) return null;
    
    const temProblemasPagamento = !statusPermissao.permitido && 
      ["cartao_removido", "cartao_expirado"].includes(statusPermissao.motivo);
    
    return temProblemasPagamento && fatura?.status === "ativa";
  };

  const obterMensagemPagamento = () => {
    if (!statusPermissao) return "";
    
    switch (statusPermissao.motivo) {
      case "cartao_removido":
        return "Sua forma de pagamento foi removida. Para evitar a interrupção do serviço, adicione um novo cartão no portal de gerenciamento.";
      case "cartao_expirado":
        return "Seu cartão expirou. Para evitar a interrupção do serviço, atualize sua forma de pagamento no portal de gerenciamento.";
      default:
        return "Há um problema com sua forma de pagamento. Verifique no portal de gerenciamento.";
    }
  };

  useEffect(() => {
    carregarTudo();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Informações da sua Assinatura Vega</h1>

      {carregando ? (
        <p>Carregando...</p>
      ) : !fatura ? (
        <div>
          <p className="mb-4">Nenhuma assinatura encontrada.</p>
          
          {/* Mostrar informações de debug quando não encontrar */}
          {debugInfo && (
            <div className="mb-4 p-3 bg-red-900/20 border border-red-500/20 rounded">
              <p className="text-red-400 text-sm mb-2">
                <strong>Debug:</strong> User ID: {debugInfo.user_id}
              </p>
              <p className="text-red-400 text-sm">
                Verifique se este user_id existe na tabela faturas do Supabase.
              </p>
            </div>
          )}

          <button
            onClick={async () => {
              const { data: { user } } = await supabase.auth.getUser();

              const res = await fetch("/api/assinatura", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  user_id: user.id,
                  email: user.email,
                  nome: user.user_metadata?.name || "",
                }),
              });

              const json = await res.json();
              if (json.session_url) {
                window.location.href = json.session_url;
              } else {
                alert("Erro ao iniciar assinatura.");
              }
            }}
            className="inline-block px-4 py-2 bg-green-600 text-white rounded mb-4"
          >
            Criar assinatura
          </button>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <p><strong>Plano:</strong> {fatura.plano}</p>
          
          <div>
            <strong>Status:</strong> {getStatusDisplay()}
          </div>

          {/* Aviso para problemas com forma de pagamento */}
          {mostrarAvisoPagamento() && (
            <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-lg">
              <div className="flex items-start gap-3">
                <CreditCard className="w-5 h-5 text-orange-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-orange-400 font-semibold mb-2">
                    ⚠️ Ação necessária: Problema com forma de pagamento
                  </p>
                  <p className="text-orange-300 text-sm mb-3">
                    {obterMensagemPagamento()}
                  </p>
                  <button
                    onClick={async () => {
                      const { data: { user } } = await supabase.auth.getUser();

                      const res = await fetch("/api/portal", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ user_id: user.id }),
                      });

                      const json = await res.json();
                      if (json?.url) {
                        window.open(json.url, "_blank");
                      } else {
                        alert("Erro ao abrir portal do Stripe.");
                      }
                    }}
                    className="px-3 py-1.5 bg-orange-600 text-white rounded text-sm hover:bg-orange-500 transition"
                  >
                    Atualizar forma de pagamento
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Aviso especial para assinatura cancelada mas ainda ativa */}
          {fatura.status === "cancelada_fim_periodo" && (
            <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
              <p className="text-orange-400 text-sm">
                <strong>⚠️ Sua assinatura foi cancelada</strong><br />
                Você ainda tem acesso até {proximaCobranca && new Date(new Date().setDate(new Date().getDate() + 30)).toLocaleDateString()}.
                Depois dessa data, você perderá o acesso aos recursos premium.
              </p>
            </div>
          )}

          {/* Informação de próxima cobrança apenas se ativa */}
          {proximaCobranca && fatura.status === "ativa" && (
            <p><strong>Próxima cobrança:</strong> {proximaCobranca}</p>
          )}

          {/* Data de expiração para assinatura cancelada */}
          {statusPermissao?.expira_em && fatura.status === "cancelada_fim_periodo" && (
            <p><strong>Acesso expira em:</strong> {new Date(statusPermissao.expira_em).toLocaleDateString()}</p>
          )}

          <div className="flex flex-wrap gap-2 mt-4">
            {/* Botão para finalizar pagamento se incompleto */}
            {fatura.status === "incompleto" && !historico.some((f: any) => f.payment_status === "paid" || f.paid) && (
              <button
                onClick={async () => {
                  const { data: { user } } = await supabase.auth.getUser();

                  const res = await fetch("/api/assinatura", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      user_id: user.id,
                      email: user.email,
                      nome: user.user_metadata?.name || "",
                    }),
                  });

                  const json = await res.json();
                  if (json.session_url) {
                    window.location.href = json.session_url;
                  } else {
                    alert("Erro ao iniciar checkout.");
                  }
                }}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-500 transition"
              >
                Finalizar pagamento e cadastrar cartão
              </button>
            )}

            {/* Botão para reativar assinatura cancelada */}
            {mostrarBotaoReativar() && (
              <button
                onClick={async () => {
                  const { data: { user } } = await supabase.auth.getUser();

                  const res = await fetch("/api/assinatura", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      user_id: user.id,
                      email: user.email,
                      nome: user.user_metadata?.name || "",
                    }),
                  });

                  const json = await res.json();
                  if (json.session_url) {
                    window.location.href = json.session_url;
                  } else if (res.ok) {
                    // Sucesso mas sem session_url
                    window.location.href = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`;
                  } else {
                    alert("Erro ao reativar assinatura.");
                  }
                }}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-500 transition"
              >
                Reativar Assinatura
              </button>
            )}

            {/* Botão do portal do Stripe */}
            <button
              onClick={async () => {
                const { data: { user } } = await supabase.auth.getUser();

                const res = await fetch("/api/portal", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ user_id: user.id }),
                });

                const json = await res.json();
                if (json?.url) {
                  window.open(json.url, "_blank");
                } else {
                  alert("Erro ao abrir portal do Stripe.");
                }
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 transition"
            >
              Gerenciar Assinatura
            </button>

            {/* Botão para recarregar status */}
            {statusPermissao && !statusPermissao.permitido && (
              <button
                onClick={async () => {
				  const { data } = await supabase.auth.getUser();
				  if (data?.user?.id) {
					verificarStatusPagamento(data.user.id);
				  }
				}}

                disabled={verificandoPagamento}
                className="px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-500 transition text-sm disabled:opacity-50"
              >
                {verificandoPagamento ? "Verificando..." : "🔄 Recarregar Status"}
              </button>
            )}
          </div>
        </div>
      )}

      {historico.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-semibold">Histórico de Faturas</h2>
            <button
              onClick={carregarTudo}
              className="flex items-center gap-1 text-sm text-zinc-300 hover:text-white transition"
            >
              <RefreshCw className="w-4 h-4" />
              Atualizar
            </button>
          </div>

          <table className="w-full text-sm border">
            <thead>
              <tr className="bg-zinc-800 text-white">
                <th className="p-2 text-left">Data criação</th>
                <th className="p-2 text-left">Valor</th>
                <th className="p-2 text-left">Status</th>
                <th className="p-2 text-left">Link</th>
              </tr>
            </thead>
            <tbody>
              {historico
                .filter((f: any) => f.status !== "void")
                .map((f: any) => (
                  <tr key={f.id} className="border-t border-zinc-700">
                    <td className="p-2">{new Date(f.created * 1000).toLocaleDateString()}</td>
                    <td className="p-2">R$ {(f.amount_due / 100).toFixed(2)}</td>
                    <td className="p-2 capitalize">
                      {f.status === "void" ? (
                        <span className="text-zinc-400 italic">Anulada</span>
                      ) : f.payment_status === "paid" || f.paid ? (
                        <span className="text-green-400 font-semibold">Pago</span>
                      ) : (
                        <>
                          {f.payment_status === "unpaid" ? "Não pago" : f.status}
                          {["open", "incomplete"].includes(f.status) && (
                            <div className="text-xs text-zinc-400 mt-1">
                              {f.next_payment_attempt
                                ? `Previsto para: ${new Date(f.next_payment_attempt * 1000).toLocaleDateString()}`
                                : f.due_date
                                ? `Vencimento: ${new Date(f.due_date * 1000).toLocaleDateString()}`
                                : ""}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td className="p-2">
                      {f.hosted_invoice_url && (
                        <a
                          href={f.hosted_invoice_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-500 underline"
                        >
                          Ver fatura
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}