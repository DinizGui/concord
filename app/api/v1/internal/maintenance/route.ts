import { timingSafeEqual } from "node:crypto";
import { Errors, json, route } from "@/lib/server/http";
import { maybeSweep } from "@/lib/server/maintenance";

// GET /api/v1/internal/maintenance
// Varredura forçada (presença, voz, limpeza da fila). Para cron da Vercel:
// ela manda "Authorization: Bearer $CRON_SECRET".
export const GET = route(async (req) => {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const ok =
    !!secret && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) throw Errors.unauthorized();

  await maybeSweep(true);
  return json({ ok: true, at: new Date().toISOString() });
});
