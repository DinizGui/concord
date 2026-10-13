import type { Message, Prisma, Reaction, User } from "@prisma/client";
import { db } from "./db";
import { serializeMember, serializeUser, sid, timestampOf } from "./serialize";

type MessageRow = Message & { author: User; reactions: Reaction[] };

const include = { author: true, reactions: true } satisfies Prisma.MessageInclude;

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

  const [mentioned, referenced] = await Promise.all([
    mentionIds.size ? db.user.findMany({ where: { id: { in: [...mentionIds].map(BigInt) } } }) : [],
    refIds.size
      ? db.message.findMany({ where: { id: { in: [...refIds].map(BigInt) } }, include })
      : ([] as MessageRow[]),
  ]);
  const userById = new Map(mentioned.map((u) => [u.id.toString(), u]));
  const refById = new Map(referenced.map((m) => [m.id.toString(), m]));

  const base = (m: MessageRow) => ({
    id: sid(m.id),
    channel_id: sid(m.channelId),
    ...(opts.guildId ? { guild_id: sid(opts.guildId) } : {}),
    author: serializeUser(m.author),
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
    attachments: [],
    embeds: [],
    reactions: aggregateReactions(m.reactions, opts.viewerId),
  });

  return rows.map((m) => {
    const ref = m.referencedMessageId ? refById.get(m.referencedMessageId.toString()) : undefined;
    return {
      ...base(m),
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
