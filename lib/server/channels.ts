import type { PermissionOverwrite } from "@prisma/client";
import { db } from "./db";
import { Form } from "./validate";

// RegExp construída em runtime: o tsconfig mira ES2017 e \p{} é ES2018
const INVALID_CHANNEL_CHARS = new RegExp("[^\\p{L}\\p{N}_-]", "gu");

// Canal de texto no Discord: minúsculo, sem espaço
export function normalizeTextChannelName(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(INVALID_CHANNEL_CHARS, "").slice(0, 100);
}

export type OverwriteInput = { targetId: bigint; type: number; allow: bigint; deny: bigint };

export function parseOverwrites(raw: unknown): OverwriteInput[] | null {
  if (!Array.isArray(raw)) return null;
  const out: OverwriteInput[] = [];
  for (const item of raw.slice(0, 100)) {
    if (!item || typeof item !== "object") return null;
    const form = new Form(item as Record<string, unknown>);
    const targetId = form.snowflake("id");
    const type = form.int("type", { min: 0, max: 1 });
    const allow = form.permissions("allow") ?? BigInt(0);
    const deny = form.permissions("deny") ?? BigInt(0);
    if (targetId == null || type == null) return null;
    form.done();
    out.push({ targetId, type, allow, deny });
  }
  return out;
}

export async function nextChannelPosition(guildId: bigint, parentId: bigint | null, type: number) {
  const last = await db.channel.findFirst({
    where: { guildId, parentId, ...(type === 4 ? { type: 4 } : { type: { not: 4 } }) },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return last ? last.position + 1 : 0;
}

export function copyOverwrites(overwrites: PermissionOverwrite[]): OverwriteInput[] {
  return overwrites.map(({ targetId, type, allow, deny }) => ({ targetId, type, allow, deny }));
}
