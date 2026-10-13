import { hashPassword, requireAuth, requireMe, revokeOtherSessions, verifyPassword } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { dispatch, dispatchToUsers } from "@/lib/server/events";
import { ApiError, Errors, json, readJson, route } from "@/lib/server/http";
import { serializeMember, serializeSelf, serializeUser, sid } from "@/lib/server/serialize";
import { Form, USERNAME_PATTERN, idParam } from "@/lib/server/validate";

type Params = { userId: string };

// GET /api/v1/users/@me  |  GET /api/v1/users/{id}
export const GET = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const { userId } = await params;
  if (userId === "@me") return json(serializeSelf(user));
  const target = await db.user.findUnique({ where: { id: idParam(userId, Errors.unknownUser) } });
  if (!target) throw Errors.unknownUser();
  return json(serializeUser(target));
});

// PATCH /api/v1/users/@me { username?, global_name?, avatar?, bio?, password + new_password? }
export const PATCH = route<Params>(async (req, { params }) => {
  const { user, token } = await requireAuth(req);
  requireMe((await params).userId);

  const body = await readJson(req);
  if (typeof body.username === "string") body.username = body.username.trim().toLowerCase();
  const form = new Form(body);
  const username = form.optionalString("username", { min: 2, max: 32, pattern: USERNAME_PATTERN });
  const globalName = form.optionalString("global_name", { min: 1, max: 32 });
  const avatar = form.optionalString("avatar", { max: 512, pattern: /^https:\/\/\S+$/ });
  const bio = form.optionalString("bio", { max: 190 });
  const newPassword = form.optionalString("new_password", { min: 8, max: 72, trim: false });
  const password = form.optionalString("password", { max: 72, trim: false });
  form.done();

  // trocar username ou senha exige a senha atual
  if ((username && username !== user.username) || newPassword) {
    if (!password || !(await verifyPassword(password, user.passwordHash))) {
      throw new ApiError(400, 50035, "Invalid Form Body", {
        password: { _errors: [{ code: "PASSWORD_DOES_NOT_MATCH", message: "Password does not match." }] },
      });
    }
  }

  const updated = await db.user.update({
    where: { id: user.id },
    data: {
      ...(username !== undefined && username !== null ? { username } : {}),
      ...(globalName !== undefined ? { globalName } : {}),
      ...(avatar !== undefined ? { avatar } : {}),
      ...(bio !== undefined ? { bio } : {}),
      ...(newPassword ? { passwordHash: await hashPassword(newPassword) } : {}),
    },
  });
  if (newPassword) await revokeOtherSessions(user.id, token);

  await dispatchToUsers("USER_UPDATE", serializeSelf(updated), [user.id]);
  // os outros veem o novo nome pelas guilds em comum
  const memberships = await db.member.findMany({ where: { userId: user.id }, include: { roles: true } });
  for (const m of memberships) {
    await dispatch(
      "GUILD_MEMBER_UPDATE",
      { guild_id: sid(m.guildId), ...serializeMember({ ...m, user: updated }) },
      { guildId: m.guildId },
    );
  }
  return json(serializeSelf(updated));
});
