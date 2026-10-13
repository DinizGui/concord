import { requireAuth } from "@/lib/server/auth";
import { loadChannelContext, requirePermission } from "@/lib/server/access";
import { db } from "@/lib/server/db";
import { dispatch } from "@/lib/server/events";
import { Errors, noContent, route } from "@/lib/server/http";
import { loadMessage, messageInclude, serializeOne } from "@/lib/server/messages";
import { Permissions } from "@/lib/server/permissions";
import { sid } from "@/lib/server/serialize";
import { idParam } from "@/lib/server/validate";
import type { NextRequest } from "next/server";

type Params = { channelId: string; messageId: string };

const MAX_PINS = 50;

async function setPinned(req: NextRequest, params: Promise<Params>, pinned: boolean) {
  const { user } = await requireAuth(req);
  const p = await params;
  const channelId = idParam(p.channelId, Errors.unknownChannel);
  const messageId = idParam(p.messageId, Errors.unknownMessage);
  const ctx = await loadChannelContext(channelId, user.id);
  // em DM qualquer participante fixa; na guild precisa de MANAGE_MESSAGES
  if (ctx.channel.guildId != null) requirePermission(ctx, Permissions.MANAGE_MESSAGES);

  const message = await loadMessage(channelId, messageId);
  if (!message) throw Errors.unknownMessage();
  if (message.pinned === pinned) return noContent();
  if (pinned && (await db.message.count({ where: { channelId, pinned: true } })) >= MAX_PINS) throw Errors.maxPins();

  const now = new Date();
  const [updated] = await db.$transaction([
    db.message.update({ where: { id: messageId }, data: { pinned }, include: messageInclude }),
    db.channel.update({ where: { id: channelId }, data: { lastPinAt: pinned ? now : ctx.channel.lastPinAt } }),
  ]);

  const guildId = ctx.channel.guildId;
  await dispatch("MESSAGE_UPDATE", await serializeOne(updated, { guildId }), { guildId, channelId });
  await dispatch(
    "CHANNEL_PINS_UPDATE",
    {
      channel_id: sid(channelId),
      ...(guildId ? { guild_id: sid(guildId) } : {}),
      last_pin_timestamp: (pinned ? now : ctx.channel.lastPinAt)?.toISOString() ?? null,
    },
    { guildId, channelId },
  );
  return noContent();
}

// PUT/DELETE /api/v1/channels/{id}/pins/{message.id}
export const PUT = route<Params>((req, { params }) => setPinned(req, params, true));
export const DELETE = route<Params>((req, { params }) => setPinned(req, params, false));
