import type { NextRequest } from "next/server";
import { db } from "@/lib/server/db";
import { parseSnowflake } from "@/lib/server/snowflake";

// GET /api/v1/emojis/{id}.png|.gif  → imagem do emoji (pública, como no Discord)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ emojiId: string }> }) {
  const id = parseSnowflake((await params).emojiId.replace(/\.(png|gif|webp|jpe?g)$/i, ""));
  const emoji = id != null ? await db.emoji.findUnique({ where: { id } }) : null;
  if (!emoji) return new Response("Not found", { status: 404 });
  if (emoji.url) return Response.redirect(emoji.url, 302);
  if (!emoji.data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(emoji.data), {
    headers: {
      "content-type": emoji.contentType,
      "cache-control": "public, max-age=86400",
      "x-content-type-options": "nosniff",
    },
  });
}
