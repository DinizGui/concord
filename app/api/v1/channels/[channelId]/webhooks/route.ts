import { requireAuth } from "@/lib/server/auth";
import { loadChannelContext, requirePermission } from "@/lib/server/access";
import { db } from "@/lib/server/db";
import { ApiError, Errors, json, readJson, route } from "@/lib/server/http";
import { appUrl } from "@/lib/server/mail";
import { Permissions } from "@/lib/server/permissions";
import { snowflake } from "@/lib/server/snowflake";
import { Form, idParam } from "@/lib/server/validate";
import { hashToken, newWebhookToken, serializeWebhook } from "@/lib/server/webhooks";

type Params = { channelId: string };

async function load(req: Parameters<typeof requireAuth>[0], params: Promise<Params>) {
  const { user } = await requireAuth(req);
  const channelId = idParam((await params).channelId, Errors.unknownChannel);
  const ctx = await loadChannelContext(channelId, user.id);
  if (ctx.channel.type !== 0 || ctx.channel.guildId == null) throw Errors.invalidChannelType();
  requirePermission(ctx, Permissions.MANAGE_WEBHOOKS);
  return { user, ctx, channelId, guildId: ctx.channel.guildId };
}

// GET /api/v1/channels/{id}/webhooks
export const GET = route<Params>(async (req, { params }) => {
  const { channelId } = await load(req, params);
  const hooks = await db.webhook.findMany({ where: { channelId }, orderBy: { id: "asc" } });
  return json(hooks.map((w) => serializeWebhook(w)));
});

// POST /api/v1/channels/{id}/webhooks { name, avatar? }  → devolve a URL com o token (só agora)
export const POST = route<Params>(async (req, { params }) => {
  const { user, channelId, guildId } = await load(req, params);
  const form = new Form(await readJson(req));
  const name = form.string("name", { min: 1, max: 80 });
  const avatar = form.optionalString("avatar", { max: 512, pattern: /^https:\/\/\S+$/ });
  form.done();
  if ((await db.webhook.count({ where: { channelId } })) >= 15) throw new ApiError(400, 30007, "Maximum number of webhooks reached (15)");

  const token = newWebhookToken();
  const hook = await db.webhook.create({
    data: { id: snowflake(), guildId, channelId, creatorId: user.id, name: name!, avatar: avatar ?? null, tokenHash: hashToken(token) },
  });
  return json(serializeWebhook(hook, token, appUrl(req)), 201);
});
