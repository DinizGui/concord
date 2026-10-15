import { requireAuth } from "@/lib/server/auth";
import { loadChannelContext, requirePermission } from "@/lib/server/access";
import { db } from "@/lib/server/db";
import { dispatch } from "@/lib/server/events";
import { ApiError, Errors, json, noContent, readJson, route } from "@/lib/server/http";
import { parseMentions } from "@/lib/server/mentions";
import { loadMessage, messageInclude, serializeOne } from "@/lib/server/messages";
import { Permissions, has } from "@/lib/server/permissions";
import { sid } from "@/lib/server/serialize";
import { Form, idParam } from "@/lib/server/validate";
import type { NextRequest } from "next/server";
import { removeFiles } from "@/lib/server/storage";

type Params = { channelId: string; messageId: string };

async function load(req: NextRequest, params: Promise<Params>) {
  const { user } = await requireAuth(req);
  const p = await params;
  const channelId = idParam(p.channelId, Errors.unknownChannel);
  const messageId = idParam(p.messageId, Errors.unknownMessage);
  const ctx = await loadChannelContext(channelId, user.id);
  requirePermission(ctx, Permissions.READ_MESSAGE_HISTORY);
  const message = await loadMessage(channelId, messageId);
  if (!message) throw Errors.unknownMessage();
  return { user, ctx, message, channelId };
}

// GET /api/v1/channels/{id}/messages/{message.id}
export const GET = route<Params>(async (req, { params }) => {
  const { user, ctx, message } = await load(req, params);
  return json(await serializeOne(message, { viewerId: user.id, guildId: ctx.channel.guildId }));
});

// PATCH /api/v1/channels/{id}/messages/{message.id} { content }: só o autor
export const PATCH = route<Params>(async (req, { params }) => {
  const { user, ctx, message, channelId } = await load(req, params);
  if (message.authorId !== user.id) throw new ApiError(403, 50005, "Cannot edit a message authored by another user");
  if (message.type !== 0 && message.type !== 19) throw new ApiError(400, 50021, "Cannot execute action on a system message");

  const form = new Form(await readJson(req));
  const content = form.string("content", { min: 1, max: 2000 });
  form.done();

  const mentions = await parseMentions(content!, ctx);
  const updated = await db.message.update({
    where: { id: message.id },
    data: {
      content: content!,
      editedAt: new Date(),
      mentionEveryone: mentions.mentionEveryone,
      mentions: mentions.users.map(String),
      mentionRoles: mentions.roles.map(String),
    },
    include: messageInclude,
  });

  const payload = await serializeOne(updated, { guildId: ctx.channel.guildId });
  await dispatch("MESSAGE_UPDATE", payload, { guildId: ctx.channel.guildId, channelId });
  return json(await serializeOne(updated, { viewerId: user.id, guildId: ctx.channel.guildId }));
});

// DELETE /api/v1/channels/{id}/messages/{message.id}: autor, ou MANAGE_MESSAGES na guild
export const DELETE = route<Params>(async (req, { params }) => {
  const { user, ctx, message, channelId } = await load(req, params);
  const isAuthor = message.authorId === user.id;
  const canManage = ctx.channel.guildId != null && has(ctx.permissions, Permissions.MANAGE_MESSAGES);
  if (!isAuthor && !canManage) throw Errors.missingPermissions();

  // arquivos no Blob não somem sozinhos com a linha do banco
  await removeFiles((message.attachments ?? []).map((a) => a.url));
  await db.message.delete({ where: { id: message.id } });
  await dispatch(
    "MESSAGE_DELETE",
    { id: sid(message.id), channel_id: sid(channelId), ...(ctx.channel.guildId ? { guild_id: sid(ctx.channel.guildId) } : {}) },
    { guildId: ctx.channel.guildId, channelId },
  );
  return noContent();
});
