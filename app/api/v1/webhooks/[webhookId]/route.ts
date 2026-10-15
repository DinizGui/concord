import { requireAuth } from "@/lib/server/auth";
import { requireMember, requirePermission } from "@/lib/server/access";
import { db } from "@/lib/server/db";
import { ApiError, json, noContent, readJson, route } from "@/lib/server/http";
import { Permissions } from "@/lib/server/permissions";
import { Form, idParam } from "@/lib/server/validate";
import { serializeWebhook } from "@/lib/server/webhooks";

type Params = { webhookId: string };

const unknownWebhook = () => new ApiError(404, 10015, "Unknown Webhook");

async function load(req: Parameters<typeof requireAuth>[0], params: Promise<Params>) {
  const { user } = await requireAuth(req);
  const id = idParam((await params).webhookId, unknownWebhook);
  const hook = await db.webhook.findUnique({ where: { id } });
  if (!hook) throw unknownWebhook();
  const ctx = await requireMember(hook.guildId, user.id);
  requirePermission(ctx, Permissions.MANAGE_WEBHOOKS);
  return hook;
}

// PATCH /api/v1/webhooks/{id} { name?, avatar? }
export const PATCH = route<Params>(async (req, { params }) => {
  const hook = await load(req, params);
  const form = new Form(await readJson(req));
  const name = form.optionalString("name", { min: 1, max: 80 });
  const avatar = form.optionalString("avatar", { max: 512, pattern: /^https:\/\/\S+$/ });
  form.done();
  const updated = await db.webhook.update({
    where: { id: hook.id },
    data: { ...(name ? { name } : {}), ...(avatar !== undefined ? { avatar } : {}) },
  });
  return json(serializeWebhook(updated));
});

// DELETE /api/v1/webhooks/{id}
export const DELETE = route<Params>(async (req, { params }) => {
  const hook = await load(req, params);
  await db.webhook.delete({ where: { id: hook.id } });
  return noContent();
});
