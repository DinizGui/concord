import type { Channel, Guild, Member, MemberRole, PermissionOverwrite, Role, VoiceState } from "@prisma/client";
import { db } from "./db";
import { dispatch, dispatchToUsers } from "./events";
import { Permissions, computeBasePermissions, computeChannelPermissions, has } from "./permissions";
import {
  serializeChannel,
  serializeGuild,
  serializeMember,
  serializeRole,
  serializeVoiceState,
  sid,
} from "./serialize";

type GuildRow = Guild & {
  roles: Role[];
  channels: (Channel & { overwrites: PermissionOverwrite[] })[];
  voiceStates: VoiceState[];
  _count: { members: number };
};

export const guildInclude = {
  roles: true,
  channels: { include: { overwrites: true } },
  voiceStates: true,
  _count: { select: { members: true } },
} as const;

// Objeto completo da guild para um usuário (o mesmo que vai no READY e no GUILD_CREATE):
// só inclui os canais que ele pode ver.
export function guildPayload(guild: GuildRow, member: Member & { roles: MemberRole[] }) {
  const roleIds = member.roles.map((r) => r.roleId);
  const everyone = guild.roles.find((r) => r.id === guild.id);
  const base = computeBasePermissions({
    userId: member.userId,
    ownerId: guild.ownerId,
    everyonePermissions: everyone?.permissions ?? BigInt(0),
    rolePermissions: guild.roles.filter((r) => roleIds.includes(r.id)).map((r) => r.permissions),
  });
  const channels = guild.channels
    .filter((c) =>
      has(
        computeChannelPermissions({ base, overwrites: c.overwrites, guildId: guild.id, roleIds, userId: member.userId }),
        Permissions.VIEW_CHANNEL,
      ),
    )
    .sort((a, b) => a.position - b.position || Number(a.id - b.id));

  return {
    ...serializeGuild(guild),
    permissions: base.toString(),
    joined_at: member.joinedAt.toISOString(),
    member_count: guild._count.members,
    roles: guild.roles.sort((a, b) => a.position - b.position).map(serializeRole),
    channels: channels.map((c) => serializeChannel(c, { overwrites: c.overwrites })),
    members: [serializeMember(member)],
    voice_states: guild.voiceStates.map(serializeVoiceState),
  };
}

export async function loadGuildPayload(guildId: bigint, userId: bigint) {
  const [guild, member] = await Promise.all([
    db.guild.findUnique({ where: { id: guildId }, include: guildInclude }),
    db.member.findUnique({ where: { guildId_userId: { guildId, userId } }, include: { roles: true } }),
  ]);
  if (!guild || !member) return null;
  return guildPayload(guild, member);
}

// Tira alguém da guild (sair, expulsar, banir) e avisa todo mundo.
export async function removeMember(guildId: bigint, userId: bigint) {
  const voice = await db.voiceState.findFirst({ where: { userId, guildId } });
  await db.$transaction([
    db.voiceState.deleteMany({ where: { userId, guildId } }),
    db.member.delete({ where: { guildId_userId: { guildId, userId } } }),
  ]);
  if (voice) {
    await dispatch("VOICE_STATE_UPDATE", { ...serializeVoiceState(voice), channel_id: null }, { guildId });
  }
  const user = await db.user.findUnique({ where: { id: userId } });
  await dispatch(
    "GUILD_MEMBER_REMOVE",
    { guild_id: sid(guildId), user: user ? { id: sid(user.id), username: user.username } : { id: sid(userId) } },
    { guildId },
  );
  await dispatchToUsers("GUILD_DELETE", { id: sid(guildId) }, [userId]);
}

// Mensagem de sistema "fulano entrou" no canal de sistema da guild
export async function systemJoinMessage(guild: Guild, userId: bigint, messageId: bigint) {
  if (!guild.systemChannelId) return null;
  const channel = await db.channel.findUnique({ where: { id: guild.systemChannelId } });
  if (!channel) return null;
  const message = await db.message.create({
    data: { id: messageId, channelId: channel.id, authorId: userId, type: 7, content: "" },
    include: { author: true, reactions: true },
  });
  await db.channel.update({ where: { id: channel.id }, data: { lastMessageId: message.id } });
  return message;
}
