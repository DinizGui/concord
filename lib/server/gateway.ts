import type { GatewayEvent } from "@prisma/client";
import { permissionsInChannel } from "./access";
import { db } from "./db";
import { guildInclude, guildPayload } from "./guilds";
import { Permissions, has } from "./permissions";
import {
  serializeChannel,
  serializePresence,
  serializeReadState,
  serializeRelationship,
  serializeSelf,
} from "./serialize";

// Opcodes do gateway do Discord. Aqui o transporte é SSE (servidor → cliente)
// + POST /api/v1/gateway (cliente → servidor), mas o formato das mensagens é o mesmo:
// { op, d, s, t }
export const Op = {
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  PRESENCE_UPDATE: 3,
  VOICE_STATE_UPDATE: 4,
  RESUME: 6,
  RECONNECT: 7,
  INVALID_SESSION: 9,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
} as const;

export const GATEWAY_VERSION = 1;
export const HEARTBEAT_INTERVAL_MS = 41_250;

export async function buildReady(userId: bigint, sessionId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });

  const [memberships, dms, relationships, readStates] = await Promise.all([
    db.member.findMany({ where: { userId }, include: { roles: true, guild: { include: guildInclude } } }),
    db.channel.findMany({
      where: { guildId: null, recipients: { some: { userId } } },
      include: { recipients: { include: { user: true } } },
      orderBy: { lastMessageId: "desc" },
    }),
    db.relationship.findMany({ where: { userId }, include: { target: true } }),
    db.readState.findMany({ where: { userId } }),
  ]);

  const guildIds = memberships.map((m) => m.guildId);
  const friendIds = relationships.filter((r) => r.type === 1).map((r) => r.targetId);

  const presences = await db.presence.findMany({
    where: {
      online: true,
      userId: { not: userId },
      OR: [
        ...(guildIds.length ? [{ user: { memberships: { some: { guildId: { in: guildIds } } } } }] : []),
        ...(friendIds.length ? [{ userId: { in: friendIds } }] : []),
      ],
    },
    take: 1000,
  });

  return {
    v: GATEWAY_VERSION,
    session_id: sessionId,
    user: serializeSelf(user),
    guilds: memberships.map((m) => guildPayload(m.guild, m)),
    private_channels: dms.map((c) =>
      serializeChannel(c, { recipients: c.recipients.filter((r) => r.userId !== userId).map((r) => r.user) }),
    ),
    relationships: relationships.map(serializeRelationship),
    read_state: readStates.map(serializeReadState),
    presences: (guildIds.length || friendIds.length ? presences : []).map((p) => serializePresence(p)),
  };
}

// Eventos de canal que só vão para quem tem VIEW_CHANNEL
const CHANNEL_SCOPED = new Set([
  "MESSAGE_CREATE",
  "MESSAGE_UPDATE",
  "MESSAGE_DELETE",
  "MESSAGE_DELETE_BULK",
  "MESSAGE_REACTION_ADD",
  "MESSAGE_REACTION_REMOVE",
  "MESSAGE_REACTION_REMOVE_ALL",
  "MESSAGE_REACTION_REMOVE_EMOJI",
  "TYPING_START",
  "CHANNEL_PINS_UPDATE",
  "CHANNEL_CREATE",
  "CHANNEL_UPDATE",
  "INVITE_CREATE",
  "INVITE_DELETE",
]);

// Quando chegam para mim, mudam em quais guilds/DMs estou
const MEMBERSHIP_CHANGES = new Set(["GUILD_CREATE", "GUILD_DELETE", "CHANNEL_CREATE", "CHANNEL_DELETE"]);

// Podem mudar o que eu enxergo
const PERMISSION_CHANGES = new Set([
  "GUILD_ROLE_CREATE",
  "GUILD_ROLE_UPDATE",
  "GUILD_ROLE_DELETE",
  "GUILD_MEMBER_UPDATE",
  "GUILD_UPDATE",
  "CHANNEL_CREATE",
  "CHANNEL_UPDATE",
  "CHANNEL_DELETE",
]);

const PERMISSION_CACHE_MS = 30_000;

// Assinatura de uma conexão: sabe quais eventos da fila pertencem ao usuário.
export class Subscription {
  private guildIds: bigint[] = [];
  private dmIds: bigint[] = [];
  private perms = new Map<string, { value: bigint; at: number }>();

  constructor(readonly userId: bigint) {}

  async refresh() {
    const [members, dms] = await Promise.all([
      db.member.findMany({ where: { userId: this.userId }, select: { guildId: true } }),
      db.channelRecipient.findMany({ where: { userId: this.userId }, select: { channelId: true } }),
    ]);
    this.guildIds = members.map((m) => m.guildId);
    this.dmIds = dms.map((d) => d.channelId);
    this.perms.clear();
  }

  fetch(after: bigint, limit = 100) {
    return db.gatewayEvent.findMany({
      where: {
        seq: { gt: after },
        OR: [
          { targetUserId: this.userId },
          ...(this.guildIds.length ? [{ targetUserId: null, guildId: { in: this.guildIds } }] : []),
          ...(this.dmIds.length ? [{ targetUserId: null, guildId: null, channelId: { in: this.dmIds } }] : []),
        ],
      },
      orderBy: { seq: "asc" },
      take: limit,
    });
  }

  needsRefresh(ev: GatewayEvent) {
    return ev.targetUserId === this.userId && MEMBERSHIP_CHANGES.has(ev.type);
  }

  observe(ev: GatewayEvent) {
    if (PERMISSION_CHANGES.has(ev.type)) this.perms.clear();
  }

  async canSee(ev: GatewayEvent) {
    if (ev.targetUserId != null || ev.guildId == null || ev.channelId == null) return true;
    if (!CHANNEL_SCOPED.has(ev.type)) return true;
    const key = ev.channelId.toString();
    let cached = this.perms.get(key);
    if (!cached || Date.now() - cached.at > PERMISSION_CACHE_MS) {
      cached = { value: await permissionsInChannel(ev.channelId, this.userId), at: Date.now() };
      this.perms.set(key, cached);
    }
    return has(cached.value, Permissions.VIEW_CHANNEL);
  }
}

export async function currentSeq() {
  const last = await db.gatewayEvent.findFirst({ orderBy: { seq: "desc" }, select: { seq: true } });
  return last?.seq ?? BigInt(0);
}

export async function oldestSeq() {
  const first = await db.gatewayEvent.findFirst({ orderBy: { seq: "asc" }, select: { seq: true } });
  return first?.seq ?? null;
}
