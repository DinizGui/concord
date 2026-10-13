import { requirePermission } from "@/lib/server/access";
import { db } from "@/lib/server/db";
import { dispatch } from "@/lib/server/events";
import { ApiError, Errors, noContent, route } from "@/lib/server/http";
import { memberPayload } from "@/lib/server/messages";
import { Permissions } from "@/lib/server/permissions";
import { loadReactionTarget, reactionPayload } from "@/lib/server/reactions";
import { idParam } from "@/lib/server/validate";

type Params = { channelId: string; messageId: string; emoji: string; userId: string };

const MAX_DISTINCT_EMOJIS = 20;

// PUT /api/v1/channels/{id}/messages/{message.id}/reactions/{emoji}/@me
export const PUT = route<Params>(async (req, { params }) => {
  const { user, ctx, message, emoji, channelId, guildId } = await loadReactionTarget(req, params);
  if ((await params).userId !== "@me") throw Errors.missingAccess();

  const existing = await db.reaction.findMany({ where: { messageId: message.id }, select: { emoji: true }, distinct: ["emoji"] });
  const isNewEmoji = !existing.some((r) => r.emoji === emoji);
  // reagir com emoji que já está na mensagem não exige ADD_REACTIONS (igual ao Discord)
  if (isNewEmoji) {
    requirePermission(ctx, Permissions.ADD_REACTIONS);
    if (existing.length >= MAX_DISTINCT_EMOJIS) throw new ApiError(400, 30010, "Maximum number of reactions reached (20)");
  }

  const created = await db.reaction.createMany({
    data: [{ messageId: message.id, userId: user.id, emoji: emoji! }],
    skipDuplicates: true,
  });
  if (created.count) {
    await dispatch(
      "MESSAGE_REACTION_ADD",
      {
        ...reactionPayload({ userId: user.id, channelId, messageId: message.id, guildId, emoji: emoji! }),
        ...(guildId ? { member: await memberPayload(guildId, user.id) } : {}),
      },
      { guildId, channelId },
    );
  }
  return noContent();
});

// DELETE .../reactions/{emoji}/@me  ou  .../reactions/{emoji}/{user.id} (com MANAGE_MESSAGES)
export const DELETE = route<Params>(async (req, { params }) => {
  const { user, ctx, message, emoji, channelId, guildId } = await loadReactionTarget(req, params);
  const p = await params;
  const targetId = p.userId === "@me" ? user.id : idParam(p.userId, Errors.unknownUser);
  if (targetId !== user.id) {
    if (guildId == null) throw Errors.missingPermissions();
    requirePermission(ctx, Permissions.MANAGE_MESSAGES);
  }

  const removed = await db.reaction.deleteMany({ where: { messageId: message.id, userId: targetId, emoji: emoji! } });
  if (removed.count) {
    await dispatch(
      "MESSAGE_REACTION_REMOVE",
      reactionPayload({ userId: targetId, channelId, messageId: message.id, guildId, emoji: emoji! }),
      { guildId, channelId },
    );
  }
  return noContent();
});
