import type Redis from "ioredis";

// Aviso de "tem evento novo" entre instâncias, via Redis pub/sub (REDIS_URL).
// A fila continua no MySQL (GatewayEvent); o Redis só acorda as conexões SSE na hora,
// em vez de cada uma consultar o banco a cada 1s. Sem REDIS_URL, nada muda.

const CHANNEL = "concord:events";

type Bus = { pub: Redis; sub: Redis; waiters: Set<() => void>; version: number };

const g = globalThis as unknown as { __concordBus?: Promise<Bus | null> };

function connect(): Promise<Bus | null> {
  const url = process.env.REDIS_URL;
  if (!url) return Promise.resolve(null);
  return (async () => {
    const { default: IORedis } = await import("ioredis");
    const opts = { maxRetriesPerRequest: 2, enableOfflineQueue: false, lazyConnect: false };
    const pub = new IORedis(url, opts);
    const sub = new IORedis(url, opts);
    const waiters = new Set<() => void>();
    const b: Bus = { pub, sub, waiters, version: 0 };
    for (const c of [pub, sub]) c.on("error", (err) => console.error("[concord] redis", err.message));
    sub.on("message", () => {
      b.version++;
      const list = [...waiters];
      waiters.clear();
      list.forEach((wake) => wake());
    });
    await sub.subscribe(CHANNEL);
    return b;
  })().catch((err) => {
    console.error("[concord] redis indisponível, seguindo só com o banco", err);
    return null;
  });
}

function bus() {
  return (g.__concordBus ??= connect());
}

export async function busEnabled() {
  return (await bus()) != null;
}

// Chamado depois de gravar eventos na fila
export async function notifyEvents() {
  const b = await bus();
  if (!b || b.pub.status !== "ready") return;
  b.pub.publish(CHANNEL, "1").catch(() => {});
}

// Contador de avisos recebidos nesta instância (pega aviso que chegou durante a consulta)
export async function busVersion() {
  return (await bus())?.version ?? 0;
}

// Espera um aviso novo (depois de "seen") ou o tempo máximo, o que vier primeiro
export async function waitForEvents(maxMs: number, seen: number) {
  const b = await bus();
  if (!b) return new Promise<void>((r) => setTimeout(r, maxMs));
  if (b.version !== seen) return;
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      b.waiters.delete(done);
      resolve();
    };
    const timer = setTimeout(done, maxMs);
    b.waiters.add(done);
  });
}
