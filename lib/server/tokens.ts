import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import { ApiError } from "./http";

export type TokenKind = "reset" | "verify";

const TTL_MS: Record<TokenKind, number> = {
  reset: 60 * 60 * 1000, // 1h
  verify: 3 * 24 * 60 * 60 * 1000, // 3 dias
};

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

const invalid = () =>
  new ApiError(400, 50035, "Invalid Form Body", {
    token: { _errors: [{ code: "INVALID_TOKEN", message: "Token is invalid or expired." }] },
  });

// Token novo invalida os anteriores do mesmo tipo
export async function createAuthToken(userId: bigint, kind: TokenKind) {
  const token = randomBytes(32).toString("base64url");
  await db.$transaction([
    db.authToken.deleteMany({ where: { userId, kind } }),
    db.authToken.create({ data: { tokenHash: sha256(token), userId, kind, expiresAt: new Date(Date.now() + TTL_MS[kind]) } }),
  ]);
  return token;
}

// Uso único: marca como usado na mesma operação que confere
export async function consumeAuthToken(token: string, kind: TokenKind) {
  if (!token || token.length > 128) throw invalid();
  const hash = sha256(token);
  const used = await db.authToken.updateMany({
    where: { tokenHash: hash, kind, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (used.count !== 1) throw invalid();
  const row = await db.authToken.findUniqueOrThrow({ where: { tokenHash: hash } });
  return row.userId;
}
