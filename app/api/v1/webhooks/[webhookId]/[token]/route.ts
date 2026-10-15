import { db } from "@/lib/server/db";
import { dispatch } from "@/lib/server/events";
import { ApiError, Errors, json, noContent, readJson, route } from "@/lib/server/http";
import { messageInclude, serializeOne } from "@/lib/server/messages";
import { limit } from "@/lib/server/ratelimit";
import { snowflake } from "@/lib/server/snowflake";
import { Form, idParam } from "@/lib/server/validate";
import { serializeWebhook, tokenMatches } from "@/lib/server/webhooks";

type Params = { webhookId: string; token: string };

const unknownWebhook = () => new ApiError(404, 10015, "Unknown Webhook");

async function load(params: Promise<Params>) {
  const p = await params;
  const id = idParam(p.webhookId, unknownWebhook);
  const hook = await db.webhook.findUnique({ where: { id } });
  if (!hook || !tokenMatches(p.token, hook.tokenHash)) throw unknownWebhook();
  return hook;
}

// GET /api/v1/webhooks/{id}/{token}
export const GET = route<Params>(async (_req, { params }) => json(serializeWebhook(await load(params))));

// POST /api/v1/webhooks/{id}/{token} { content, username?, avatar_url? }
// Sem login: quem tem a URL posta no canal. Com ?wait=true devolve a mensagem criada.
export const POST = route<Params>(async (req, { params }) => {
  const hook = await load(params);
  await limit("webhookExecute", hook.id);
  const form = new Form(await readJson(req));
  const content = form.string("content", { min: 1, max: 2000 });
  const username = form.optionalString("username", { min: 1, max: 80 });
  const avatar = form.optionalString("avatar_url", { max: 512, pattern: /^https:\/\/\S+$/ });
  form.done();

  const channel = await db.channel.findUnique({ where: { id: hook.channelId } });
  if (!channel) throw Errors.unknownChannel();

  const id = snowflake();
  // webhook não menciona ninguém (evita spam de @everyone vindo de integração)
  const message = await db.message.create({
    data: {
      id,
      channelId: hook.channelId,
      authorId: hook.creatorId,
      webhookId: hook.id,
      authorName: username ?? hook.name,
      authorAvatar: avatar ?? hook.avatar,
      content: content!,
      mentions: [],
      mentionRoles: [],
    },
    include: messageInclude,
  });
  await db.channel.update({ where: { id: hook.channelId }, data: { lastMessageId: id, messageCount: { increment: 1 } } });

  const payload = await serializeOne(message, { guildId: hook.guildId });
  await dispatch("MESSAGE_CREATE", payload, { guildId: hook.guildId, channelId: hook.channelId });
  return req.nextUrl.searchParams.get("wait") === "true" ? json(payload) : noContent();
});

// DELETE /api/v1/webhooks/{id}/{token}  → o próprio webhook se apaga
export const DELETE = route<Params>(async (_req, { params }) => {
  const hook = await load(params);
  await db.webhook.delete({ where: { id: hook.id } });
  return noContent();
});
