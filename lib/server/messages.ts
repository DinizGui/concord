import type { Attachment, Message, Prisma, Reaction, User } from "@prisma/client";
import { db } from "./db";
import { serializeMember, serializeUser, sid, timestampOf } from "./serialize";

type AttachmentMeta = Omit<Attachment, "data">;
type MessageRow = Message & { author: User; reactions: Reaction[]; attachments?: AttachmentMeta[] };

// "data" (bytes do arquivo) nunca vem junto: só os metadados
export const attachmentSelect = {
  id: true,
  channelId: true,
  uploaderId: true,
  messageId: true,
  filename: true,
  contentType: true,
  size: true,
  width: true,
  height: true,
  token: true,
  url: true,
  createdAt: true,
} satisfies Prisma.AttachmentSelect;

const include = {
  author: true,
  reactions: true,
  attachments: { select: attachmentSelect, orderBy: { id: "asc" } },
} satisfies Prisma.MessageInclude;

export function attachmentUrl(a: AttachmentMeta) {
  return a.url ?? `/api/v1/attachments/${a.id}/${a.token}/${encodeURIComponent(a.filename)}`;
}

export function serializeAttachment(a: AttachmentMeta) {
  const url = attachmentUrl(a);
  return {
    id: sid(a.id),
    filename: a.filename,
    size: a.size,
    url,
    proxy_url: url,
    content_type: a.contentType,
    width: a.width,
    height: a.height,
  };
}

function idsFromJson(value: Prisma.JsonValue | null): bigint[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string").map((v) => BigInt(v));
}

function aggregateReactions(reactions: Reaction[], viewerId?: bigint) {
  const byEmoji = new Map<string, { count: number; me: boolean; first: number }>();
  reactions.forEach((r, i) => {
    const entry = byEmoji.get(r.emoji) ?? { count: 0, me: false, first: i };
    entry.count += 1;
    if (viewerId != null && r.userId === viewerId) entry.me = true;
    byEmoji.set(r.emoji, entry);
  });
  return [...byEmoji.entries()]
    .sort((a, b) => a[1].first - b[1].first)
    .map(([name, e]) => ({ emoji: { id: null, name }, count: e.count, me: e.me }));
}

// Serializa mensagens buscando, de uma vez, usuários mencionados e mensagens respondidas.
export async function serializeMessages(rows: MessageRow[], opts: { viewerId?: bigint; guildId?: bigint | null } = {}) {
  const mentionIds = new Set<string>();
  const refIds = new Set<string>();
  for (const m of rows) {
    idsFromJson(m.mentions).forEach((id) => mentionIds.add(id.toString()));
    if (m.referencedMessageId) refIds.add(m.referencedMessageId.toString());
  }

  const [mentioned, referenced, threads] = await Promise.all([
    mentionIds.size ? db.user.findMany({ where: { id: { in: [...mentionIds].map(BigInt) } } }) : [],
    refIds.size
      ? db.message.findMany({ where: { id: { in: [...refIds].map(BigInt) } }, include })
      : ([] as MessageRow[]),
    // threads que nasceram destas mensagens (id da thread = id da mensagem)
    rows.length
      ? db.channel.findMany({ where: { id: { in: rows.map((m) => m.id) }, type: 11 }, select: { id: true, name: true, messageCount: true, archived: true } })
      : [],
  ]);
  const threadById = new Map(threads.map((t) => [t.id.toString(), t]));
  const userById = new Map(mentioned.map((u) => [u.id.toString(), u]));
  const refById = new Map(referenced.map((m) => [m.id.toString(), m]));

  const base = (m: MessageRow) => ({
    id: sid(m.id),
    channel_id: sid(m.channelId),
    ...(opts.guildId ? { guild_id: sid(opts.guildId) } : {}),
    // mensagem de webhook aparece com o nome/foto do webhook, não de quem o criou
    author: m.webhookId
      ? { id: sid(m.webhookId), username: m.authorName ?? "Webhook", global_name: null, avatar: m.authorAvatar, bio: null, bot: true }
      : serializeUser(m.author),
    ...(m.webhookId ? { webhook_id: sid(m.webhookId) } : {}),
    content: m.content,
    timestamp: timestampOf(m.id),
    edited_timestamp: m.editedAt ? m.editedAt.toISOString() : null,
    type: m.type,
    pinned: m.pinned,
    tts: false,
    mention_everyone: m.mentionEveryone,
    mentions: idsFromJson(m.mentions)
      .map((id) => userById.get(id.toString()))
      .filter((u): u is User => !!u)
      .map(serializeUser),
    mention_roles: idsFromJson(m.mentionRoles).map(String),
    attachments: (m.attachments ?? []).map(serializeAttachment),
    embeds: [],
    reactions: aggregateReactions(m.reactions, opts.viewerId),
  });

  return rows.map((m) => {
    const ref = m.referencedMessageId ? refById.get(m.referencedMessageId.toString()) : undefined;
    const thread = threadById.get(m.id.toString());
    return {
      ...base(m),
      ...(thread
        ? { thread: { id: sid(thread.id), name: thread.name, message_count: thread.messageCount, archived: thread.archived } }
        : {}),
      ...(m.referencedMessageId
        ? {
            message_reference: { message_id: sid(m.referencedMessageId), channel_id: sid(m.channelId) },
            referenced_message: ref ? { ...base(ref), mentions: [] } : null,
          }
        : {}),
    };
  });
}

export async function loadMessage(channelId: bigint, messageId: bigint) {
  return db.message.findFirst({ where: { id: messageId, channelId }, include });
}

export async function serializeOne(row: MessageRow, opts: { viewerId?: bigint; guildId?: bigint | null } = {}) {
  return (await serializeMessages([row], opts))[0];
}

export async function fetchMessages(
  channelId: bigint,
  q: { limit: number; before?: bigint; after?: bigint; around?: bigint },
) {
  // Retorna do mais novo para o mais antigo, como o Discord
  if (q.around) {
    const half = Math.floor(q.limit / 2);
    const [older, newer] = await Promise.all([
      db.message.findMany({ where: { channelId, id: { lte: q.around } }, orderBy: { id: "desc" }, take: q.limit - half, include }),
      db.message.findMany({ where: { channelId, id: { gt: q.around } }, orderBy: { id: "asc" }, take: half, include }),
    ]);
    return [...newer.reverse(), ...older];
  }
  if (q.after) {
    const rows = await db.message.findMany({ where: { channelId, id: { gt: q.after } }, orderBy: { id: "asc" }, take: q.limit, include });
    return rows.reverse();
  }
  return db.message.findMany({
    where: { channelId, ...(q.before ? { id: { lt: q.before } } : {}) },
    orderBy: { id: "desc" },
    take: q.limit,
    include,
  });
}

export async function memberPayload(guildId: bigint, userId: bigint) {
  const member = await db.member.findUnique({
    where: { guildId_userId: { guildId, userId } },
    include: { roles: true },
  });
  return member ? serializeMember(member) : null;
}

export const messageInclude = include;
