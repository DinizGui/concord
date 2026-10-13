import type { NextRequest } from "next/server";
import { requireAuth } from "./auth";
import { loadChannelContext, requirePermission } from "./access";
import { Errors } from "./http";
import { loadMessage } from "./messages";
import { Permissions } from "./permissions";
import { sid } from "./serialize";
import { idParam } from "./validate";

// Só emoji unicode por enquanto (até 64 chars, sem espaço). Emoji custom ficaria "nome:id".
export function parseEmoji(raw: string) {
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {}
  if (!value || value.length > 64 || /\s/.test(value)) throw Errors.unknownEmoji();
  return value;
}

export async function loadReactionTarget(
  req: NextRequest,
  params: Promise<{ channelId: string; messageId: string; emoji?: string }>,
) {
  const { user } = await requireAuth(req);
  const p = await params;
  const channelId = idParam(p.channelId, Errors.unknownChannel);
  const messageId = idParam(p.messageId, Errors.unknownMessage);
  const ctx = await loadChannelContext(channelId, user.id);
  requirePermission(ctx, Permissions.READ_MESSAGE_HISTORY);
  const message = await loadMessage(channelId, messageId);
  if (!message) throw Errors.unknownMessage();
  const emoji = p.emoji != null ? parseEmoji(p.emoji) : null;
  return { user, ctx, message, emoji, channelId, guildId: ctx.channel.guildId };
}

export function reactionPayload(input: { userId: bigint; channelId: bigint; messageId: bigint; guildId: bigint | null; emoji: string }) {
  return {
    user_id: sid(input.userId),
    channel_id: sid(input.channelId),
    message_id: sid(input.messageId),
    ...(input.guildId ? { guild_id: sid(input.guildId) } : {}),
    emoji: { id: null, name: input.emoji },
  };
}
