import { NextApiRequest, NextApiResponse } from "next";
import * as cheerio from "cheerio";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const [cdiRes, ipcaRes] = await Promise.all([
      fetch("https://statusinvest.com.br/indices/cdi"),
      fetch("https://www.ibge.gov.br/explica/inflacao.php"),
    ]);

    const cdiHtml = await cdiRes.text();
    const ipcaHtml = await ipcaRes.text();

    const $cdi = cheerio.load(cdiHtml);
    const $ipca = cheerio.load(ipcaHtml);

    // Tentativa principal: StatusInvest
    let cdiTexto = $cdi("strong.value").first().text().replace(",", ".").trim();
    let cdi = parseFloat(cdiTexto);

    // Fallback: MaisRetorno
    if (isNaN(cdi)) {
      const maisRetornoRes = await fetch("https://maisretorno.com/indice/cdi");
      const maisRetornoHtml = await maisRetornoRes.text();
      const $mr = cheerio.load(maisRetornoHtml);

      const fallbackCdiTexto = $mr("section:contains('Rentabilidade 12M') span")
        .first()
        .text()
        .replace("%", "")
        .replace(",", ".")
        .trim();

      cdi = parseFloat(fallbackCdiTexto);
    }

    // IPCA
    const ipcaTexto = $ipca("h3:contains('IPCA acumulado de 12 meses')")
      .next("p.variavel-dado")
      .text()
      .replace("%", "")
      .replace(",", ".")
      .trim();

    const ipca = parseFloat(ipcaTexto);

    if (isNaN(cdi) || isNaN(ipca)) {
      throw new Error("Erro ao interpretar os valores das taxas.");
    }

    res.status(200).json({ cdi, ipca });
  } catch (error) {
    console.error("Erro ao obter CDI e IPCA:", error);
    res.status(500).json({ error: "Erro ao obter CDI e IPCA." });
  }
}
