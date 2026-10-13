import { requireAuth } from "@/lib/server/auth";
import { loadChannelContext, requirePermission } from "@/lib/server/access";
import { db } from "@/lib/server/db";
import { Errors, json, route } from "@/lib/server/http";
import { messageInclude, serializeMessages } from "@/lib/server/messages";
import { Permissions } from "@/lib/server/permissions";
import { idParam } from "@/lib/server/validate";

// GET /api/v1/channels/{id}/pins
export const GET = route<{ channelId: string }>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const channelId = idParam((await params).channelId, Errors.unknownChannel);
  const ctx = await loadChannelContext(channelId, user.id);
  requirePermission(ctx, Permissions.READ_MESSAGE_HISTORY);

  const rows = await db.message.findMany({
    where: { channelId, pinned: true },
    orderBy: { id: "desc" },
    take: 50,
    include: messageInclude,
  });
  return json(await serializeMessages(rows, { viewerId: user.id, guildId: ctx.channel.guildId }));
});
