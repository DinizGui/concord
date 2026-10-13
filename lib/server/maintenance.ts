import { db } from "./db";
import { dispatch } from "./events";
import { PRESENCE_TIMEOUT_MS, broadcastPresence } from "./presence";
import { serializeVoiceState } from "./serialize";

const SWEEP_INTERVAL_MS = 30_000;
const EVENT_RETENTION_MS = 24 * 60 * 60 * 1000;

// Na Vercel não existe processo de fundo. Quem estiver com o gateway aberto
// tenta pegar esta trava a cada 30s; só um consegue e faz a varredura.
export async function maybeSweep(force = false) {
  const now = new Date();
  if (!force) {
    const acquired = await db.systemLock.updateMany({
      where: { key: "sweep", at: { lt: new Date(now.getTime() - SWEEP_INTERVAL_MS) } },
      data: { at: now },
    });
    if (acquired.count === 0) {
      const exists = await db.systemLock.findUnique({ where: { key: "sweep" } });
      if (exists) return false;
      try {
        await db.systemLock.create({ data: { key: "sweep", at: now } });
      } catch {
        return false; // outro processo criou ao mesmo tempo
      }
    }
  }
  await sweep(now);
  return true;
}

async function sweep(now: Date) {
  const staleBefore = new Date(now.getTime() - PRESENCE_TIMEOUT_MS);

  // 1. Quem parou de mandar heartbeat fica offline
  const stale = await db.presence.findMany({
    where: { online: true, lastSeenAt: { lt: staleBefore } },
    select: { userId: true },
    take: 500,
  });
  if (stale.length) {
    const ids = stale.map((s) => s.userId);
    await db.presence.updateMany({
      where: { userId: { in: ids }, lastSeenAt: { lt: staleBefore } },
      data: { online: false },
    });

    // 2. E sai do canal de voz
    const voice = await db.voiceState.findMany({ where: { userId: { in: ids } } });
    if (voice.length) {
      await db.voiceState.deleteMany({ where: { userId: { in: voice.map((v) => v.userId) } } });
      for (const v of voice) {
        await dispatch("VOICE_STATE_UPDATE", { ...serializeVoiceState(v), channel_id: null }, { guildId: v.guildId });
      }
    }
    for (const id of ids) await broadcastPresence(id);
  }

  // 3. Limpa a fila de eventos antiga (RESUME além disso vira INVALID_SESSION)
  await db.gatewayEvent.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - EVENT_RETENTION_MS) } } });

  // 4. Convites vencidos
  await db.invite.deleteMany({ where: { expiresAt: { lt: now } } });
}
