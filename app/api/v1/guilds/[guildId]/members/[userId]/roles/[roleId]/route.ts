import { requireAuth } from "@/lib/server/auth";
import { highestPosition, outranks, requireMember, requirePermission } from "@/lib/server/access";
import { db } from "@/lib/server/db";
import { dispatch } from "@/lib/server/events";
import { Errors, noContent, route } from "@/lib/server/http";
import { Permissions } from "@/lib/server/permissions";
import { serializeMember, sid } from "@/lib/server/serialize";
import { idParam } from "@/lib/server/validate";
import type { NextRequest } from "next/server";

type Params = { guildId: string; userId: string; roleId: string };

async function change(req: NextRequest, params: Promise<Params>, add: boolean) {
  const { user } = await requireAuth(req);
  const p = await params;
  const guildId = idParam(p.guildId, Errors.unknownGuild);
  const userId = p.userId === "@me" ? user.id : idParam(p.userId, Errors.unknownMember);
  const roleId = idParam(p.roleId, Errors.unknownRole);

  const actor = await requireMember(guildId, user.id);
  requirePermission(actor, Permissions.MANAGE_ROLES);
  const role = actor.roles.find((r) => r.id === roleId);
  if (!role || role.id === guildId) throw Errors.unknownRole();
  if (!outranks(actor, role.position)) throw Errors.missingPermissions();

  const target = await db.member.findUnique({ where: { guildId_userId: { guildId, userId } }, include: { roles: true } });
  if (!target) throw Errors.unknownMember();
  if (userId !== user.id && !outranks(actor, highestPosition(actor.roles, target.roles.map((r) => r.roleId)))) {
    throw Errors.missingPermissions();
  }

  if (add) {
    await db.memberRole.upsert({
      where: { guildId_userId_roleId: { guildId, userId, roleId } },
      create: { guildId, userId, roleId },
      update: {},
    });
  } else {
    await db.memberRole.deleteMany({ where: { guildId, userId, roleId } });
  }

  const updated = await db.member.findUniqueOrThrow({
    where: { guildId_userId: { guildId, userId } },
    include: { roles: true, user: true },
  });
  await dispatch("GUILD_MEMBER_UPDATE", { guild_id: sid(guildId), ...serializeMember(updated) }, { guildId });
  return noContent();
}

// PUT/DELETE /api/v1/guilds/{id}/members/{user.id}/roles/{role.id}
export const PUT = route<Params>((req, { params }) => change(req, params, true));
export const DELETE = route<Params>((req, { params }) => change(req, params, false));
