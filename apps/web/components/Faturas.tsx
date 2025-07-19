import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { RefreshCw } from "lucide-react";

export default function Faturas() {
  const [fatura, setFatura] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [historico, setHistorico] = useState<any[]>([]);
  const [proximaCobranca, setProximaCobranca] = useState<string | null>(null);  


  const carregarTudo = async () => {
	  setCarregando(true);

	  const { data: { user } } = await supabase.auth.getUser();

	  if (!user?.id || !user?.email) {
		console.error("❌ Usuário não autenticado");
		setCarregando(false);
		return;
	  }

	  try {
		// Executa as duas chamadas em paralelo
		const [faturaRes, historicoRes] = await Promise.all([
		  supabase.from("faturas").select("*").eq("user_id", user.id).single(),
		  fetch("/api/listarFaturasStripe", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ user_id: user.id }),
		  }),
		]);

		const fatura = faturaRes.data;
		
		console.log("Fatura:", fatura)

		if (!fatura) {
		  setFatura(null);
		  setCarregando(false);
		  return;
		}

		setFatura(fatura);

		if (fatura.proxima_fatura) {
		  setProximaCobranca(new Date(fatura.proxima_fatura).toLocaleDateString());
		}

		const historicoJson = await historicoRes.json();
		if (historicoJson?.faturas) {
		  setHistorico(historicoJson.faturas);
		}
	  } catch (err) {
		console.error("❌ Erro ao carregar fatura e histórico:", err);
	  }

	  setCarregando(false);
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
			<button
			  onClick={async () => {
				const { data: { user } } = await supabase.auth.getUser();

				const res = await fetch("/api/assinaturaStripe", {
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
		  <div className="space-y-2 text-sm">
			<p><strong>Plano:</strong> {fatura.plano}</p>
			<p>
			  <strong>Status:</strong>{" "}
			  {(fatura.status === "incompleto" && historico.some((f: any) => f.payment_status === "paid" || f.paid))
				? "Ativa"
				: fatura.status}
			</p>
			{proximaCobranca && (
			  <p><strong>Próxima cobrança:</strong> {proximaCobranca}</p>
			)}

			<div className="flex flex-wrap gap-2 mt-4">
			  {fatura.status === "incompleto" && (
				<button
				  onClick={async () => {
					const { data: { user } } = await supabase.auth.getUser();

					const res = await fetch("/api/assinaturaStripe", {
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
				Trocar cartão de crédito
			  </button>
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
