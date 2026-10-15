import { db } from "@/lib/server/db";
import { noContent, readJson, route } from "@/lib/server/http";
import { appUrl, resetEmail, sendMail } from "@/lib/server/mail";
import { clientIp, limit } from "@/lib/server/ratelimit";
import { createAuthToken } from "@/lib/server/tokens";
import { Form } from "@/lib/server/validate";

// POST /api/v1/auth/forgot { login (e-mail ou username) }
// Responde 204 sempre, exista a conta ou não (não entrega quem tem cadastro).
export const POST = route(async (req) => {
  await limit("forgotIp", clientIp(req));
  const form = new Form(await readJson(req));
  const login = form.string("login", { max: 254 });
  form.done();

  const key = login!.toLowerCase();
  const user = await db.user.findFirst({ where: key.includes("@") ? { email: key } : { username: key } });
  if (user) {
    try {
      await limit("forgotAccount", user.id);
      const token = await createAuthToken(user.id, "reset");
      const mail = resetEmail(`${appUrl(req)}/reset?token=${token}`);
      await sendMail(user.email, mail.subject, mail.html, mail.text);
    } catch (err) {
      // passou do limite da conta: segue calado, a resposta é a mesma
      if (!(err instanceof Error && "status" in err && (err as { status: number }).status === 429)) throw err;
    }
  }
  return noContent();
});
