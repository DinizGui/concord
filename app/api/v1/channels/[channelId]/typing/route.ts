import { requireAuth } from "@/lib/server/auth";
import { isTextLike, loadChannelContext, requirePermission } from "@/lib/server/access";
import { dispatch } from "@/lib/server/events";
import { Errors, noContent, route } from "@/lib/server/http";
import { memberPayload } from "@/lib/server/messages";
import { Permissions } from "@/lib/server/permissions";
import { sid } from "@/lib/server/serialize";
import { idParam } from "@/lib/server/validate";
import { limit } from "@/lib/server/ratelimit";

// POST /api/v1/channels/{id}/typing: "fulano está digitando" (o cliente repete a cada ~8s)
export const POST = route<{ channelId: string }>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  await limit("typing", user.id);
  const channelId = idParam((await params).channelId, Errors.unknownChannel);
  const ctx = await loadChannelContext(channelId, user.id);
  if (!isTextLike(ctx.channel.type)) throw Errors.invalidChannelType();
  requirePermission(ctx, Permissions.SEND_MESSAGES);

  const guildId = ctx.channel.guildId;
  await dispatch(
    "TYPING_START",
    {
      channel_id: sid(channelId),
      user_id: sid(user.id),
      timestamp: Math.floor(Date.now() / 1000),
      ...(guildId ? { guild_id: sid(guildId), member: await memberPayload(guildId, user.id) } : {}),
    },
    { guildId, channelId },
  );
  return noContent();
});
