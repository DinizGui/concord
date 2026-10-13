import { NextResponse } from "next/server";
import { clearSessionCookie, requireAuth, revokeSession } from "@/lib/server/auth";
import { route } from "@/lib/server/http";

// POST /api/v1/auth/logout
export const POST = route(async (req) => {
  const { token } = await requireAuth(req);
  await revokeSession(token);
  const res = new NextResponse(null, { status: 204 });
  clearSessionCookie(res);
  return res;
});
