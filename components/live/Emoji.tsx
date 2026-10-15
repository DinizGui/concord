"use client";

import { useStore } from "@/lib/client/store";

export const CUSTOM_IN_TEXT = /<(a?):([A-Za-z0-9_]{2,32}):(\d+)>/;
export const CUSTOM_REACTION = /^([A-Za-z0-9_]{2,32}):(\d+)$/;

export function emojiImageUrl(id: string, animated = false) {
  return `/api/v1/emojis/${id}.${animated ? "gif" : "png"}`;
}

// Mostra um emoji: unicode como texto, do servidor ("nome:id") como imagem
export function EmojiGlyph({ value, size = 18 }: { value: string; size?: number }) {
  const { state } = useStore();
  const m = value.match(CUSTOM_REACTION);
  if (!m) return <span style={{ fontSize: size * 0.95, lineHeight: 1 }}>{value}</span>;
  const known = Object.values(state.guilds)
    .flatMap((g) => g.emojis ?? [])
    .find((e) => e.id === m[2]);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={known?.url ?? emojiImageUrl(m[2])} alt={`:${m[1]}:`} title={`:${m[1]}:`} width={size} height={size} className="inline-block object-contain align-[-0.2em]" />
  );
}
