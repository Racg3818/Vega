import { signIn } from "next-auth/react";
import Link from "next/link";

export default function Home() {
  return (
    <main className="vega-bg min-h-screen px-6 py-20">
      <header className="flex justify-between items-center max-w-6xl mx-auto mb-20">
        <h1 className="text-3xl font-extrabold text-vega-accent">Vega</h1>
        <nav className="flex gap-6 text-sm text-vega-text">
          <a href="#sobre" className="hover:text-vega-accent">Sobre</a>
          <a href="#recursos" className="hover:text-vega-accent">Recursos</a>
          <a href="#conta" className="hover:text-vega-accent">Acessar</a>
          <Link href="/modelo-de-cobranca" className="hover:text-vega-accent">Modelo de Cobrança</Link>
        </nav>
      </header>

      <section className="text-center max-w-2xl mx-auto mb-32">
        <h2 className="text-5xl font-extrabold mb-6 leading-tight">
          Automatize seus investimentos com o <span className="text-vega-accent">Vega</span>
        </h2>
        <p className="text-lg text-vega-text/80 mb-8">
          A inteligência que encontra os melhores ativos, aplica de forma segura e economiza seu tempo todos os dias.
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <button
            onClick={() => window.location.href = "/login"}
            className="vega-button bg-vega-accent text-black hover:bg-yellow-300"
          >
            Entrar com Google
          </button>
          <button
            onClick={() => window.location.href = "/login"}
            className="vega-button bg-transparent border border-white/30 text-white hover:bg-white/10"
          >
            Criar conta gratuita
          </button>
          <Link
            href="/modelo-de-cobranca"
            className="vega-button bg-white/10 border border-white/20 text-white text-center hover:bg-white/20"
          >
            Ver modelo de cobrança
          </Link>
        </div>
      </section>

      <section id="recursos" className="max-w-6xl mx-auto grid md:grid-cols-3 gap-10 mb-32">
        {[
          {
            title: "Filtros inteligentes",
            text: "Personalize vencimento, indexador, liquidez, aplicação mínima e outros critérios que o robô irá seguir.",
          },
          {
            title: "Execução automática",
            text: "O Vega aplica seus filtros diretamente na plataforma e executa investimentos conforme suas regras.",
          },
          {
            title: "Privacidade garantida",
            text: "Sua assinatura eletrônica é criptografada localmente. Nada é enviado para servidores externos.",
          },
        ].map((item, idx) => (
          <div key={idx} className="vega-card border border-zinc-700">
            <h3 className="text-xl font-bold mb-2 text-vega-accent">{item.title}</h3>
            <p className="text-sm text-vega-text/80">{item.text}</p>
          </div>
        ))}
      </section>

      <section id="sobre" className="max-w-4xl mx-auto text-center mb-32">
        <h2 className="text-3xl font-bold mb-6 text-vega-accent">Por que usar o Vega?</h2>
        <p className="text-lg text-vega-text/80">
          Vega é a solução ideal para quem busca autonomia, segurança e performance nos investimentos em renda fixa.
          Enquanto você foca no que importa, o Vega filtra, escolhe e executa automaticamente com base nos seus critérios.
        </p>
      </section>

      <section className="vega-surface px-6 py-20">
        <h2 className="text-4xl font-extrabold text-vega-accent text-center mb-10">Como funciona?</h2>
        <p className="text-center text-vega-text/80 max-w-3xl mx-auto mb-14">
          A Vega é uma plataforma totalmente segura e intuitiva. Basta realizar 3 passos simples para começar:
        </p>

        <div className="flex flex-col md:flex-row justify-around gap-10 max-w-6xl mx-auto">
          {[
            {
              step: "1.",
              title: "Crie sua conta",
              text: "Nome, e-mail e celular são as únicas informações necessárias. Nada de formulários extensos.",
            },
            {
              step: "2.",
              title: "Defina seus parâmetros",
              text: "Escolha o rendimento mínimo, faixa de vencimento e valor que deseja investir.",
            },
            {
              step: "3.",
              title: "Autorize suas compras",
              text: "Nos dias em que quiser investir, o Vega faz todo o trabalho de monitorar e comprar por você.",
            },
          ].map(({ step, title, text }, idx) => (
            <div className="flex-1" key={idx}>
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 bg-vega-accent text-black rounded-full flex items-center justify-center text-xl font-bold">{step}</div>
                <h3 className="text-xl font-bold ml-4">{title}</h3>
              </div>
              <p className="ml-14 text-vega-text/80">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="text-center px-6 py-20 vega-surface">
        <h2 className="text-4xl md:text-5xl font-extrabold mb-6 text-vega-accent">
          Rendimentos que beiram 18% ao ano
        </h2>
        <p className="text-lg text-vega-text/80 max-w-4xl mx-auto">
          Você não precisa garimpar títulos. O Vega encontra e executa as melhores ofertas automaticamente.
        </p>
      </section>

      <section className="vega-surface px-6 py-20">
        <h2 className="text-4xl font-extrabold text-vega-accent mb-6">Não dê bobeira com seu caixa</h2>
        <p className="text-vega-text/80 max-w-4xl mb-10">
          Cuidar bem do seu capital é essencial. O Vega multiplica o seu caixa com segurança e praticidade.
        </p>
        <ul className="space-y-4">
          {[
            "✅ Seu dinheiro não fica sob nossa custódia.",
            "✅ As operações são feitas diretamente na sua corretora.",
            "✅ Com criptografia de ponta-a-ponta.",
            "✅ Você escolhe quando investir com autorização de compra.",
            "✅ Respeitamos os limites do FGC automaticamente.",
          ].map((item, i) => (
            <li key={i} className="bg-zinc-800 border border-zinc-700 p-4 rounded-lg shadow-sm text-vega-text/80">
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section id="conta" className="text-center max-w-2xl py-10 mx-auto mb-32">
        <h2 className="text-2xl font-bold mb-4 text-vega-accent">Pronto para automatizar seus investimentos?</h2>
        <p className="text-vega-text/70 mb-6">Crie sua conta com Google e experimente gratuitamente.</p>
        <button
          onClick={() => window.location.href = "/login"}
          className="vega-button bg-vega-accent text-black hover:bg-yellow-300"
        >
          Começar agora
        </button>
      </section>

      <footer className="text-center text-sm text-vega-text/50 border-t border-zinc-700 py-6">
        © {new Date().getFullYear()} Vega. Todos os direitos reservados.
      </footer>
    </main>
  );
}
