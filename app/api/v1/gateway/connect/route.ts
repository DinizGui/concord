import { randomBytes } from "node:crypto";
import { unstable_rethrow } from "next/navigation";
import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/http";
import { maybeSweep } from "@/lib/server/maintenance";
import { touchPresence } from "@/lib/server/presence";
import { parseSnowflake } from "@/lib/server/snowflake";
import {
  HEARTBEAT_INTERVAL_MS,
  Op,
  Subscription,
  buildReady,
  currentSeq,
  oldestSeq,
} from "@/lib/server/gateway";

// runtime Node é o padrão (e `runtime` não pode ser declarado com cacheComponents)
export const maxDuration = 300;

const POLL_MS = Number(process.env.GATEWAY_POLL_MS ?? 1000);
const MAX_LIFETIME_MS = Number(process.env.GATEWAY_MAX_LIFETIME_MS ?? 240_000);
const KEEPALIVE_MS = 15_000;
const PRESENCE_TOUCH_MS = 30_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// GET /api/v1/gateway/connect  (Server-Sent Events)
//
// Conexão nova:  HELLO → READY → DISPATCH...
// Retomada:      ?seq=N (ou header Last-Event-ID, que o EventSource manda sozinho)
//                HELLO → eventos perdidos → RESUMED → DISPATCH...
// Fim de vida:   RECONNECT e fecha; o cliente reconecta e retoma do último seq.
export async function GET(req: NextRequest) {
  let auth;
  try {
    auth = await requireAuth(req);
  } catch (err) {
    unstable_rethrow(err);
    return errorResponse(err);
  }
  const userId = auth.user.id;
  const url = req.nextUrl;
  const resumeSeq = parseSnowflake(url.searchParams.get("seq") ?? req.headers.get("last-event-id") ?? "");
  const sessionId = url.searchParams.get("session_id")?.slice(0, 64) || randomBytes(16).toString("hex");

  const encoder = new TextEncoder();
  let closed = false;
  req.signal.addEventListener("abort", () => {
    closed = true;
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      const send = (payload: { op: number; d: unknown; s?: string | null; t?: string | null }) => {
        const id = payload.s != null ? `id: ${payload.s}\n` : "";
        write(`${id}data: ${JSON.stringify({ s: null, t: null, ...payload })}\n\n`);
      };
      const finish = () => {
        closed = true;
        try {
          controller.close();
        } catch {}
      };

      try {
        write("retry: 1000\n\n");
        send({ op: Op.HELLO, d: { heartbeat_interval: HEARTBEAT_INTERVAL_MS, session_id: sessionId } });

        const sub = new Subscription(userId);
        await sub.refresh();
        await touchPresence(userId);

        let cursor: bigint;
        if (resumeSeq != null) {
          const [oldest, latest] = await Promise.all([oldestSeq(), currentSeq()]);
          const lost = (oldest != null && resumeSeq < oldest - BigInt(1)) || resumeSeq > latest;
          if (lost) {
            // fila já foi limpa (ou banco foi resetado): cliente precisa de um READY novo
            send({ op: Op.INVALID_SESSION, d: false });
            return finish();
          }
          cursor = resumeSeq;
        } else {
          // pega o cursor ANTES de montar o READY: o que acontecer durante a montagem chega depois
          cursor = await currentSeq();
          const ready = await buildReady(userId, sessionId);
          send({ op: Op.DISPATCH, t: "READY", s: cursor.toString(), d: ready });
        }

        const startedAt = Date.now();
        let lastWrite = Date.now();
        let lastTouch = Date.now();
        let resumed = resumeSeq == null;

        while (!closed) {
          const events = await sub.fetch(cursor);
          let refreshed = false;
          for (const ev of events) {
            cursor = ev.seq;
            sub.observe(ev);
            if (await sub.canSee(ev)) {
              send({ op: Op.DISPATCH, t: ev.type, s: ev.seq.toString(), d: ev.data });
              lastWrite = Date.now();
            }
            if (sub.needsRefresh(ev)) {
              // entrei/saí de guild ou DM: recarrega e busca de novo a partir daqui
              await sub.refresh();
              refreshed = true;
              break;
            }
          }
          if (refreshed) continue;
          if (!resumed && events.length < 100) {
            send({ op: Op.DISPATCH, t: "RESUMED", s: cursor.toString(), d: {} });
            resumed = true;
          }
          if (events.length >= 100) continue; // ainda tem fila: não espera

          const now = Date.now();
          if (now - startedAt > MAX_LIFETIME_MS) {
            send({ op: Op.RECONNECT, d: null });
            return finish();
          }
          if (now - lastTouch > PRESENCE_TOUCH_MS) {
            lastTouch = now;
            await touchPresence(userId);
            await maybeSweep();
          }
          if (now - lastWrite > KEEPALIVE_MS) {
            write(": keepalive\n\n");
            lastWrite = now;
          }
          await sleep(POLL_MS);
        }
      } catch (err) {
        console.error("[concord] gateway caiu", err);
        send({ op: Op.RECONNECT, d: null });
      }
      finish();
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
