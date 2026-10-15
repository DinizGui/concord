import type { NextRequest } from "next/server";

// E-mail transacional via Resend (https://resend.com), só com fetch.
// Sem RESEND_API_KEY o link vai para o log do servidor (útil para rodar local).

export function appUrl(req: NextRequest) {
  return (process.env.APP_URL ?? req.nextUrl.origin).replace(/\/$/, "");
}

function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(title: string, body: string, cta: { label: string; url: string }) {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4efe4;font-family:Arial,Helvetica,sans-serif;color:#191714">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#faf7f0;border:1px solid #191714;border-radius:16px;box-shadow:4px 4px 0 #191714">
<tr><td style="padding:32px">
<p style="margin:0 0 24px;font-size:20px;font-weight:800;letter-spacing:-0.5px">concord</p>
<h1 style="margin:0 0 12px;font-size:26px;line-height:1.15">${escape(title)}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#3a3631">${body}</p>
<a href="${cta.url}" style="display:inline-block;background:#ff4f1f;color:#faf7f0;text-decoration:none;font-weight:700;padding:14px 26px;border-radius:999px;border:1px solid #191714">${escape(cta.label)}</a>
<p style="margin:24px 0 0;font-size:12px;color:#6f685d">Se o botão não abrir, copia este link:<br><span style="word-break:break-all">${cta.url}</span></p>
</td></tr></table>
<p style="font-size:12px;color:#9a9284">Não foi você? Pode ignorar este e-mail.</p>
</td></tr></table></body></html>`;
}

export async function sendMail(to: string, subject: string, html: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[concord] (sem RESEND_API_KEY) e-mail para ${to}: ${subject}\n${text}`);
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM ?? "Concord <onboarding@resend.dev>", to: [to], subject, html, text }),
  });
  if (!res.ok) console.error("[concord] Resend recusou o e-mail", res.status, await res.text().catch(() => ""));
  return res.ok;
}

export function resetEmail(url: string) {
  return {
    subject: "Trocar sua senha do Concord",
    html: layout("Bora trocar a senha?", "Alguém (tomara que você) pediu pra trocar a senha da sua conta. O link vale por 1 hora.", {
      label: "Trocar senha",
      url,
    }),
    text: `Pra trocar a senha do Concord, abre este link (vale por 1 hora): ${url}`,
  };
}

export function verifyEmail(url: string, name: string) {
  return {
    subject: "Confirma seu e-mail no Concord",
    html: layout(`Oi, ${name}!`, "Falta só confirmar que esse e-mail é seu. É um clique.", { label: "Confirmar e-mail", url }),
    text: `Oi, ${name}! Confirma seu e-mail no Concord: ${url}`,
  };
}
