import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Webhook } from "@prisma/client";
import { sid } from "./serialize";

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export function newWebhookToken() {
  return randomBytes(48).toString("base64url");
}

export function tokenMatches(given: string, hash: string) {
  const a = Buffer.from(hashToken(given));
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}

// O token só aparece na criação; depois nem o dono consegue ver (fica só o hash).
export function serializeWebhook(w: Webhook, token?: string, origin?: string) {
  return {
    id: sid(w.id),
    type: 1,
    guild_id: sid(w.guildId),
    channel_id: sid(w.channelId),
    name: w.name,
    avatar: w.avatar,
    created_at: w.createdAt.toISOString(),
    ...(token ? { token, url: `${origin ?? ""}/api/v1/webhooks/${w.id}/${token}` } : {}),
  };
}
