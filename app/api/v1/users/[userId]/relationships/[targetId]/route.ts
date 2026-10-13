import { requireAuth, requireMe } from "@/lib/server/auth";
import { Errors, noContent, readJson, route } from "@/lib/server/http";
import { Rel, blockUser, removeRelationship, sendFriendRequest } from "@/lib/server/relationships";
import { Form, idParam } from "@/lib/server/validate";

type Params = { userId: string; targetId: string };

// PUT /api/v1/users/@me/relationships/{user.id}  { type?: 2 }
// sem type (ou 1): pede/aceita amizade. type 2: bloqueia.
export const PUT = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const p = await params;
  requireMe(p.userId);
  const targetId = idParam(p.targetId, Errors.unknownUser);

  const form = new Form(await readJson(req));
  const type = form.int("type", { min: 1, max: 2 });
  form.done();

  if (type === Rel.BLOCKED) await blockUser(user, targetId);
  else await sendFriendRequest(user, targetId);
  return noContent();
});

// DELETE: desfaz amizade, cancela/recusa pedido ou desbloqueia
export const DELETE = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const p = await params;
  requireMe(p.userId);
  await removeRelationship(user, idParam(p.targetId, Errors.unknownUser));
  return noContent();
});
