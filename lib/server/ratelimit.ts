import type { NextRequest } from "next/server";
import { db } from "./db";
import { ApiError } from "./http";

// Limite por janela fixa guardado no MySQL (funciona com várias instâncias serverless).
// Estourou: 429 com retry_after, no formato do Discord.

const tooMany = (retryAfter: number) => new ApiError(429, 0, "You are being rate limited.", undefined, retryAfter);

export async function rateLimit(key: string, max: number, windowSeconds: number) {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSeconds * 1000);
  // incrementa se a janela ainda vale; senão recomeça em 1
  const rows = await db.$executeRaw`
    INSERT INTO RateLimit (\`key\`, count, resetAt) VALUES (${key}, 1, ${resetAt})
    ON DUPLICATE KEY UPDATE
      count = IF(resetAt <= ${now}, 1, count + 1),
      resetAt = IF(resetAt <= ${now}, ${resetAt}, resetAt)`;
  void rows;
  const row = await db.rateLimit.findUnique({ where: { key } });
  if (row && row.count > max) {
    throw tooMany(Math.max(1, Math.ceil((row.resetAt.getTime() - now.getTime()) / 1000)));
  }
}

export function clientIp(req: NextRequest) {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "local").trim().slice(0, 64);
}

// Regras em um lugar só. [máximo, janela em segundos]
export const Limits = {
  register: [5, 3600],
  loginIp: [20, 600],
  loginAccount: [10, 600],
  forgotIp: [5, 3600],
  forgotAccount: [3, 3600],
  verifySend: [3, 3600],
  message: [10, 10],
  typing: [10, 10],
  reaction: [20, 10],
  upload: [20, 60],
  friendRequest: [20, 3600],
  inviteCreate: [20, 600],
  guildCreate: [10, 3600],
  webhookExecute: [30, 60],
  emojiCreate: [20, 3600],
  threadCreate: [10, 600],
} as const satisfies Record<string, readonly [number, number]>;

export function limit(name: keyof typeof Limits, id: string | bigint) {
  const [max, window] = Limits[name];
  return rateLimit(`${name}:${id}`, max, window);
}
