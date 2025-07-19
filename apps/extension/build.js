// build.js
const esbuild = require("esbuild");

esbuild.build({
  entryPoints: ["content.js"],
  bundle: true,
  outfile: "content.bundle.js",
  format: "iife", // formato tradicional para scripts de navegador
  target: ["chrome111"], // ou outro, se necessário
  minify: true
}).then(() => {
  console.log("✅ Build finalizado com sucesso: content.bundle.js");
}).catch(() => process.exit(1));
