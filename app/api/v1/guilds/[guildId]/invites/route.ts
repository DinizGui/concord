import { requireAuth } from "@/lib/server/auth";
import { requireMember, requirePermission } from "@/lib/server/access";
import { db } from "@/lib/server/db";
import { Errors, json, route } from "@/lib/server/http";
import { inviteInclude } from "@/lib/server/invites";
import { Permissions } from "@/lib/server/permissions";
import { serializeInvite } from "@/lib/server/serialize";
import { idParam } from "@/lib/server/validate";

// GET /api/v1/guilds/{id}/invites
export const GET = route<{ guildId: string }>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const guildId = idParam((await params).guildId, Errors.unknownGuild);
  const ctx = await requireMember(guildId, user.id);
  requirePermission(ctx, Permissions.MANAGE_GUILD);

  const invites = await db.invite.findMany({ where: { guildId }, include: inviteInclude, orderBy: { createdAt: "desc" } });
  return json(invites.map((i) => serializeInvite(i, { guild: i.guild, channel: i.channel, inviter: i.inviter })));
});
