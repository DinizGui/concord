import { hashPassword } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { noContent, readJson, route } from "@/lib/server/http";
import { clientIp, limit } from "@/lib/server/ratelimit";
import { consumeAuthToken } from "@/lib/server/tokens";
import { Form } from "@/lib/server/validate";

// POST /api/v1/auth/reset { token, password }
// Troca a senha e derruba todas as sessões abertas.
export const POST = route(async (req) => {
  await limit("forgotIp", clientIp(req));
  const form = new Form(await readJson(req));
  const token = form.string("token", { max: 128 });
  const password = form.string("password", { min: 8, max: 72, trim: false });
  form.done();

  const userId = await consumeAuthToken(token!, "reset");
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password!) } }),
    db.session.deleteMany({ where: { userId } }),
    // quem recebeu o link no e-mail provou que é dono dele
    db.user.updateMany({ where: { id: userId, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } }),
  ]);
  return noContent();
});
