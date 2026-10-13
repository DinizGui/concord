import { requirePermission } from "@/lib/server/access";
import { db } from "@/lib/server/db";
import { dispatch } from "@/lib/server/events";
import { Errors, json, noContent, route } from "@/lib/server/http";
import { Permissions } from "@/lib/server/permissions";
import { loadReactionTarget } from "@/lib/server/reactions";
import { serializeUser, sid } from "@/lib/server/serialize";
import { parseSnowflake } from "@/lib/server/snowflake";
import { queryInt } from "@/lib/server/validate";

type Params = { channelId: string; messageId: string; emoji: string };

// GET /api/v1/channels/{id}/messages/{message.id}/reactions/{emoji}?limit=25&after={user.id}
export const GET = route<Params>(async (req, { params }) => {
  const { message, emoji } = await loadReactionTarget(req, params);
  const q = req.nextUrl.searchParams;
  const after = parseSnowflake(q.get("after"));
  const reactions = await db.reaction.findMany({
    where: { messageId: message.id, emoji: emoji!, ...(after ? { userId: { gt: after } } : {}) },
    include: { user: true },
    orderBy: { userId: "asc" },
    take: queryInt(q.get("limit"), 25, 1, 100),
  });
  return json(reactions.map((r) => serializeUser(r.user)));
});

// DELETE /api/v1/channels/{id}/messages/{message.id}/reactions/{emoji}: remove esse emoji de todos
export const DELETE = route<Params>(async (req, { params }) => {
  const { ctx, message, emoji, channelId, guildId } = await loadReactionTarget(req, params);
  if (guildId == null) throw Errors.invalidChannelType();
  requirePermission(ctx, Permissions.MANAGE_MESSAGES);

  await db.reaction.deleteMany({ where: { messageId: message.id, emoji: emoji! } });
  await dispatch(
    "MESSAGE_REACTION_REMOVE_EMOJI",
    { channel_id: sid(channelId), message_id: sid(message.id), guild_id: sid(guildId), emoji: { id: null, name: emoji } },
    { guildId, channelId },
  );
  return noContent();
});
