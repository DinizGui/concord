// Conversão dos modelos do Prisma para objetos no formato da API do Discord (snake_case, ids em string).
import type {
  Ban,
  Channel,
  Guild,
  Invite,
  Member,
  MemberRole,
  PermissionOverwrite,
  Presence,
  ReadState,
  Relationship,
  Role,
  User,
  VoiceState,
} from "@prisma/client";
import { snowflakeDate } from "./snowflake";

export const sid = (v: bigint | null | undefined) => (v == null ? null : v.toString());
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export type PublicUser = Pick<User, "id" | "username" | "globalName" | "avatar" | "bio">;

export function serializeUser(user: PublicUser) {
  return {
    id: sid(user.id),
    username: user.username,
    global_name: user.globalName,
    avatar: user.avatar,
    bio: user.bio,
  };
}

export function serializeSelf(user: User) {
  return {
    ...serializeUser(user),
    email: user.email,
    created_at: iso(user.createdAt),
  };
}

export function serializeGuild(guild: Guild) {
  return {
    id: sid(guild.id),
    name: guild.name,
    icon: guild.icon,
    description: guild.description,
    owner_id: sid(guild.ownerId),
    system_channel_id: sid(guild.systemChannelId),
    created_at: iso(guild.createdAt),
  };
}

export function serializeRole(role: Role) {
  return {
    id: sid(role.id),
    name: role.name,
    color: role.color,
    permissions: role.permissions.toString(),
    position: role.position,
    hoist: role.hoist,
    mentionable: role.mentionable,
    managed: false,
  };
}

export function serializeOverwrite(o: PermissionOverwrite) {
  return { id: sid(o.targetId), type: o.type, allow: o.allow.toString(), deny: o.deny.toString() };
}

export function serializeChannel(
  channel: Channel,
  extra: { overwrites?: PermissionOverwrite[]; recipients?: PublicUser[] } = {},
) {
  const base = {
    id: sid(channel.id),
    type: channel.type,
    last_message_id: sid(channel.lastMessageId),
  };
  if (channel.guildId == null) {
    return {
      ...base,
      name: channel.name,
      icon: channel.icon,
      owner_id: sid(channel.ownerId),
      recipients: (extra.recipients ?? []).map(serializeUser),
    };
  }
  return {
    ...base,
    guild_id: sid(channel.guildId),
    name: channel.name,
    topic: channel.topic,
    position: channel.position,
    parent_id: sid(channel.parentId),
    nsfw: channel.nsfw,
    rate_limit_per_user: channel.rateLimitPerUser,
    bitrate: channel.bitrate,
    user_limit: channel.userLimit,
    last_pin_timestamp: iso(channel.lastPinAt),
    permission_overwrites: (extra.overwrites ?? []).map(serializeOverwrite),
  };
}

export function serializeMember(member: Member & { roles: MemberRole[]; user?: PublicUser }) {
  return {
    ...(member.user ? { user: serializeUser(member.user) } : {}),
    nick: member.nick,
    roles: member.roles.map((r) => sid(r.roleId)),
    joined_at: iso(member.joinedAt),
  };
}

export function serializeInvite(
  invite: Invite,
  extra: { guild?: Guild; channel?: Channel; inviter?: PublicUser; memberCount?: number; onlineCount?: number } = {},
) {
  return {
    code: invite.code,
    guild: extra.guild ? { id: sid(extra.guild.id), name: extra.guild.name, icon: extra.guild.icon, description: extra.guild.description } : undefined,
    channel: extra.channel ? { id: sid(extra.channel.id), name: extra.channel.name, type: extra.channel.type } : undefined,
    inviter: extra.inviter ? serializeUser(extra.inviter) : undefined,
    uses: invite.uses,
    max_uses: invite.maxUses,
    max_age: invite.maxAge,
    temporary: invite.temporary,
    created_at: iso(invite.createdAt),
    expires_at: iso(invite.expiresAt),
    approximate_member_count: extra.memberCount,
    approximate_presence_count: extra.onlineCount,
  };
}

export function serializeRelationship(rel: Relationship & { target: PublicUser }) {
  return { id: sid(rel.targetId), type: rel.type, user: serializeUser(rel.target), since: iso(rel.since) };
}

export function effectiveStatus(p: Pick<Presence, "online" | "status"> | null | undefined) {
  if (!p || !p.online || p.status === "invisible") return "offline";
  return p.status;
}

export function serializePresence(p: Presence, guildId?: bigint) {
  return {
    user: { id: sid(p.userId) },
    ...(guildId ? { guild_id: sid(guildId) } : {}),
    status: effectiveStatus(p),
    custom_status: effectiveStatus(p) === "offline" ? null : p.customStatus,
    last_seen_at: iso(p.lastSeenAt),
  };
}

export function serializeReadState(rs: ReadState) {
  return { id: sid(rs.channelId), last_message_id: sid(rs.lastMessageId), mention_count: rs.mentionCount };
}

export function serializeVoiceState(vs: VoiceState) {
  return {
    user_id: sid(vs.userId),
    guild_id: sid(vs.guildId),
    channel_id: sid(vs.channelId),
    session_id: vs.sessionId,
    self_mute: vs.selfMute,
    self_deaf: vs.selfDeaf,
  };
}

export function serializeBan(ban: Ban & { user: PublicUser }) {
  return { reason: ban.reason, user: serializeUser(ban.user) };
}

export function timestampOf(id: bigint) {
  return snowflakeDate(id).toISOString();
}
