import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { RefreshCw, AlertTriangle, CheckCircle, XCircle, CreditCard, ExternalLink, Filter } from "lucide-react";

type StatusFatura = 'ativa' | 'cancelada' | 'cancelada_fim_periodo' | 'incompleto' | 'pendente' | 'past_due' | 'trialing';
type MotivoProblema = 'cartao_removido' | 'cartao_expirado' | 'pagamento_falhado' | 'erro_verificacao_pagamento';
type TipoFatura = 'mensal' | 'variavel';
type FiltroTipo = 'todos' | 'mensal' | 'variavel';

interface Fatura {
  id: string;
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id?: string;
  tipo_fatura: TipoFatura;
  plano: string;
  status: StatusFatura;
  proxima_fatura?: string;
  expiracao_em?: string;
  cancelada_em?: string;
  problema_pagamento: boolean;
  motivo_problema?: MotivoProblema;
  valor?: number;
  criado_em: string;
  historico_faturas?: Array<{
    id: string;
    data: string;
    valor: number;
    status: string;
    pago: boolean;
    link_fatura?: string;
    tipo_fatura?: TipoFatura;
  }>;
}

export default function Faturas() {
  const [faturas, setFaturas] = useState<Fatura[]>([]);
  const [faturaAtiva, setFaturaAtiva] = useState<Fatura | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [carregandoAcao, setCarregandoAcao] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('todos');

  // ✅ Buscar dados do usuário uma única vez
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
  }, []);

  const carregarFaturas = async () => {
    if (!user?.id) return;

    setCarregando(true);
    console.log("🔍 Carregando dados para user_id:", user.id);

    try {
      // ✅ Buscar TODAS as faturas do usuário (mensal e variável)
      const { data: todasFaturas, error: erroFaturas } = await supabase
        .from("faturas")
        .select("*")
        .eq("user_id", user.id)
        .order("criado_em", { ascending: false });

      if (erroFaturas) {
        console.error("❌ Erro ao buscar faturas:", erroFaturas);
        setFaturas([]);
        setFaturaAtiva(null);
        setCarregando(false);
        return;
      }

      if (!todasFaturas || todasFaturas.length === 0) {
        console.log("ℹ️ Nenhuma fatura encontrada para o usuário");
        setFaturas([]);
        setFaturaAtiva(null);
        setCarregando(false);
        return;
      }

      // ✅ Separar fatura ativa (mensal) das demais
      const faturaMenual = todasFaturas.find(f => f.tipo_fatura === 'mensal');
      setFaturaAtiva(faturaMenual || null);

      // ✅ Buscar histórico para todas as faturas
      const faturasComHistorico = await Promise.all(
        todasFaturas.map(async (fatura) => {
          const { data: historico, error: erroHistorico } = await supabase
            .from("faturas_historico")
            .select("*")
            .eq("fatura_id", fatura.id)
            .order("data_criacao", { ascending: false });

          if (erroHistorico) {
            console.error(`❌ Erro ao carregar histórico para fatura ${fatura.id}:`, erroHistorico);
            return { ...fatura, historico_faturas: [] };
          }

          // ✅ Adicionar tipo_fatura ao histórico
          const historicoComTipo = (historico || []).map(item => ({
            ...item,
            tipo_fatura: fatura.tipo_fatura,
			data: item.data_criacao
			
          }));

          return { ...fatura, historico_faturas: historicoComTipo };
        })
      );

      setFaturas(faturasComHistorico);

    } catch (err) {
      console.error("❌ Erro geral ao carregar dados:", err);
      setFaturas([]);
      setFaturaAtiva(null);
    }

    setCarregando(false);
  };

  // ✅ Configurar subscription em tempo real
  useEffect(() => {
    if (!user?.id) return;

    const subscription = supabase
      .channel(`faturas_user_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'faturas',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log("🔄 Mudança detectada na fatura:", payload);
          carregarFaturas();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'faturas_historico'
        },
        (payload) => {
          console.log("🔄 Mudança detectada no histórico:", payload);
          // ✅ Recarrega se qualquer fatura do usuário for afetada
          const faturaAfetada = faturas.some(f => f.id === payload.new?.fatura_id);
          if (faturaAfetada) {
            carregarFaturas();
          }
        }
      )
      .subscribe((status) => {
        console.log("📡 Status da subscription:", status);
      });

    return () => {
      subscription.unsubscribe();
    };
  }, [user?.id, faturas.length]);

  // ✅ Carregar faturas quando usuário estiver disponível
  useEffect(() => {
    if (user?.id) {
      carregarFaturas();
    }
  }, [user?.id]);

  // ✅ Função unificada para chamadas da API
  const chamarAPI = async (method: string, endpoint: string, body?: any) => {
    if (!user?.id || !user?.email) {
      alert("Usuário não autenticado");
      return null;
    }

    setCarregandoAcao(true);

    try {
      const res = await fetch(`/api/${endpoint}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          email: user.email,
          nome: user.user_metadata?.name || "",
          ...body
        }),
      });

      const json = await res.json();
      console.log(`📦 Resposta da API ${endpoint}:`, json);

      if (!res.ok) {
        console.error(`❌ Erro HTTP ${res.status}:`, json);
        alert(`Erro: ${json.error || json.message || 'Erro desconhecido'}`);
        return null;
      }

      return { res, json };
    } catch (err) {
      console.error(`❌ Erro na API ${endpoint}:`, err);
      alert("Erro de conexão. Tente novamente.");
      return null;
    } finally {
      setCarregandoAcao(false);
    }
  };

  const criarOuReativarAssinatura = async () => {
    const result = await chamarAPI("POST", "assinatura");
    if (!result) return;

    const { res, json } = result;

    if (json.session_url) {
      window.location.href = json.session_url;
    } else if (res.ok) {
      await carregarFaturas();
    } else {
      alert("Erro ao processar assinatura.");
    }
  };

  const abrirPortalStripe = async () => {
    const result = await chamarAPI("PUT", "assinatura");
    if (!result) return;

    const { json } = result;

    if (json?.url) {
      window.open(json.url, "_blank");
    } else {
      alert("Erro ao abrir portal do Stripe.");
    }
  };

  const cancelarAssinatura = async () => {
    if (!confirm("Tem certeza que deseja cancelar sua assinatura?")) return;

    const result = await chamarAPI("DELETE", "assinatura");
    if (!result) return;

    const { res } = result;

    if (res.ok) {
      alert("Assinatura será cancelada ao fim do período atual.");
      await carregarFaturas();
    } else {
      alert("Erro ao cancelar assinatura.");
    }
  };

  const getStatusDisplay = (fatura: Fatura) => {
    const { status, cancelada_em, expiracao_em, problema_pagamento, motivo_problema } = fatura;

    const StatusIcon = ({ icon: Icon, color, text, subtitle }: any) => (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${color}`} />
          <span className={color}>{text}</span>
        </div>
        {subtitle && <span className="text-xs text-zinc-400">{subtitle}</span>}
      </div>
    );

    switch (status) {
      case "ativa":
        if (problema_pagamento) {
          return (
            <StatusIcon
              icon={AlertTriangle}
              color="text-orange-500"
              text="Ativa - Problema com pagamento"
              subtitle={motivo_problema || "Verifique sua forma de pagamento"}
            />
          );
        }
        return <StatusIcon icon={CheckCircle} color="text-green-500" text="Ativa" />;

      case "cancelada_fim_periodo":
        const canceladaSubtitle = [
          cancelada_em && `Cancelada em: ${new Date(cancelada_em).toLocaleDateString()}`,
          expiracao_em && `Expira em: ${new Date(expiracao_em).toLocaleDateString()}`
        ].filter(Boolean).join(' • ');
        
        return (
          <StatusIcon
            icon={AlertTriangle}
            color="text-orange-500"
            text="Cancelada - Ativa até o fim do período"
            subtitle={canceladaSubtitle}
          />
        );

      case "cancelada":
        return (
          <StatusIcon
            icon={XCircle}
            color="text-red-500"
            text="Cancelada"
            subtitle={cancelada_em && `Cancelada em: ${new Date(cancelada_em).toLocaleDateString()}`}
          />
        );

      case "incompleto":
        return <StatusIcon icon={AlertTriangle} color="text-yellow-500" text="Incompleto" />;

      case "pendente":
        return <StatusIcon icon={AlertTriangle} color="text-blue-500" text="Pendente" />;

      default:
        return <span className="capitalize">{status}</span>;
    }
  };

  const getMensagemProblema = (motivo?: MotivoProblema) => {
    const mensagens = {
      cartao_removido: "Sua forma de pagamento foi removida. Para evitar a interrupção do serviço, adicione um novo cartão no portal de gerenciamento.",
      cartao_expirado: "Seu cartão expirou. Para evitar a interrupção do serviço, atualize sua forma de pagamento no portal de gerenciamento.",
      pagamento_falhado: "O último pagamento falhou. Para evitar a interrupção do serviço, verifique sua forma de pagamento no portal de gerenciamento.",
      erro_verificacao_pagamento: "Erro ao verificar forma de pagamento. Verifique no portal de gerenciamento."
    };

    return motivo ? mensagens[motivo] : "Há um problema com sua forma de pagamento. Verifique no portal de gerenciamento.";
  };

  const getMensagemCancelamento = () => {
    const dataExpiracao = faturaAtiva?.expiracao_em 
      ? new Date(faturaAtiva.expiracao_em).toLocaleDateString()
      : (faturaAtiva?.proxima_fatura ? new Date(faturaAtiva.proxima_fatura).toLocaleDateString() : "o fim do período atual");
      
    return `Você ainda tem acesso até ${dataExpiracao}. Depois dessa data, você perderá o acesso aos recursos premium.`;
  };

  // ✅ Filtrar histórico combinado de todas as faturas
  const getHistoricoFiltrado = () => {
    const todosHistoricos = faturas.flatMap(fatura => 
      (fatura.historico_faturas || []).map(item => ({
        ...item,
        tipo_fatura: fatura.tipo_fatura,
        plano: fatura.plano
      }))
    );

    // ✅ Filtrar por tipo
    const historicoFiltrado = filtroTipo === 'todos' 
      ? todosHistoricos 
      : todosHistoricos.filter(item => item.tipo_fatura === filtroTipo);

    // ✅ Ordenar por data (mais recente primeiro)
    return historicoFiltrado.sort((a, b) => 
      new Date(b.data).getTime() - new Date(a.data).getTime()
    );
  };

  // ✅ Componentes de alerta otimizados
  const AlertaPagamento = () => (
    <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-lg">
      <div className="flex items-start gap-3">
        <CreditCard className="w-5 h-5 text-orange-400 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-orange-400 font-semibold mb-2">
            ⚠️ Ação necessária: Problema com forma de pagamento
          </p>
          <p className="text-orange-300 text-sm mb-3">
            {getMensagemProblema(faturaAtiva?.motivo_problema)}
          </p>
          <button
            onClick={abrirPortalStripe}
            disabled={carregandoAcao}
            className="px-3 py-1.5 bg-orange-600 text-white rounded text-sm hover:bg-orange-500 transition disabled:opacity-50"
          >
            {carregandoAcao ? "Carregando..." : "Atualizar forma de pagamento"}
          </button>
        </div>
      </div>
    </div>
  );

  const AlertaCancelamento = () => (
    <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
      <p className="text-orange-400 text-sm">
        <strong>⚠️ Sua assinatura foi cancelada</strong><br />
        {getMensagemCancelamento()}
      </p>
      {faturaAtiva?.cancelada_em && (
        <p className="text-orange-300 text-xs mt-2">
          Cancelada em: {new Date(faturaAtiva.cancelada_em).toLocaleDateString()}
        </p>
      )}
    </div>
  );

  // ✅ Simplificar verificações de estado para fatura mensal
  const showReativar = faturaAtiva?.status === "cancelada_fim_periodo";
  const showAvisoPagamento = faturaAtiva?.status === "ativa" && faturaAtiva?.problema_pagamento;
  const showAvisoCancelamento = faturaAtiva?.status === "cancelada_fim_periodo";
  const showBotoesAtivos = faturaAtiva?.status === "ativa" && !faturaAtiva?.cancelada_em;

  if (carregando) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Informações da sua Assinatura Vega</h1>
        <div className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>Carregando...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Informações da sua Assinatura Vega</h1>

      {!faturaAtiva ? (
        <div>
          <p className="mb-4">Nenhuma assinatura mensal encontrada.</p>
          <button
            onClick={criarOuReativarAssinatura}
            disabled={carregandoAcao}
            className="inline-block px-4 py-2 bg-green-600 text-white rounded mb-4 disabled:opacity-50 hover:bg-green-500 transition"
          >
            {carregandoAcao ? "Carregando..." : "Criar assinatura"}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Informações básicas da assinatura mensal */}
          <div className="space-y-3 text-sm">
            <p><strong>Plano:</strong> {faturaAtiva.plano}</p>
            <div><strong>Status:</strong> {getStatusDisplay(faturaAtiva)}</div>

            {/* Alertas condicionais */}
            {showAvisoPagamento && <AlertaPagamento />}
            {showAvisoCancelamento && <AlertaCancelamento />}

            {/* Informações de data */}
            {faturaAtiva.proxima_fatura && faturaAtiva.status === "ativa" && !faturaAtiva.cancelada_em && (
              <p><strong>Próxima cobrança:</strong> {new Date(faturaAtiva.proxima_fatura).toLocaleDateString()}</p>
            )}

            {faturaAtiva.expiracao_em && faturaAtiva.status === "cancelada_fim_periodo" && (
              <p><strong>Acesso expira em:</strong> {new Date(faturaAtiva.expiracao_em).toLocaleDateString()}</p>
            )}

            {faturaAtiva.valor && (
              <p><strong>Valor:</strong> R$ {(faturaAtiva.valor).toFixed(2)}</p>
            )}

            {faturaAtiva.criado_em && (
              <p><strong>Criado em:</strong> {new Date(faturaAtiva.criado_em).toLocaleDateString()}</p>
            )}
          </div>

          {/* Botões de ação */}
          <div className="flex flex-wrap gap-2">
            {faturaAtiva.status === "incompleto" && (
              <button
                onClick={criarOuReativarAssinatura}
                disabled={carregandoAcao}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-500 transition disabled:opacity-50"
              >
                {carregandoAcao ? "Carregando..." : "Finalizar pagamento"}
              </button>
            )}

            {showReativar && (
              <button
                onClick={criarOuReativarAssinatura}
                disabled={carregandoAcao}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-500 transition disabled:opacity-50"
              >
                {carregandoAcao ? "Carregando..." : "Reativar Assinatura"}
              </button>
            )}

            {showBotoesAtivos && (
              <>
                <button
                  onClick={abrirPortalStripe}
                  disabled={carregandoAcao}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 transition disabled:opacity-50 flex items-center gap-1"
                >
                  <ExternalLink className="w-4 h-4" />
                  {carregandoAcao ? "Carregando..." : "Gerenciar Assinatura"}
                </button>

                <button
                  onClick={cancelarAssinatura}
                  disabled={carregandoAcao}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-500 transition disabled:opacity-50"
                >
                  {carregandoAcao ? "Carregando..." : "Cancelar Assinatura"}
                </button>
              </>
            )}

            <button
              onClick={carregarFaturas}
              disabled={carregando}
              className="flex items-center gap-1 px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-500 transition text-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} />
              {carregando ? "Atualizando..." : "Atualizar"}
            </button>
          </div>
        </div>
      )}

      {/* ✅ Histórico consolidado com filtro */}
      {faturas.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Histórico de Faturas</h2>
            
            {/* ✅ Filtro de tipo */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value as FiltroTipo)}
                className="px-3 py-1 bg-zinc-800 border border-zinc-700 rounded text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="todos">Todas as faturas</option>
                <option value="mensal">Apenas plano mensal</option>
                <option value="variavel">Apenas faturas variáveis</option>
              </select>
            </div>
          </div>

          {getHistoricoFiltrado().length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-zinc-700 rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-zinc-800 text-white">
                    <th className="p-3 text-left">Data</th>
                    <th className="p-3 text-left">Tipo</th>
                    <th className="p-3 text-left">Plano</th>
                    <th className="p-3 text-left">Valor</th>
                    <th className="p-3 text-left">Status</th>
                    <th className="p-3 text-left">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {getHistoricoFiltrado().map((item, index) => (
                    <tr key={item.id || index} className="border-t border-zinc-700 hover:bg-zinc-800/50">
                      <td className="p-3">
                        {item.data ? new Date(item.data).toLocaleDateString() : '-'}
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          item.tipo_fatura === 'mensal' 
                            ? 'bg-blue-900/50 text-blue-400'
                            : 'bg-purple-900/50 text-purple-400'
                        }`}>
                          {item.tipo_fatura === 'mensal' ? 'Plano Mensal' : 'Fatura Variável'}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-gray-300">{item.plano || '-'}</span>
                      </td>
                      <td className="p-3">
					  {item.valor
						? `R$ ${(
							item.tipo_fatura === "mensal"
							  ? item.valor / 100
							  : item.valor
						  ).toFixed(2)}`
						: '-'}
					</td>

                      <td className="p-3">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          item.status === 'paid' || item.pago 
                            ? 'bg-green-900/50 text-green-400'
                            : item.status === 'open' || item.status === 'draft'
                            ? 'bg-yellow-900/50 text-yellow-400'
                            : 'bg-red-900/50 text-red-400'
                        }`}>
                          {item.status === 'paid' || item.pago ? 'Pago' : 
                           item.status === 'open' ? 'Em aberto' :
                           item.status === 'draft' ? 'Rascunho' :
                           item.status || 'Desconhecido'}
                        </span>
                      </td>
                      <td className="p-3">
                        {item.link_fatura && (
                          <a
                            href={item.link_fatura}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 underline inline-flex items-center gap-1"
                          >
                            Ver fatura
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <p>Nenhuma fatura encontrada para o filtro selecionado.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}