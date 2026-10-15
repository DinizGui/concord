import { requireAuth, requireMe } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { Errors, json, noContent, readJson, route } from "@/lib/server/http";
import { sendFriendRequest } from "@/lib/server/relationships";
import { serializeRelationship } from "@/lib/server/serialize";
import { Form } from "@/lib/server/validate";
import { limit } from "@/lib/server/ratelimit";

type Params = { userId: string };

// GET /api/v1/users/@me/relationships
export const GET = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  requireMe((await params).userId);
  const rels = await db.relationship.findMany({ where: { userId: user.id }, include: { target: true } });
  return json(rels.map(serializeRelationship));
});

// POST /api/v1/users/@me/relationships { username }: pedido de amizade pelo username
export const POST = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  await limit("friendRequest", user.id);
  requireMe((await params).userId);
  const form = new Form(await readJson(req));
  const username = form.string("username", { min: 2, max: 32 });
  form.done();

  const target = await db.user.findUnique({ where: { username: username!.toLowerCase() } });
  if (!target) throw Errors.unknownUser();
  await sendFriendRequest(user, target.id);
  return noContent();
});
