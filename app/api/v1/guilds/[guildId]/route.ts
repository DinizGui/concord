import { requireAuth } from "@/lib/server/auth";
import { requireMember, requirePermission } from "@/lib/server/access";
import { db } from "@/lib/server/db";
import { dispatch, dispatchToUsers } from "@/lib/server/events";
import { ApiError, Errors, json, noContent, readJson, route } from "@/lib/server/http";
import { Permissions } from "@/lib/server/permissions";
import { serializeGuild, serializeRole, sid } from "@/lib/server/serialize";
import { Form, idParam } from "@/lib/server/validate";

type Params = { guildId: string };

// GET /api/v1/guilds/{id}?with_counts=true
export const GET = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const guildId = idParam((await params).guildId, Errors.unknownGuild);
  const ctx = await requireMember(guildId, user.id);

  const withCounts = req.nextUrl.searchParams.get("with_counts") === "true";
  const counts = withCounts
    ? await Promise.all([
        db.member.count({ where: { guildId } }),
        db.presence.count({ where: { online: true, status: { not: "invisible" }, user: { memberships: { some: { guildId } } } } }),
      ])
    : null;

  return json({
    ...serializeGuild(ctx.guild),
    roles: ctx.roles.sort((a, b) => a.position - b.position).map(serializeRole),
    ...(counts ? { approximate_member_count: counts[0], approximate_presence_count: counts[1] } : {}),
  });
});

// PATCH /api/v1/guilds/{id} { name?, icon?, description?, system_channel_id?, owner_id? }
export const PATCH = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const guildId = idParam((await params).guildId, Errors.unknownGuild);
  const ctx = await requireMember(guildId, user.id);
  requirePermission(ctx, Permissions.MANAGE_GUILD);

  const form = new Form(await readJson(req));
  const name = form.optionalString("name", { min: 2, max: 100 });
  const icon = form.optionalString("icon", { max: 512, pattern: /^https:\/\/\S+$/ });
  const description = form.optionalString("description", { max: 300 });
  const systemChannelId = form.snowflake("system_channel_id");
  const ownerId = form.snowflake("owner_id");
  form.done();
  if (name === null) throw Errors.badRequest("name cannot be null");

  if (systemChannelId) {
    const ch = await db.channel.findFirst({ where: { id: systemChannelId, guildId, type: 0 } });
    if (!ch) throw Errors.unknownChannel();
  }
  if (ownerId != null && ownerId !== ctx.guild.ownerId) {
    if (!ctx.isOwner) throw new ApiError(403, 50013, "Only the owner can transfer ownership");
    const target = await db.member.findUnique({ where: { guildId_userId: { guildId, userId: ownerId } } });
    if (!target) throw Errors.unknownMember();
  }

  const guild = await db.guild.update({
    where: { id: guildId },
    data: {
      ...(name ? { name } : {}),
      ...(icon !== undefined ? { icon } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(systemChannelId !== undefined ? { systemChannelId } : {}),
      ...(ownerId ? { ownerId } : {}),
    },
  });
  await dispatch("GUILD_UPDATE", serializeGuild(guild), { guildId });
  return json(serializeGuild(guild));
});

// DELETE /api/v1/guilds/{id}: só o dono
export const DELETE = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const guildId = idParam((await params).guildId, Errors.unknownGuild);
  const ctx = await requireMember(guildId, user.id);
  if (!ctx.isOwner) throw Errors.missingPermissions();

  const members = await db.member.findMany({ where: { guildId }, select: { userId: true } });
  await db.guild.delete({ where: { id: guildId } });
  await dispatchToUsers("GUILD_DELETE", { id: sid(guildId) }, members.map((m) => m.userId));
  return noContent();
});
