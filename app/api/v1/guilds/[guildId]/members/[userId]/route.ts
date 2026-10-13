import { requireAuth } from "@/lib/server/auth";
import { highestPosition, outranks, requireMember, requirePermission } from "@/lib/server/access";
import { db } from "@/lib/server/db";
import { dispatch } from "@/lib/server/events";
import { removeMember } from "@/lib/server/guilds";
import { Errors, json, noContent, readJson, route } from "@/lib/server/http";
import { Permissions } from "@/lib/server/permissions";
import { serializeMember, sid } from "@/lib/server/serialize";
import { Form, idParam } from "@/lib/server/validate";

type Params = { guildId: string; userId: string };

async function resolve(params: Promise<Params>, meId: bigint) {
  const p = await params;
  const guildId = idParam(p.guildId, Errors.unknownGuild);
  const userId = p.userId === "@me" ? meId : idParam(p.userId, Errors.unknownMember);
  return { guildId, userId };
}

async function loadTarget(guildId: bigint, userId: bigint) {
  const target = await db.member.findUnique({
    where: { guildId_userId: { guildId, userId } },
    include: { roles: true, user: true },
  });
  if (!target) throw Errors.unknownMember();
  return target;
}

// GET /api/v1/guilds/{id}/members/{user.id | @me}
export const GET = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const { guildId, userId } = await resolve(params, user.id);
  await requireMember(guildId, user.id);
  return json(serializeMember(await loadTarget(guildId, userId)));
});

// PATCH /api/v1/guilds/{id}/members/{user.id | @me} { nick?, roles? }
export const PATCH = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const { guildId, userId } = await resolve(params, user.id);
  const actor = await requireMember(guildId, user.id);
  const target = await loadTarget(guildId, userId);
  const self = userId === user.id;
  const targetTop = highestPosition(actor.roles, target.roles.map((r) => r.roleId));
  const isTargetOwner = actor.guild.ownerId === userId;

  const form = new Form(await readJson(req));
  const nick = form.optionalString("nick", { max: 32 });
  const roles = form.snowflakes("roles");
  form.done();

  if (nick !== undefined) {
    if (self) requirePermission(actor, Permissions.CHANGE_NICKNAME);
    else {
      requirePermission(actor, Permissions.MANAGE_NICKNAMES);
      if (isTargetOwner || !outranks(actor, targetTop)) throw Errors.missingPermissions();
    }
  }

  let roleIds: bigint[] | undefined;
  if (roles !== undefined) {
    requirePermission(actor, Permissions.MANAGE_ROLES);
    if (!self && (isTargetOwner || !outranks(actor, targetTop))) throw Errors.missingPermissions();
    roleIds = roles.filter((id) => id !== guildId);
    const valid = actor.roles.filter((r) => roleIds!.includes(r.id));
    if (valid.length !== roleIds.length) throw Errors.unknownRole();

    // só mexe em cargos abaixo do próprio cargo mais alto
    const current = target.roles.map((r) => r.roleId);
    const changed = actor.roles.filter(
      (r) => r.id !== guildId && current.includes(r.id) !== roleIds!.includes(r.id),
    );
    if (changed.some((r) => !outranks(actor, r.position))) throw Errors.missingPermissions();
  }

  await db.$transaction([
    ...(nick !== undefined
      ? [db.member.update({ where: { guildId_userId: { guildId, userId } }, data: { nick: nick || null } })]
      : []),
    ...(roleIds !== undefined
      ? [
          db.memberRole.deleteMany({ where: { guildId, userId } }),
          db.memberRole.createMany({ data: roleIds.map((roleId) => ({ guildId, userId, roleId })) }),
        ]
      : []),
  ]);

  const updated = await loadTarget(guildId, userId);
  const payload = { guild_id: sid(guildId), ...serializeMember(updated) };
  await dispatch("GUILD_MEMBER_UPDATE", payload, { guildId });
  return json(serializeMember(updated));
});

// DELETE /api/v1/guilds/{id}/members/{user.id}: expulsar
export const DELETE = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const { guildId, userId } = await resolve(params, user.id);
  const actor = await requireMember(guildId, user.id);
  requirePermission(actor, Permissions.KICK_MEMBERS);
  const target = await loadTarget(guildId, userId);

  if (actor.guild.ownerId === userId || userId === user.id) throw Errors.missingPermissions();
  if (!outranks(actor, highestPosition(actor.roles, target.roles.map((r) => r.roleId)))) {
    throw Errors.missingPermissions();
  }

  await removeMember(guildId, userId);
  return noContent();
});
