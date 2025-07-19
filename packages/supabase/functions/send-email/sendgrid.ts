const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY")!;
const EMAIL_FROM = Deno.env.get("EMAIL_FROM")!;

interface EmailParams {
  to: string;
  subject: string;
  html: string;
}

export async function enviarEmail({ to, subject, html }: EmailParams) {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: EMAIL_FROM, name: "Vega Invest" },
      subject,
      content: [{ type: "text/html", value: html }],
    }),
  });

  const text = await res.text();

  console.log("Status do envio:", res.status);
  console.log("Corpo da resposta:", text);

  if (!res.ok) {
    throw new Error(`Erro ao enviar e-mail: ${text}`);
  }

  return res;
}
