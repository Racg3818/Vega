// pages/api/taxas.ts
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

    const cdiTexto = $cdi("strong.value").first().text().replace(",", ".").trim();
    const ipcaTexto = $ipca("h3:contains('IPCA acumulado de 12 meses')")
      .next("p.variavel-dado")
      .text()
      .replace("%", "")
      .replace(",", ".")
      .trim();

    const cdi = parseFloat(cdiTexto);
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
