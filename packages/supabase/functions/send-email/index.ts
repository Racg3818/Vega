import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { enviarEmail } from "./sendgrid.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Content-Type": "application/json",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  try {
    const body = await req.json();
    const {
      to,
      tipo,
      nome,
      cdi,
      prefixado,
      ipca,
      taxaMediaCliente,
      taxaMediaPlataforma,
      ativos,
    } = body;

    if (!to || !tipo || !nome) {
      return new Response(
        JSON.stringify({ sucesso: false, erro: "Parâmetros obrigatórios ausentes" }),
        { status: 400, headers },
      );
    }

    let subject = "";
    let html = "";

	if (tipo === "boas-vindas") {
	  subject = `Bem-vindo ao Vega, ${nome}!`;
	  html = `
	<table width="100%" cellpadding="0" cellspacing="0" style="font-family: Arial, sans-serif; background-color: #0f172a; padding: 40px;">
	  <tr>
		<td align="center">
		  <table width="600" cellpadding="0" cellspacing="0" style="background-color: #1e293b; border-radius: 8px; overflow: hidden;">
			<tr>
			  <td style="background-color: #1e40af; color: #ffffff; padding: 20px; text-align: center;">
				<h1 style="margin: 0;">Bem-vindo ao <strong>Vega</strong> 🚀</h1>
			  </td>
			</tr>
			<tr>
			  <td style="padding: 30px; color: #f1f5f9;">
				<p style="font-size: 16px;">Olá <strong>${nome}</strong>,</p>
				<p style="font-size: 16px;">É um prazer ter você conosco! O Vega foi criado para te ajudar a operar com inteligência e agilidade no mercado de renda fixa.</p>
				<p style="font-size: 16px;">A partir de agora, você poderá contar com automatizações inteligentes e oportunidades selecionadas com base nos seus critérios.</p>
				<p style="font-size: 16px;">Conte conosco nessa jornada!</p>
				<p style="margin-top: 30px;">Abraços,<br><strong>Equipe Vega</strong></p>
			  </td>
			</tr>
		  </table>
		</td>
	  </tr>
	</table>`;
	} else if (tipo === "provocativo") {
	  subject = `💡 ${nome}, hoje é um bom dia para investir!`;
	  html = `
	<table width="100%" cellpadding="0" cellspacing="0" style="font-family: Arial, sans-serif; background-color: #0f172a; padding: 40px;">
	  <tr>
		<td align="center">
		  <table width="600" cellpadding="0" cellspacing="0" style="background-color: #1e293b; border-radius: 8px;">
			<tr>
			  <td style="background-color: #1e40af; color: #ffffff; padding: 20px; text-align: center;">
				<h2 style="margin: 0;">⏱️ Oportunidades no ar!</h2>
			  </td>
			</tr>
			<tr>
			  <td style="padding: 30px; color: #f1f5f9;">
				<p style="font-size: 16px;">Olá <strong>${nome}</strong>,</p>
				<p style="font-size: 16px;">As melhores taxas de renda fixa costumam surgir logo nos primeiros minutos após a abertura da plataforma.</p>
				<p style="font-size: 16px;">Confira as taxas médias hoje:</p>
				<ul style="font-size: 16px; padding-left: 20px;">
				  <li><strong>CDI:</strong> ${cdi}</li>
				  <li><strong>Prefixado:</strong> ${prefixado}</li>
				  <li><strong>IPCA+:</strong> ${ipca}</li>
				</ul>
				<div style="margin: 30px 0; text-align: center;">
				  <a href="https://vega.app.br/login" style="background-color: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Abrir o Vega</a>
				</div>
				<p style="font-size: 14px; color: #94a3b8;">* Dica: quanto mais cedo você estiver online, maiores as chances de capturar taxas atrativas.</p>
			  </td>
			</tr>
		  </table>
		</td>
	  </tr>
	</table>`;
	} else if (tipo === "resumo") {
	  subject = `📊 Resumo do seu dia no Vega`;

	  const ativosHTML = ativos?.map((a: any) => `
		<tr style="border-bottom: 1px solid #e2e8f0;">
		  <td style="padding: 8px;">${a.nome_ativo}</td>
		  <td style="padding: 8px;">${a.indexador}</td>
		  <td style="padding: 8px;">${a.taxa_contratada}</td>
		  <td style="padding: 8px;">${a.taxa_grossup}</td>
		  <td style="padding: 8px;">${a.valor_aplicado}</td>
		  <td style="padding: 8px;">${a.valor_minimo}</td>
		  <td style="padding: 8px;">${a.vencimento}</td>
		  <td style="padding: 8px;">${a.data_hora_compra}</td>
		</tr>
	  `).join("") || "";

	  html = `
	<table width="100%" cellpadding="0" cellspacing="0" style="font-family: Arial, sans-serif; background-color: #0f172a; padding: 40px;">
	  <tr>
		<td align="center">
		  <table width="600" cellpadding="0" cellspacing="0" style="background-color: #1e293b; border-radius: 8px;">
			<tr>
			  <td style="background-color: #10b981; color: #ffffff; padding: 20px; text-align: center;">
				<h2 style="margin: 0;">📌 Resumo das Compras de Hoje</h2>
			  </td>
			</tr>
			<tr>
			  <td style="padding: 30px; color: #f1f5f9;">
				<p style="font-size: 16px;">Olá <strong>${nome}</strong>,</p>
				<p style="font-size: 16px;">Segue abaixo o resumo dos ativos comprados automaticamente pelo Vega com base nos seus filtros:</p>

				<table width="100%" cellpadding="8" cellspacing="0" style="margin-top: 20px; border-collapse: collapse; font-size: 15px; color: #f1f5f9;">
				  <tr style="background-color: #0f766e;">
					<th align="left">Ativo</th>
					<th align="left">Indexador</th>
					<th align="left">Taxa</th>
					<th align="left">Grossup</th>
					<th align="left">Valor aplicado</th>
					<th align="left">Valor mínimo</th>
					<th align="left">Vencimento</th>
					<th align="left">Data/Hora</th>
				  </tr>
				  ${ativosHTML}
				</table>

				<p style="margin-top: 30px;">Ficou com dúvidas? Estamos por aqui!</p>
				<p><strong>Equipe Vega</strong></p>
			  </td>
			</tr>
		  </table>
		</td>
	  </tr>
	</table>`;
	} else {
	  return new Response(
		JSON.stringify({ sucesso: false, erro: "Tipo de e-mail inválido" }),
		{ status: 400, headers },
	  );
	}
		

    await enviarEmail({ to, subject, html });

    return new Response(
      JSON.stringify({ sucesso: true, mensagem: "E-mail enviado com sucesso" }),
      { status: 200, headers },
    );
  } catch (err) {
    console.error("Erro interno ao enviar e-mail:", err);
    return new Response(
      JSON.stringify({ sucesso: false, erro: String(err) }),
      { status: 500, headers },
    );
  }
});
