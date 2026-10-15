// Formatos que a API devolve (mesmo padrão do Discord: snake_case, ids em string)

export type ApiUser = {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
  bio: string | null;
  email?: string;
  verified?: boolean;
  bot?: boolean;
};

export type ApiRole = {
  id: string;
  name: string;
  color: number;
  permissions: string;
  position: number;
  hoist: boolean;
};

export type ApiOverwrite = { id: string; type: number; allow: string; deny: string };

export type ApiChannel = {
  id: string;
  type: number; // 0 texto, 1 DM, 2 voz, 3 grupo, 4 categoria
  guild_id?: string;
  name: string | null;
  topic?: string | null;
  position?: number;
  parent_id?: string | null;
  last_message_id: string | null;
  rate_limit_per_user?: number;
  recipients?: ApiUser[];
  owner_id?: string | null;
  permission_overwrites?: ApiOverwrite[];
  message_count?: number;
  thread_metadata?: { archived: boolean };
};

export type ApiMember = { user?: ApiUser; nick: string | null; roles: string[]; joined_at: string };

export type ApiVoiceState = {
  user_id: string;
  guild_id: string;
  channel_id: string | null;
  session_id: string;
  self_mute: boolean;
  self_deaf: boolean;
};

export type ApiEmoji = { id: string; name: string; animated: boolean; url: string };

export type ApiGuild = {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
  owner_id: string;
  system_channel_id: string | null;
  permissions: string;
  member_count: number;
  roles: ApiRole[];
  channels: ApiChannel[];
  members: ApiMember[];
  voice_states: ApiVoiceState[];
  emojis?: ApiEmoji[];
};

export type ApiReaction = { emoji: { id: null; name: string }; count: number; me: boolean };

export type ApiMessage = {
  id: string;
  channel_id: string;
  guild_id?: string;
  author: ApiUser;
  content: string;
  timestamp: string;
  edited_timestamp: string | null;
  type: number;
  pinned: boolean;
  mentions: ApiUser[];
  mention_everyone: boolean;
  mention_roles: string[];
  reactions: ApiReaction[];
  attachments: ApiAttachment[];
  message_reference?: { message_id: string };
  thread?: { id: string; name: string; message_count: number; archived: boolean };
  webhook_id?: string;
  referenced_message?: ApiMessage | null;
  nonce?: string;
  // só no cliente
  pending?: boolean;
  failed?: boolean;
};

export type ApiAttachment = {
  id: string;
  filename: string;
  url: string;
  size: number;
  content_type: string | null;
  width?: number | null;
  height?: number | null;
};

export type ApiRelationship = { id: string; type: number; user: ApiUser; since: string };

export type ApiPresence = { user: { id: string }; status: Status; custom_status: string | null };

export type ApiReadState = { id: string; last_message_id: string | null; mention_count: number };

export type Status = "online" | "idle" | "dnd" | "offline" | "invisible";

export type Ready = {
  session_id: string;
  user: ApiUser;
  guilds: ApiGuild[];
  private_channels: ApiChannel[];
  relationships: ApiRelationship[];
  read_state: ApiReadState[];
  presences: ApiPresence[];
};

export type ApiInvite = {
  code: string;
  guild?: { id: string; name: string; icon: string | null; description: string | null };
  channel?: { id: string; name: string; type: number };
  inviter?: ApiUser;
  approximate_member_count?: number;
  approximate_presence_count?: number;
  expires_at: string | null;
};

export const Rel = { FRIEND: 1, BLOCKED: 2, INCOMING: 3, OUTGOING: 4 } as const;

export const Perm = {
  CREATE_INSTANT_INVITE: BigInt(1) << BigInt(0),
  KICK_MEMBERS: BigInt(1) << BigInt(1),
  ADMINISTRATOR: BigInt(1) << BigInt(3),
  MANAGE_CHANNELS: BigInt(1) << BigInt(4),
  MANAGE_GUILD: BigInt(1) << BigInt(5),
  MANAGE_MESSAGES: BigInt(1) << BigInt(13),
  MANAGE_WEBHOOKS: BigInt(1) << BigInt(29),
  MANAGE_GUILD_EXPRESSIONS: BigInt(1) << BigInt(30),
  ATTACH_FILES: BigInt(1) << BigInt(15),
} as const;

export function hasPerm(perms: string | undefined, flag: bigint) {
  if (!perms) return false;
  const p = BigInt(perms);
  return (p & Perm.ADMINISTRATOR) === Perm.ADMINISTRATOR || (p & flag) === flag;
}
