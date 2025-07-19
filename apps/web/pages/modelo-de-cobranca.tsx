import Link from "next/link";

const taxaVariavel = 0.2; 
const mensalidade = 20.00;   

const valorInvestido = 100000;
const taxaVega = 6.2;
const taxaMedia = 5.9;
const diferencaTaxa = taxaVega - taxaMedia;
const valorTaxaVariavel = (taxaVariavel * diferencaTaxa / 100) * valorInvestido;
const valorTaxaTotal = valorTaxaVariavel + mensalidade;

export default function ModeloDeCobranca() {
  return (
    <main className="vega-bg min-h-screen px-6 py-20">
      <section className="max-w-4xl mx-auto text-center mb-20">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-6 text-vega-accent">
          Modelo de Cobrança
        </h1>
        <p className="text-lg text-vega-text/80">
          Entenda como a remuneração do Vega é estruturada para alinhar performance, confiança e total transparência.
        </p>
      </section>

      <section className="max-w-3xl mx-auto grid gap-10 text-left text-base leading-relaxed text-vega-text/80">
        {[ 
          {
            title: "Assinatura mensal acessível",
            text: "Com apenas R$ 20 por mês, você tem acesso completo à plataforma e pode automatizar suas aplicações com total autonomia.",
          },
          {
            title: "Cobrança baseada no ganho gerado",
            text: "Além da mensalidade, cobramos uma taxa variável proporcional à diferença de taxa conquistada pelo Vega em relação à média da plataforma.",
          },
          {
            title: "Transparência total",
            text: "Todas as movimentações do Vega são registradas e acessíveis por você em tempo real. Sem surpresas, sem promessas exageradas.",
          },
          {
            title: "Sem fidelidade ou multa",
            text: "Você pode parar de usar o Vega a qualquer momento, sem nenhum tipo de multa contratual. Liberdade total para decidir.",
          },
        ].map(({ title, text }, idx) => (
          <div key={idx} className="vega-card border border-zinc-700">
            <h2 className="text-xl font-bold mb-2 text-vega-accent">{title}</h2>
            <p>{text}</p>
          </div>
        ))}

        <div className="vega-card border border-zinc-700">
          <h2 className="text-xl font-bold mb-2 text-vega-accent">Exemplo de cobrança</h2>
          <p className="mb-2">
            A <strong>Vega</strong> realiza a cobrança com base em dois componentes:
          </p>
          <ul className="list-disc pl-6 space-y-2 mb-4">
            <li><strong>Mensalidade fixa:</strong> R$ {mensalidade.toFixed(2)} por mês, independentemente do número de operações.</li>
            <li>
              <strong>Taxa variável:</strong> {(taxaVariavel * 100).toFixed(0)}% da diferença positiva entre a taxa obtida pelo Vega e a taxa média da plataforma para o mesmo indexador, aplicada sobre o valor investido.
            </li>
          </ul>

          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Taxa obtida pelo Vega:</strong> IPCA+ {taxaVega.toFixed(2)}%</li>
            <li><strong>Taxa média da plataforma*:</strong> IPCA+ {taxaMedia.toFixed(2)}%</li>
            <li><strong>Diferença:</strong> {diferencaTaxa.toFixed(2)} pontos percentuais</li>
            <li><strong>Taxa variável:</strong> R$ {valorTaxaVariavel.toFixed(2)}</li>
            <li><strong>Total do mês:</strong> R$ {valorTaxaTotal.toFixed(2)} (mensalidade + variável)</li>
          </ul>
          <p className="mt-4">
            Mesmo que você não opere no mês, sua assinatura garante acesso ao Vega e às funcionalidades exclusivas da plataforma.
          </p>
        </div>
		<p className="text-xs text-vega-text/40 mt-6">
        * A taxa média da plataforma utilizada como referência é registrada no momento da execução automática da compra pelo Vega.
      </p>
      </section>

      <section className="text-center mt-24">
        <h2 className="text-2xl font-bold mb-4 text-vega-accent">Ainda com dúvidas?</h2>
        <p className="text-vega-text/70 mb-6">Entre em contato com nosso time e teremos prazer em te ajudar.</p>
        <a
          href="mailto:contato@vega.app"
          className="vega-button bg-vega-accent text-black hover:bg-yellow-300"
        >
          Falar com atendimento
        </a>
      </section>

      <footer className="text-center text-sm text-vega-text/50 border-t border-zinc-700 mt-24 pt-6">
        © {new Date().getFullYear()} Vega. Todos os direitos reservados.      
      </footer>
    </main>
  );
}
