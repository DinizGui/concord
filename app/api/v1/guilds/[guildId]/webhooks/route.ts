import { requireAuth } from "@/lib/server/auth";
import { requireMember, requirePermission } from "@/lib/server/access";
import { db } from "@/lib/server/db";
import { Errors, json, route } from "@/lib/server/http";
import { Permissions } from "@/lib/server/permissions";
import { idParam } from "@/lib/server/validate";
import { serializeWebhook } from "@/lib/server/webhooks";

// GET /api/v1/guilds/{id}/webhooks  (MANAGE_WEBHOOKS)
export const GET = route<{ guildId: string }>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const guildId = idParam((await params).guildId, Errors.unknownGuild);
  const ctx = await requireMember(guildId, user.id);
  requirePermission(ctx, Permissions.MANAGE_WEBHOOKS);
  const hooks = await db.webhook.findMany({ where: { guildId }, orderBy: { id: "asc" } });
  return json(hooks.map((w) => serializeWebhook(w)));
});
