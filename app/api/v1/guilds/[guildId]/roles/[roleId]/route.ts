import { requireAuth } from "@/lib/server/auth";
import { outranks, requireMember, requirePermission } from "@/lib/server/access";
import { db } from "@/lib/server/db";
import { dispatch } from "@/lib/server/events";
import { Errors, json, noContent, readJson, route } from "@/lib/server/http";
import { Permissions } from "@/lib/server/permissions";
import { serializeRole, sid } from "@/lib/server/serialize";
import { Form, idParam } from "@/lib/server/validate";
import type { NextRequest } from "next/server";

type Params = { guildId: string; roleId: string };

async function load(req: NextRequest, params: Promise<Params>) {
  const { user } = await requireAuth(req);
  const p = await params;
  const guildId = idParam(p.guildId, Errors.unknownGuild);
  const roleId = idParam(p.roleId, Errors.unknownRole);
  const ctx = await requireMember(guildId, user.id);
  requirePermission(ctx, Permissions.MANAGE_ROLES);
  const role = ctx.roles.find((r) => r.id === roleId);
  if (!role) throw Errors.unknownRole();
  // @everyone pode ser editado por quem tem MANAGE_ROLES; os outros só abaixo do seu cargo
  if (role.id !== guildId && !outranks(ctx, role.position)) throw Errors.missingPermissions();
  return { ctx, role, guildId };
}

// PATCH /api/v1/guilds/{id}/roles/{role.id} { name?, permissions?, color?, hoist?, mentionable? }
export const PATCH = route<Params>(async (req, { params }) => {
  const { ctx, role, guildId } = await load(req, params);

  const form = new Form(await readJson(req));
  const name = form.optionalString("name", { min: 1, max: 100 });
  const permissions = form.permissions("permissions");
  const color = form.int("color", { min: 0, max: 0xffffff });
  const hoist = form.bool("hoist");
  const mentionable = form.bool("mentionable");
  form.done();

  if (permissions !== undefined) {
    // só pode ligar/desligar bits que você tem
    const changed = permissions ^ role.permissions;
    if ((changed & ~ctx.permissions) !== BigInt(0)) throw Errors.missingPermissions();
  }

  const updated = await db.role.update({
    where: { id: role.id },
    data: {
      ...(name && role.id !== guildId ? { name } : {}),
      ...(permissions !== undefined ? { permissions } : {}),
      ...(color !== undefined ? { color } : {}),
      ...(hoist !== undefined ? { hoist } : {}),
      ...(mentionable !== undefined ? { mentionable } : {}),
    },
  });
  await dispatch("GUILD_ROLE_UPDATE", { guild_id: sid(guildId), role: serializeRole(updated) }, { guildId });
  return json(serializeRole(updated));
});

// DELETE /api/v1/guilds/{id}/roles/{role.id}
export const DELETE = route<Params>(async (req, { params }) => {
  const { role, guildId } = await load(req, params);
  if (role.id === guildId) throw Errors.badRequest("Cannot delete @everyone");

  await db.$transaction([
    db.role.delete({ where: { id: role.id } }),
    db.permissionOverwrite.deleteMany({ where: { targetId: role.id, type: 0 } }),
  ]);
  await dispatch("GUILD_ROLE_DELETE", { guild_id: sid(guildId), role_id: sid(role.id) }, { guildId });
  return noContent();
});
