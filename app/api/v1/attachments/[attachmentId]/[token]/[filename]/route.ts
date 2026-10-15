import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { db } from "@/lib/server/db";
import { parseSnowflake } from "@/lib/server/snowflake";

type Params = { attachmentId: string; token: string; filename: string };

const SAFE_INLINE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "video/mp4", "video/webm", "audio/mpeg", "audio/ogg"]);

function notFound() {
  return new Response("Not found", { status: 404 });
}

// GET /api/v1/attachments/{id}/{token}/{nome}
// Serve anexos guardados no banco. Quem tem o link vê (igual ao CDN do Discord);
// o token aleatório impede adivinhar links de canais privados.
export async function GET(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const p = await params;
  const id = parseSnowflake(p.attachmentId);
  if (id == null) return notFound();
  const a = await db.attachment.findUnique({ where: { id } });
  if (!a || !a.token) return notFound();
  const given = Buffer.from(p.token);
  const real = Buffer.from(a.token);
  if (given.length !== real.length || !timingSafeEqual(given, real)) return notFound();

  if (a.url) return Response.redirect(a.url, 302);
  if (!a.data) return notFound();

  const type = a.contentType ?? "application/octet-stream";
  const inline = SAFE_INLINE.has(type);
  return new Response(new Uint8Array(a.data), {
    headers: {
      "content-type": inline ? type : "application/octet-stream",
      "content-length": String(a.data.length),
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${a.filename}"`,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'",
    },
  });
}
