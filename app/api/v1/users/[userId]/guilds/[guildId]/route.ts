import { requireAuth, requireMe } from "@/lib/server/auth";
import { requireMember } from "@/lib/server/access";
import { removeMember } from "@/lib/server/guilds";
import { ApiError, Errors, noContent, route } from "@/lib/server/http";
import { idParam } from "@/lib/server/validate";

// DELETE /api/v1/users/@me/guilds/{guild.id}: sair da guild
export const DELETE = route<{ userId: string; guildId: string }>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const p = await params;
  requireMe(p.userId);
  const guildId = idParam(p.guildId, Errors.unknownGuild);

  const ctx = await requireMember(guildId, user.id);
  if (ctx.isOwner) throw new ApiError(400, 50055, "Owner cannot leave the guild. Transfer ownership or delete it.");

  await removeMember(guildId, user.id);
  return noContent();
});
