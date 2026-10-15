import { createSession, hashPassword, setSessionCookie } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { ApiError, json, readJson, route } from "@/lib/server/http";
import { serializeSelf } from "@/lib/server/serialize";
import { snowflake } from "@/lib/server/snowflake";
import { Form, USERNAME_PATTERN } from "@/lib/server/validate";
import { clientIp, limit } from "@/lib/server/ratelimit";
import { sendVerification } from "@/lib/server/verification";

// POST /api/v1/auth/register { email, username, password, global_name? }
export const POST = route(async (req) => {
  await limit("register", clientIp(req));
  const body = await readJson(req);
  if (typeof body.username === "string") body.username = body.username.trim().toLowerCase();
  if (typeof body.email === "string") body.email = body.email.trim().toLowerCase();

  const form = new Form(body);
  const email = form.string("email", { max: 254, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ });
  const username = form.string("username", { min: 2, max: 32, pattern: USERNAME_PATTERN });
  const password = form.string("password", { min: 8, max: 72, trim: false });
  const globalName = form.optionalString("global_name", { min: 1, max: 32 });
  form.done();

  const taken = await db.user.findFirst({
    where: { OR: [{ email: email! }, { username: username! }] },
    select: { email: true, username: true },
  });
  if (taken) {
    const errors: Record<string, unknown> = {};
    if (taken.username === username) {
      errors.username = { _errors: [{ code: "USERNAME_ALREADY_TAKEN", message: "Username is unavailable" }] };
    }
    if (taken.email === email) {
      errors.email = { _errors: [{ code: "EMAIL_ALREADY_REGISTERED", message: "Email is already registered" }] };
    }
    throw new ApiError(400, 50035, "Invalid Form Body", errors);
  }

  const user = await db.user.create({
    data: {
      id: snowflake(),
      email: email!,
      username: username!,
      globalName: globalName ?? null,
      passwordHash: await hashPassword(password!),
      presence: { create: {} },
    },
  });

  // confirmação de e-mail não trava o cadastro: se o envio falhar, dá pra pedir de novo no app
  await sendVerification(req, user).catch((err) => console.error("[concord] falha ao mandar confirmação", err));

  const token = await createSession(user.id, req.headers.get("user-agent"));
  const res = json({ token, user: serializeSelf(user) }, 201);
  setSessionCookie(res, token);
  return res;
});
