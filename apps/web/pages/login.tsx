import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Lottie from "lottie-react";
import loginAnimation from "@/components/animations/login-vega-animation";

function extrairUserIdDoToken(token) {
  try {
    const payloadBase64 = token.split('.')[1];
    const payloadJson = atob(payloadBase64);
    const payload = JSON.parse(payloadJson);
    return payload.sub; // user_id (auth.uid())
  } catch (e) {
    console.error("❌ Erro ao decodificar token:", e);
    return null;
  }
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");
  const [modo, setModo] = useState<"login" | "signup">("login");
  const [carregando, setCarregando] = useState(false);


  const autenticar = async () => {
		  console.log("🟡 Iniciando autenticação...");
		  setErro("");
		  let error = null;

		  if (modo === "login") {
			console.log("🔐 Tentando login...");

			if (!email || !senha) {
			  setErro("Preencha e-mail e senha.");
			  return;
			}

			const { error: loginError } = await supabase.auth.signInWithPassword({
			  email,
			  password: senha,
			});

			if (loginError) {
			  console.error("❌ Erro no login:", loginError.message);
			  setErro(loginError.message);
			  return;
			}

			console.log("✅ Login bem-sucedido");
		  } else {
			// Validações antes do cadastro
			if (!nome || !email || !senha) {
			  setErro("Preencha nome, e-mail e senha.");
			  return;
			}

			if (!email.includes("@") || !email.includes(".com")) {
			  setErro("E-mail inválido.");
			  return;
			}

			if (senha.length < 8) {
			  setErro("A senha deve conter no mínimo 8 caracteres.");
			  return;
			}

			// Capitaliza o nome
			const nomeFormatado = nome
			  .split(" ")
			  .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1).toLowerCase())
			  .join(" ");
			setNome(nomeFormatado); // opcional: atualiza no input visivelmente

			console.log("👤 Tentando cadastro...");
			setCarregando(true);

			const { error: signupError } = await supabase.auth.signUp({
			  email,
			  password: senha,
			  options: { data: { name: nomeFormatado } },
			});

			if (signupError) {
			  console.error("❌ Erro no cadastro:", signupError.message);
			  setErro(signupError.message);
			  setCarregando(false); // 🔁 Libera o botão e remove o spinner
			  return;
			}

			console.log("✅ Cadastro realizado com sucesso");
			console.log("🔐 Realizando login após cadastro...");

			const { error: loginErr } = await supabase.auth.signInWithPassword({
			  email,
			  password: senha,
			});

			if (loginErr) {
			  console.error("❌ Erro ao autenticar após o cadastro:", loginErr.message);
			  setCarregando(false);
			  setErro("Erro ao autenticar após o cadastro.");
			  return;
			}

			console.log("📤 Enviando e-mail de boas-vindas...");
			const sessionCheck = await supabase.auth.getSession();
			const session = sessionCheck.data.session;
			const token = session?.access_token;

			if (!token || !session?.user) {
			  setErro("Erro ao obter sessão ou token.");
			  setCarregando(false);
			  return;
			}

			/*await fetch("/api/criarClienteStripe", {
			  method: "POST",
			  headers: { "Content-Type": "application/json" },
			  body: JSON.stringify({
				user_id: session.user.id,
				email: session.user.email,
				nome,
			  }),
			});*/ //Comentado para não duplicar a criação de cliente no Stripe

			try {
			  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_FUNCTION_URL}/send-email`, {
				method: "POST",
				headers: {
				  "Content-Type": "application/json",
				  Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({ to: email, tipo: "boas-vindas", nome: nomeFormatado }),
			  });

			  const json = await res.json();
			  console.log("📨 Resposta da função:", json);

			  if (!res.ok || !json?.sucesso) {
				setErro("Falha ao enviar e-mail de boas-vindas.");
				setCarregando(false);
				return;
			  }
			} catch (e) {
			  console.error("❌ Erro na chamada da função send-email:", e);
			  setErro("Erro inesperado ao enviar e-mail.");
			  setCarregando(false);
			  return;
			}
		  }

		  // Recupera token e redireciona
		  const { data } = await supabase.auth.getSession();
		  const access_token = data.session?.access_token;

		  if (!access_token) {
			setErro("Erro ao obter token de sessão.");
			return;
		  }

		  const user_id = extrairUserIdDoToken(access_token);
		  console.log("🪪 Token JWT:", access_token);
		  console.log("🧬 UID extraído:", user_id);

		  // Comunicação com extensão
		  window.VEGA_AUTH = { access_token, user_id };
		  console.log("📤 Token e user_id armazenados no window para content.js capturar.");

		  console.log("✅ Redirecionando para dashboard...");
		  setCarregando(true);
		  setTimeout(() => {
			window.location.href = "/dashboard";
		  }, 500);
		};


  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black">
      {/* Texto institucional à esquerda */}
      <div className="absolute inset-y-0 left-0 z-20 flex flex-col justify-center px-16 max-w-5xl w-[60%] text-white">
        <h1 className="text-5xl font-extrabold mb-6 leading-tight">
          Transforme sua forma de investir
        </h1>
        <p className="text-xl text-zinc-300 leading-relaxed mb-4">
          Simples. Inteligente. Poderoso. Tudo o que você precisa para elevar sua performance nos investimentos em renda fixa.
        </p>
      </div>

      {/* Animação em tela cheia */}
      <div className="absolute inset-0 z-0 grid grid-cols-4 grid-rows-3 gap-0">
        {Array.from({ length: 100 }).map((_, i) => (
          <div key={i} className="w-full h-full">
            <Lottie
			  animationData={loginAnimation}
			  loop
			  autoplay
			  className="w-full h-full transition-all duration-700 ease-in-out"
			  rendererSettings={{
				preserveAspectRatio: "xMidYMid slice",
				progressiveLoad: true,
			  }}
			/>

          </div>
        ))}
      </div>

      {/* Camada escura */}
      <div className="absolute inset-0 bg-black/60 z-10"></div>

      {/* Formulário à direita */}
      <div className="relative z-20 flex justify-end items-center h-full w-full px-4">
        <div className="vega-card w-full max-w-md border border-zinc-800 backdrop-blur-sm bg-zinc-900/80 p-8 rounded-2xl shadow-2xl text-white">
          <div className="flex justify-center mb-6">
            <img src="/images/logo-vega.png" alt="Logo Vega" className="h-12" />
          </div>

          <h2 className="text-2xl font-semibold mb-6 text-center">
            {modo === "login" ? "Entrar no Vega" : "Criar nova conta"}
          </h2>

          {modo === "signup" && (
            <input
              type="text"
              placeholder="Seu nome completo"
              className="w-full px-4 py-2 mb-4 rounded bg-zinc-800 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-vega-accent"
              disabled={carregando}
			  value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          )}

          <input
            type="email"
            placeholder="E-mail"
            className="w-full px-4 py-2 mb-4 rounded bg-zinc-800 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-vega-accent"
            disabled={carregando}
			value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Senha"
            className="w-full px-4 py-2 mb-4 rounded bg-zinc-800 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-vega-accent"
            disabled={carregando}
			value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />

          {erro && <p className="text-red-500 text-sm mb-4 text-center">{erro}</p>}

          <button
			  onClick={autenticar}
			  disabled={carregando}
			  className={`vega-button w-full text-center ${
				carregando ? "opacity-50 cursor-not-allowed" : ""
			  }`}
			>
			  {modo === "login" ? "Entrar" : "Cadastrar"}
			</button>

		  {carregando && (
			  <div className="flex justify-center mt-6">
				<svg
				  className="animate-spin h-6 w-6 text-vega-accent"
				  xmlns="http://www.w3.org/2000/svg"
				  fill="none"
				  viewBox="0 0 24 24"
				>
				  <circle
					className="opacity-25"
					cx="12"
					cy="12"
					r="10"
					stroke="currentColor"
					strokeWidth="4"
				  ></circle>
				  <path
					className="opacity-75"
					fill="currentColor"
					d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
				  ></path>
				</svg>
			  </div>
			)}


          <p className="text-sm text-center mt-4 text-zinc-400">
            {modo === "login" ? "Ainda não tem conta?" : "Já possui uma conta?"}{" "}
            <button
              className="text-vega-accent hover:underline"
              onClick={() => setModo((prev) => (prev === "login" ? "signup" : "login"))}
            >
              {modo === "login" ? "Cadastre-se" : "Fazer login"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
