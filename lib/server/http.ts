import { unstable_rethrow } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

// Erros no formato do Discord: { code, message, errors? }
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: number,
    message: string,
    public errors?: Record<string, unknown>,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

export const Errors = {
  unauthorized: () => new ApiError(401, 0, "401: Unauthorized"),
  missingAccess: () => new ApiError(403, 50001, "Missing Access"),
  missingPermissions: () => new ApiError(403, 50013, "Missing Permissions"),
  unknownChannel: () => new ApiError(404, 10003, "Unknown Channel"),
  unknownGuild: () => new ApiError(404, 10004, "Unknown Guild"),
  unknownInvite: () => new ApiError(404, 10006, "Unknown Invite"),
  unknownMember: () => new ApiError(404, 10007, "Unknown Member"),
  unknownMessage: () => new ApiError(404, 10008, "Unknown Message"),
  unknownRole: () => new ApiError(404, 10011, "Unknown Role"),
  unknownUser: () => new ApiError(404, 10013, "Unknown User"),
  unknownBan: () => new ApiError(404, 10026, "Unknown Ban"),
  unknownEmoji: () => new ApiError(404, 10014, "Unknown Emoji"),
  cannotMessageUser: () => new ApiError(403, 50007, "Cannot send messages to this user"),
  emptyMessage: () => new ApiError(400, 50006, "Cannot send an empty message"),
  invalidChannelType: () => new ApiError(400, 50024, "Cannot execute action on this channel type"),
  slowmode: (retryAfter: number) =>
    new ApiError(429, 20016, `This action cannot be performed due to slowmode rate limit. Retry after ${retryAfter}s`, undefined, retryAfter),
  banned: () => new ApiError(403, 40007, "The user is banned from this guild"),
  maxGuilds: () => new ApiError(400, 30001, "Maximum number of guilds reached (100)"),
  maxPins: () => new ApiError(400, 30003, "Maximum number of pins reached (50)"),
  friendRequestFailed: () => new ApiError(400, 80000, "Incoming friend requests disabled"),
  badRequest: (message: string) => new ApiError(400, 0, message),
};

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

type Context<P> = { params: Promise<P> };
type Handler<P> = (req: NextRequest, ctx: Context<P>) => Promise<Response>;

export function route<P = Record<string, never>>(handler: Handler<P>): Handler<P> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      // erros internos do Next (bailout de prerender, redirect...) precisam subir
      unstable_rethrow(err);
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown) {
  if (err instanceof ApiError) {
    const body: Record<string, unknown> = { code: err.code, message: err.message };
    if (err.errors) body.errors = err.errors;
    if (err.retryAfter != null) {
      body.retry_after = err.retryAfter;
      body.global = false;
      const res = json(body, err.status);
      res.headers.set("Retry-After", String(err.retryAfter));
      return res;
    }
    return json(body, err.status);
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return json({ code: 50035, message: "Invalid Form Body (duplicate)" }, 400);
    if (err.code === "P2025") return json({ code: 0, message: "404: Not Found" }, 404);
  }
  console.error("[concord] erro não tratado", err);
  return json({ code: 0, message: "500: Internal Server Error" }, 500);
}

export async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (!text) return {};
  try {
    const body = JSON.parse(text);
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {}
  throw new ApiError(400, 50109, "The request body contains invalid JSON.");
}

export async function readJsonArray(req: NextRequest): Promise<unknown[]> {
  const text = await req.text();
  try {
    const body = JSON.parse(text);
    if (Array.isArray(body)) return body;
  } catch {}
  throw new ApiError(400, 50109, "The request body contains invalid JSON.");
}
