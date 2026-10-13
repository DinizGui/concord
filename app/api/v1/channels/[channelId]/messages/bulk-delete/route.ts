import { requireAuth } from "@/lib/server/auth";
import { loadChannelContext, requirePermission } from "@/lib/server/access";
import { db } from "@/lib/server/db";
import { dispatch } from "@/lib/server/events";
import { Errors, noContent, readJson, route } from "@/lib/server/http";
import { Permissions } from "@/lib/server/permissions";
import { sid } from "@/lib/server/serialize";
import { Form, idParam } from "@/lib/server/validate";

// POST /api/v1/channels/{id}/messages/bulk-delete { messages: [ids] } (2 a 100)
export const POST = route<{ channelId: string }>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const channelId = idParam((await params).channelId, Errors.unknownChannel);
  const ctx = await loadChannelContext(channelId, user.id);
  if (ctx.channel.guildId == null) throw Errors.invalidChannelType();
  requirePermission(ctx, Permissions.MANAGE_MESSAGES);

  const form = new Form(await readJson(req));
  const ids = form.snowflakes("messages", { max: 100 });
  form.done();
  if (!ids || ids.length < 2) throw Errors.badRequest("messages must contain between 2 and 100 ids");

  const found = await db.message.findMany({ where: { channelId, id: { in: ids } }, select: { id: true } });
  await db.message.deleteMany({ where: { channelId, id: { in: found.map((m) => m.id) } } });
  await dispatch(
    "MESSAGE_DELETE_BULK",
    { ids: found.map((m) => sid(m.id)), channel_id: sid(channelId), guild_id: sid(ctx.channel.guildId) },
    { guildId: ctx.channel.guildId, channelId },
  );
  return noContent();
});
