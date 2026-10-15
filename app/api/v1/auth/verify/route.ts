import { db } from "@/lib/server/db";
import { dispatchToUsers } from "@/lib/server/events";
import { noContent, readJson, route } from "@/lib/server/http";
import { serializeSelf } from "@/lib/server/serialize";
import { consumeAuthToken } from "@/lib/server/tokens";
import { Form } from "@/lib/server/validate";

// POST /api/v1/auth/verify { token }  (não precisa estar logado: o link pode abrir em outro aparelho)
export const POST = route(async (req) => {
  const form = new Form(await readJson(req));
  const token = form.string("token", { max: 128 });
  form.done();

  const userId = await consumeAuthToken(token!, "verify");
  const user = await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  await dispatchToUsers("USER_UPDATE", serializeSelf(user), [userId]);
  return noContent();
});
