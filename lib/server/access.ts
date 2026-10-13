import type { Channel, ChannelRecipient, Guild, Member, MemberRole, PermissionOverwrite, Role } from "@prisma/client";
import { db } from "./db";
import { Errors } from "./http";
import {
  DM_PERMISSIONS,
  Permissions,
  computeBasePermissions,
  computeChannelPermissions,
  has,
} from "./permissions";

export type MemberContext = {
  guild: Guild;
  member: Member & { roles: MemberRole[] };
  roles: Role[]; // todos os cargos da guild
  roleIds: bigint[]; // cargos do membro
  isOwner: boolean;
  permissions: bigint;
  highestPosition: number;
};

export function highestPosition(roles: Role[], roleIds: bigint[]) {
  let top = 0;
  for (const r of roles) if (roleIds.includes(r.id) && r.position > top) top = r.position;
  return top;
}

export async function loadMemberContext(guildId: bigint, userId: bigint): Promise<MemberContext | null> {
  const [guild, member, roles] = await Promise.all([
    db.guild.findUnique({ where: { id: guildId } }),
    db.member.findUnique({ where: { guildId_userId: { guildId, userId } }, include: { roles: true } }),
    db.role.findMany({ where: { guildId } }),
  ]);
  if (!guild || !member) return null;
  const roleIds = member.roles.map((r) => r.roleId);
  const everyone = roles.find((r) => r.id === guildId);
  const permissions = computeBasePermissions({
    userId,
    ownerId: guild.ownerId,
    everyonePermissions: everyone?.permissions ?? BigInt(0),
    rolePermissions: roles.filter((r) => roleIds.includes(r.id)).map((r) => r.permissions),
  });
  return {
    guild,
    member,
    roles,
    roleIds,
    isOwner: guild.ownerId === userId,
    permissions,
    highestPosition: highestPosition(roles, roleIds),
  };
}

export async function requireMember(guildId: bigint, userId: bigint): Promise<MemberContext> {
  const ctx = await loadMemberContext(guildId, userId);
  if (ctx) return ctx;
  const exists = await db.guild.count({ where: { id: guildId } });
  throw exists ? Errors.missingAccess() : Errors.unknownGuild();
}

export function requirePermission(ctx: { permissions: bigint }, ...flags: bigint[]) {
  for (const flag of flags) if (!has(ctx.permissions, flag)) throw Errors.missingPermissions();
}

// Hierarquia: dono sempre pode; os outros só agem sobre quem está abaixo do seu cargo mais alto.
export function outranks(actor: MemberContext, targetPosition: number) {
  return actor.isOwner || actor.highestPosition > targetPosition;
}

export type ChannelWithRelations = Channel & {
  overwrites: PermissionOverwrite[];
  recipients: ChannelRecipient[];
};

export type ChannelContext = {
  channel: ChannelWithRelations;
  member: MemberContext | null; // null em DMs
  permissions: bigint;
  recipientIds: bigint[];
};

export function channelPermissions(member: MemberContext, channel: { overwrites: PermissionOverwrite[] }, userId: bigint) {
  return computeChannelPermissions({
    base: member.permissions,
    overwrites: channel.overwrites,
    guildId: member.guild.id,
    roleIds: member.roleIds,
    userId,
  });
}

export async function loadChannelContext(channelId: bigint, userId: bigint): Promise<ChannelContext> {
  const channel = await db.channel.findUnique({
    where: { id: channelId },
    include: { overwrites: true, recipients: true },
  });
  if (!channel) throw Errors.unknownChannel();

  const recipientIds = channel.recipients.map((r) => r.userId);
  if (channel.guildId == null) {
    if (!recipientIds.includes(userId)) throw Errors.unknownChannel();
    return { channel, member: null, permissions: DM_PERMISSIONS, recipientIds };
  }

  const member = await loadMemberContext(channel.guildId, userId);
  if (!member) throw Errors.missingAccess();
  const permissions = channelPermissions(member, channel, userId);
  if (!has(permissions, Permissions.VIEW_CHANNEL)) throw Errors.missingAccess();
  return { channel, member, permissions, recipientIds };
}

// Versão que nunca lança: devolve 0 quando não há acesso (usada pelo gateway)
export async function permissionsInChannel(channelId: bigint, userId: bigint): Promise<bigint> {
  try {
    return (await loadChannelContext(channelId, userId)).permissions;
  } catch {
    return BigInt(0);
  }
}

export function isTextLike(type: number) {
  return type === 0 || type === 1 || type === 3;
}
