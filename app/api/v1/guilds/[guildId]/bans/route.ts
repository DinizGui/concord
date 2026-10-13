import { requireAuth } from "@/lib/server/auth";
import { requireMember, requirePermission } from "@/lib/server/access";
import { db } from "@/lib/server/db";
import { Errors, json, route } from "@/lib/server/http";
import { Permissions } from "@/lib/server/permissions";
import { serializeBan } from "@/lib/server/serialize";
import { idParam } from "@/lib/server/validate";

// GET /api/v1/guilds/{id}/bans
export const GET = route<{ guildId: string }>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const guildId = idParam((await params).guildId, Errors.unknownGuild);
  const ctx = await requireMember(guildId, user.id);
  requirePermission(ctx, Permissions.BAN_MEMBERS);

  const bans = await db.ban.findMany({ where: { guildId }, include: { user: true }, orderBy: { createdAt: "desc" }, take: 1000 });
  return json(bans.map(serializeBan));
});
