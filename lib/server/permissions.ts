// Bits de permissão e algoritmo de cálculo, iguais aos do Discord.

const bit = (n: number) => BigInt(1) << BigInt(n);
const ZERO = BigInt(0);

export const Permissions = {
  CREATE_INSTANT_INVITE: bit(0),
  KICK_MEMBERS: bit(1),
  BAN_MEMBERS: bit(2),
  ADMINISTRATOR: bit(3),
  MANAGE_CHANNELS: bit(4),
  MANAGE_GUILD: bit(5),
  ADD_REACTIONS: bit(6),
  VIEW_AUDIT_LOG: bit(7),
  PRIORITY_SPEAKER: bit(8),
  STREAM: bit(9),
  VIEW_CHANNEL: bit(10),
  SEND_MESSAGES: bit(11),
  SEND_TTS_MESSAGES: bit(12),
  MANAGE_MESSAGES: bit(13),
  EMBED_LINKS: bit(14),
  ATTACH_FILES: bit(15),
  READ_MESSAGE_HISTORY: bit(16),
  MENTION_EVERYONE: bit(17),
  USE_EXTERNAL_EMOJIS: bit(18),
  VIEW_GUILD_INSIGHTS: bit(19),
  CONNECT: bit(20),
  SPEAK: bit(21),
  MUTE_MEMBERS: bit(22),
  DEAFEN_MEMBERS: bit(23),
  MOVE_MEMBERS: bit(24),
  USE_VAD: bit(25),
  CHANGE_NICKNAME: bit(26),
  MANAGE_NICKNAMES: bit(27),
  MANAGE_ROLES: bit(28),
  MANAGE_WEBHOOKS: bit(29),
  MANAGE_GUILD_EXPRESSIONS: bit(30),
} as const;

const P = Permissions;

export const ALL_PERMISSIONS = Object.values(P).reduce((acc, flag) => acc | flag, ZERO);

export const DEFAULT_EVERYONE_PERMISSIONS =
  P.CREATE_INSTANT_INVITE |
  P.ADD_REACTIONS |
  P.STREAM |
  P.VIEW_CHANNEL |
  P.SEND_MESSAGES |
  P.EMBED_LINKS |
  P.ATTACH_FILES |
  P.READ_MESSAGE_HISTORY |
  P.USE_EXTERNAL_EMOJIS |
  P.CONNECT |
  P.SPEAK |
  P.USE_VAD |
  P.CHANGE_NICKNAME;

export const DM_PERMISSIONS =
  P.VIEW_CHANNEL |
  P.SEND_MESSAGES |
  P.READ_MESSAGE_HISTORY |
  P.ADD_REACTIONS |
  P.EMBED_LINKS |
  P.ATTACH_FILES |
  P.CONNECT |
  P.SPEAK |
  P.USE_VAD |
  P.STREAM;

export function has(perms: bigint, flag: bigint) {
  return (perms & flag) === flag;
}

export function computeBasePermissions(input: {
  userId: bigint;
  ownerId: bigint;
  everyonePermissions: bigint;
  rolePermissions: bigint[];
}): bigint {
  if (input.userId === input.ownerId) return ALL_PERMISSIONS;
  let perms = input.everyonePermissions;
  for (const rp of input.rolePermissions) perms |= rp;
  return has(perms, P.ADMINISTRATOR) ? ALL_PERMISSIONS : perms;
}

export type Overwrite = { targetId: bigint; type: number; allow: bigint; deny: bigint };

// Ordem do Discord: @everyone, depois cargos (somados), depois o membro.
export function computeChannelPermissions(input: {
  base: bigint;
  overwrites: Overwrite[];
  guildId: bigint;
  roleIds: bigint[];
  userId: bigint;
}): bigint {
  const { base, overwrites, guildId, roleIds, userId } = input;
  if (has(base, P.ADMINISTRATOR)) return ALL_PERMISSIONS;

  let perms = base;
  const everyone = overwrites.find((o) => o.targetId === guildId);
  if (everyone) perms = (perms & ~everyone.deny) | everyone.allow;

  let allow = ZERO;
  let deny = ZERO;
  for (const o of overwrites) {
    if (o.type === 0 && o.targetId !== guildId && roleIds.includes(o.targetId)) {
      allow |= o.allow;
      deny |= o.deny;
    }
  }
  perms = (perms & ~deny) | allow;

  const member = overwrites.find((o) => o.type === 1 && o.targetId === userId);
  if (member) perms = (perms & ~member.deny) | member.allow;

  // sem VIEW_CHANNEL o canal não existe para o usuário
  return has(perms, P.VIEW_CHANNEL) ? perms : ZERO;
}
