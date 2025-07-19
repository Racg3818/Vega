// tailwind.config.js
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}"
  ],
  safelist: [
    { pattern: /bg-vega-.*/ },
    { pattern: /text-vega-.*/ },
  ],
  theme: {
    extend: {
	  colors: {
		  vega: {
			background: "#0B0F1A",     // fundo geral (quase preto com tom azulado)
			surface: "#1C2333",        // cards e painéis
			text: "#F5F7FA",           // texto principal (quase branco)
			textSoft: "#9CA3AF",       // texto secundário (cinza suave)
			primary: "#3B82F6",        // botões e ícones (azul moderno)
			accent: "#60A5FA",         // destaques e números (azul claro vibrante)
		  },
		},
	},
  },
  plugins: [],
};
