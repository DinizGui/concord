import type { NextRequest } from "next/server";
import { requireAuth } from "./auth";
import { loadChannelContext, requirePermission } from "./access";
import { db } from "./db";
import { dispatch } from "./events";
import { ApiError, Errors, readJson } from "./http";
import { Permissions } from "./permissions";
import { limit } from "./ratelimit";
import { serializeChannel } from "./serialize";
import { snowflake } from "./snowflake";
import { Form } from "./validate";

// Cria uma thread pública dentro de um canal de texto.
// fromMessageId: thread nascida de uma mensagem (o id da thread é o id da mensagem, como no Discord).
export async function createThread(req: NextRequest, parentId: bigint, fromMessageId: bigint | null) {
  const { user } = await requireAuth(req);
  const ctx = await loadChannelContext(parentId, user.id);
  if (ctx.channel.type !== 0 || ctx.channel.guildId == null) throw Errors.invalidChannelType();
  requirePermission(ctx, Permissions.SEND_MESSAGES);
  await limit("threadCreate", user.id);

  const form = new Form(await readJson(req));
  const name = form.string("name", { min: 1, max: 100 });
  form.done();

  if (fromMessageId) {
    const msg = await db.message.count({ where: { id: fromMessageId, channelId: parentId } });
    if (!msg) throw Errors.unknownMessage();
    if (await db.channel.count({ where: { id: fromMessageId } })) {
      throw new ApiError(400, 160004, "A thread has already been created for this message");
    }
  }

  const thread = await db.channel.create({
    data: {
      id: fromMessageId ?? snowflake(),
      type: 11,
      guildId: ctx.channel.guildId,
      parentId,
      name: name!,
      ownerId: user.id,
    },
    include: { overwrites: true },
  });
  const payload = serializeChannel(thread, { overwrites: [] });
  // channelId = thread: o gateway resolve a permissão pelo canal pai
  await dispatch("CHANNEL_CREATE", payload, { guildId: thread.guildId, channelId: thread.id });
  return payload;
}
