import { requireAuth } from "@/lib/server/auth";
import { noContent, route } from "@/lib/server/http";
import { sendVerification } from "@/lib/server/verification";
import { limit } from "@/lib/server/ratelimit";

// POST /api/v1/auth/verify/send  → manda (de novo) o link de confirmação
export const POST = route(async (req) => {
  const { user } = await requireAuth(req);
  if (user.emailVerifiedAt) return noContent();
  await limit("verifySend", user.id);
  await sendVerification(req, user);
  return noContent();
});
