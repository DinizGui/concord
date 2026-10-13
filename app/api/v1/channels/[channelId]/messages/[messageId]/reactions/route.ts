import { requirePermission } from "@/lib/server/access";
import { db } from "@/lib/server/db";
import { dispatch } from "@/lib/server/events";
import { Errors, noContent, route } from "@/lib/server/http";
import { Permissions } from "@/lib/server/permissions";
import { loadReactionTarget } from "@/lib/server/reactions";
import { sid } from "@/lib/server/serialize";

// DELETE /api/v1/channels/{id}/messages/{message.id}/reactions: remove todas
export const DELETE = route<{ channelId: string; messageId: string }>(async (req, { params }) => {
  const { ctx, message, channelId, guildId } = await loadReactionTarget(req, params);
  if (guildId == null) throw Errors.invalidChannelType();
  requirePermission(ctx, Permissions.MANAGE_MESSAGES);

  await db.reaction.deleteMany({ where: { messageId: message.id } });
  await dispatch(
    "MESSAGE_REACTION_REMOVE_ALL",
    { channel_id: sid(channelId), message_id: sid(message.id), guild_id: sid(guildId) },
    { guildId, channelId },
  );
  return noContent();
});
