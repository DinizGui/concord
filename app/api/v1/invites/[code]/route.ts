import { requireAuth } from "@/lib/server/auth";
import { channelPermissions, loadMemberContext } from "@/lib/server/access";
import { db } from "@/lib/server/db";
import { dispatch, dispatchToUsers } from "@/lib/server/events";
import { loadGuildPayload, systemJoinMessage } from "@/lib/server/guilds";
import { Errors, json, route } from "@/lib/server/http";
import { inviteInclude, inviteWithCounts, isInviteUsable } from "@/lib/server/invites";
import { serializeOne } from "@/lib/server/messages";
import { Permissions, has } from "@/lib/server/permissions";
import { serializeInvite, serializeMember, sid } from "@/lib/server/serialize";
import { snowflake } from "@/lib/server/snowflake";

type Params = { code: string };

const MAX_GUILDS = 100;

async function findInvite(code: string) {
  if (!/^[A-Za-z0-9-]{2,16}$/.test(code)) throw Errors.unknownInvite();
  const invite = await db.invite.findUnique({ where: { code }, include: inviteInclude });
  if (!invite || !isInviteUsable(invite)) throw Errors.unknownInvite();
  return invite;
}

// GET /api/v1/invites/{code}?with_counts=true: público (tela "Você foi convidado")
export const GET = route<Params>(async (req, { params }) => {
  const invite = await findInvite((await params).code);
  return json(await inviteWithCounts(invite, req.nextUrl.searchParams.get("with_counts") === "true"));
});

// POST /api/v1/invites/{code}: aceitar
export const POST = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const invite = await findInvite((await params).code);
  const guildId = invite.guildId;

  const already = await db.member.findUnique({ where: { guildId_userId: { guildId, userId: user.id } } });
  if (already) {
    return json({ ...(await inviteWithCounts(invite, false)), new_member: false });
  }
  if (await db.ban.findUnique({ where: { guildId_userId: { guildId, userId: user.id } } })) throw Errors.banned();
  if ((await db.member.count({ where: { userId: user.id } })) >= MAX_GUILDS) throw Errors.maxGuilds();

  // incrementa só se ainda tiver uso disponível (evita passar do limite em corrida)
  const used = await db.invite.updateMany({
    where: { code: invite.code, ...(invite.maxUses > 0 ? { uses: { lt: invite.maxUses } } : {}) },
    data: { uses: { increment: 1 } },
  });
  if (!used.count) throw Errors.unknownInvite();

  const member = await db.member.create({ data: { guildId, userId: user.id }, include: { roles: true, user: true } });

  await dispatch("GUILD_MEMBER_ADD", { guild_id: sid(guildId), ...serializeMember(member) }, { guildId });
  const payload = await loadGuildPayload(guildId, user.id);
  await dispatchToUsers("GUILD_CREATE", payload!, [user.id], { guildId });

  const joined = await systemJoinMessage(invite.guild, user.id, snowflake());
  if (joined) {
    await dispatch("MESSAGE_CREATE", await serializeOne(joined, { guildId }), { guildId, channelId: joined.channelId });
  }

  // se o canal do convite não estiver visível para o novato, não devolve ele
  const ctx = await loadMemberContext(guildId, user.id);
  const channel = await db.channel.findUnique({ where: { id: invite.channelId }, include: { overwrites: true } });
  const visible = ctx && channel && has(channelPermissions(ctx, channel, user.id), Permissions.VIEW_CHANNEL);

  return json({
    ...serializeInvite({ ...invite, uses: invite.uses + 1 }, {
      guild: invite.guild,
      channel: visible ? invite.channel : undefined,
      inviter: invite.inviter,
    }),
    new_member: true,
    guild_payload: payload,
  });
});

// DELETE /api/v1/invites/{code}: MANAGE_CHANNELS no canal ou MANAGE_GUILD
export const DELETE = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const code = (await params).code;
  const invite = await db.invite.findUnique({ where: { code }, include: inviteInclude });
  if (!invite) throw Errors.unknownInvite();

  const ctx = await loadMemberContext(invite.guildId, user.id);
  if (!ctx) throw Errors.unknownInvite();
  const channel = await db.channel.findUnique({ where: { id: invite.channelId }, include: { overwrites: true } });
  const channelPerms = channel ? channelPermissions(ctx, channel, user.id) : BigInt(0);
  if (!has(ctx.permissions, Permissions.MANAGE_GUILD) && !has(channelPerms, Permissions.MANAGE_CHANNELS)) {
    throw Errors.missingPermissions();
  }

  await db.invite.delete({ where: { code } });
  await dispatch(
    "INVITE_DELETE",
    { code, guild_id: sid(invite.guildId), channel_id: sid(invite.channelId) },
    { guildId: invite.guildId, channelId: invite.channelId },
  );
  return json(serializeInvite(invite, { guild: invite.guild, channel: invite.channel, inviter: invite.inviter }));
});
