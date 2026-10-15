import { createSession, getDummyHash, setSessionCookie, verifyPassword } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { ApiError, json, readJson, route } from "@/lib/server/http";
import { serializeSelf } from "@/lib/server/serialize";
import { Form } from "@/lib/server/validate";
import { clientIp, limit } from "@/lib/server/ratelimit";

// POST /api/v1/auth/login { login (e-mail ou username), password }
export const POST = route(async (req) => {
  await limit("loginIp", clientIp(req));
  const form = new Form(await readJson(req));
  const login = form.string("login", { max: 254 });
  const password = form.string("password", { max: 72, trim: false });
  form.done();

  const key = login!.toLowerCase();
  await limit("loginAccount", key);
  const user = await db.user.findFirst({ where: key.includes("@") ? { email: key } : { username: key } });
  const ok = await verifyPassword(password!, user?.passwordHash ?? (await getDummyHash()));

  if (!user || !ok) {
    const invalid = { _errors: [{ code: "INVALID_LOGIN", message: "Login or password is invalid." }] };
    throw new ApiError(400, 50035, "Invalid Form Body", { login: invalid, password: invalid });
  }

  const token = await createSession(user.id, req.headers.get("user-agent"));
  const res = json({ token, user: serializeSelf(user) });
  setSessionCookie(res, token);
  return res;
});
