import { db } from "./db";
import { dispatch, dispatchToUsers } from "./events";
import { effectiveStatus, serializePresence } from "./serialize";

export const PRESENCE_TIMEOUT_MS = 90_000;
export const PRESENCE_STATUSES = ["online", "idle", "dnd", "invisible"] as const;

// Avisa as guilds do usuário e os amigos que a presença mudou
export async function broadcastPresence(userId: bigint) {
  const presence = await db.presence.findUnique({ where: { userId } });
  if (!presence) return;
  const [memberships, friends] = await Promise.all([
    db.member.findMany({ where: { userId }, select: { guildId: true } }),
    db.relationship.findMany({ where: { userId, type: 1 }, select: { targetId: true } }),
  ]);
  await Promise.all(
    memberships.map((m) => dispatch("PRESENCE_UPDATE", serializePresence(presence, m.guildId), { guildId: m.guildId })),
  );
  await dispatchToUsers(
    "PRESENCE_UPDATE",
    serializePresence(presence),
    friends.map((f) => f.targetId),
  );
}

// Marca o usuário como conectado. Só faz broadcast se o status visível mudou.
export async function touchPresence(userId: bigint) {
  const before = await db.presence.findUnique({ where: { userId } });
  const now = new Date();
  const after = await db.presence.upsert({
    where: { userId },
    create: { userId, online: true, lastSeenAt: now },
    update: { online: true, lastSeenAt: now },
  });
  if (effectiveStatus(before) !== effectiveStatus(after)) await broadcastPresence(userId);
}

export async function setPresenceStatus(userId: bigint, status: string, customStatus?: string | null) {
  const before = await db.presence.findUnique({ where: { userId } });
  const after = await db.presence.upsert({
    where: { userId },
    create: { userId, status, customStatus: customStatus ?? null, online: true },
    update: { status, ...(customStatus !== undefined ? { customStatus } : {}) },
  });
  if (effectiveStatus(before) !== effectiveStatus(after) || before?.customStatus !== after.customStatus) {
    await broadcastPresence(userId);
  }
  return after;
}
