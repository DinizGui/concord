import { requireAuth } from "@/lib/server/auth";
import { highestPosition, outranks, requireMember, requirePermission } from "@/lib/server/access";
import { db } from "@/lib/server/db";
import { dispatch } from "@/lib/server/events";
import { removeMember } from "@/lib/server/guilds";
import { Errors, json, noContent, readJson, route } from "@/lib/server/http";
import { Permissions } from "@/lib/server/permissions";
import { serializeBan, serializeUser, sid } from "@/lib/server/serialize";
import { snowflakeFromDate } from "@/lib/server/snowflake";
import { Form, idParam } from "@/lib/server/validate";
import type { NextRequest } from "next/server";

type Params = { guildId: string; userId: string };

async function load(req: NextRequest, params: Promise<Params>) {
  const { user } = await requireAuth(req);
  const p = await params;
  const guildId = idParam(p.guildId, Errors.unknownGuild);
  const userId = idParam(p.userId, Errors.unknownUser);
  const ctx = await requireMember(guildId, user.id);
  requirePermission(ctx, Permissions.BAN_MEMBERS);
  return { user, guildId, userId, ctx };
}

// GET /api/v1/guilds/{id}/bans/{user.id}
export const GET = route<Params>(async (req, { params }) => {
  const { guildId, userId } = await load(req, params);
  const ban = await db.ban.findUnique({ where: { guildId_userId: { guildId, userId } }, include: { user: true } });
  if (!ban) throw Errors.unknownBan();
  return json(serializeBan(ban));
});

// PUT /api/v1/guilds/{id}/bans/{user.id} { reason?, delete_message_seconds? }
export const PUT = route<Params>(async (req, { params }) => {
  const { user, guildId, userId, ctx } = await load(req, params);
  const form = new Form(await readJson(req));
  const reason = form.optionalString("reason", { max: 512 });
  const deleteSeconds = form.int("delete_message_seconds", { min: 0, max: 604800 }) ?? 0;
  form.done();

  if (userId === user.id || userId === ctx.guild.ownerId) throw Errors.missingPermissions();
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) throw Errors.unknownUser();

  const member = await db.member.findUnique({ where: { guildId_userId: { guildId, userId } }, include: { roles: true } });
  if (member && !outranks(ctx, highestPosition(ctx.roles, member.roles.map((r) => r.roleId)))) {
    throw Errors.missingPermissions();
  }

  await db.ban.upsert({
    where: { guildId_userId: { guildId, userId } },
    create: { guildId, userId, reason: reason ?? null },
    update: { reason: reason ?? null },
  });
  if (member) await removeMember(guildId, userId);

  if (deleteSeconds > 0) {
    // apaga as mensagens recentes da pessoa nos canais da guild
    const since = new Date(Date.now() - deleteSeconds * 1000);
    const messages = await db.message.findMany({
      where: { authorId: userId, channel: { guildId }, id: { gte: snowflakeFromDate(since) } },
      select: { id: true, channelId: true },
    });
    if (messages.length) {
      await db.message.deleteMany({ where: { id: { in: messages.map((m) => m.id) } } });
      const byChannel = new Map<string, string[]>();
      for (const m of messages) {
        const list = byChannel.get(m.channelId.toString()) ?? [];
        list.push(m.id.toString());
        byChannel.set(m.channelId.toString(), list);
      }
      for (const [channelId, ids] of byChannel) {
        await dispatch(
          "MESSAGE_DELETE_BULK",
          { ids, channel_id: channelId, guild_id: sid(guildId) },
          { guildId, channelId: BigInt(channelId) },
        );
      }
    }
  }

  await dispatch("GUILD_BAN_ADD", { guild_id: sid(guildId), user: serializeUser(target) }, { guildId });
  return noContent();
});

// DELETE /api/v1/guilds/{id}/bans/{user.id}
export const DELETE = route<Params>(async (req, { params }) => {
  const { guildId, userId } = await load(req, params);
  const ban = await db.ban.findUnique({ where: { guildId_userId: { guildId, userId } }, include: { user: true } });
  if (!ban) throw Errors.unknownBan();
  await db.ban.delete({ where: { guildId_userId: { guildId, userId } } });
  await dispatch("GUILD_BAN_REMOVE", { guild_id: sid(guildId), user: serializeUser(ban.user) }, { guildId });
  return noContent();
});
