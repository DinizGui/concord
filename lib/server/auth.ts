import { createHash, randomBytes, scrypt, timingSafeEqual, type BinaryLike, type ScryptOptions } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { db } from "./db";
import { Errors } from "./http";

export const SESSION_COOKIE = "concord_token";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 dias
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function scryptAsync(password: BinaryLike, salt: BinaryLike, keylen: number, opts: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algo, n, r, p, saltB64, keyB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scryptAsync(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// usado quando o login não existe, para o tempo de resposta não denunciar isso
let dummyHash: Promise<string> | null = null;
export function getDummyHash() {
  return (dummyHash ??= hashPassword(randomBytes(16).toString("hex")));
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

// Token no estilo Discord: base64url(id do usuário).segredo aleatório.
// No banco fica só o SHA-256.
export async function createSession(userId: bigint, userAgent: string | null) {
  const token = `${Buffer.from(userId.toString()).toString("base64url")}.${randomBytes(32).toString("base64url")}`;
  await db.session.create({
    data: { tokenHash: sha256(token), userId, userAgent: userAgent?.slice(0, 255) ?? null },
  });
  return token;
}

export async function revokeSession(token: string) {
  await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
}

// troca de senha: derruba todas as sessões menos a atual
export async function revokeOtherSessions(userId: bigint, keepToken: string) {
  await db.session.deleteMany({ where: { userId, tokenHash: { not: sha256(keepToken) } } });
}

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

function readToken(req: NextRequest): { token: string; fromCookie: boolean } | null {
  const header = req.headers.get("authorization");
  if (header) {
    const token = header.replace(/^Bearer\s+/i, "").trim();
    if (token) return { token, fromCookie: false };
  }
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  return cookie ? { token: cookie, fromCookie: true } : null;
}

// Com cookie, requisições que alteram estado precisam vir da mesma origem (proteção CSRF).
function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

export type Auth = { user: User; token: string };

export async function getAuth(req: NextRequest): Promise<Auth | null> {
  const found = readToken(req);
  if (!found) return null;
  if (found.fromCookie && !["GET", "HEAD"].includes(req.method) && !sameOrigin(req)) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: sha256(found.token) },
    include: { user: true },
  });
  if (!session) return null;

  if (Date.now() - session.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.session.update({ where: { tokenHash: session.tokenHash }, data: { lastUsedAt: new Date() } });
  }
  return { user: session.user, token: found.token };
}

export async function requireAuth(req: NextRequest): Promise<Auth> {
  const auth = await getAuth(req);
  if (!auth) throw Errors.unauthorized();
  return auth;
}

// Rotas /users/@me/...: só aceita o próprio usuário
export function requireMe(userIdParam: string) {
  if (userIdParam !== "@me") throw Errors.missingAccess();
}
