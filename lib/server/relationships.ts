import type { User } from "@prisma/client";
import { db } from "./db";
import { dispatchToUsers } from "./events";
import { Errors } from "./http";
import { serializeRelationship } from "./serialize";

export const Rel = { FRIEND: 1, BLOCKED: 2, INCOMING: 3, OUTGOING: 4 } as const;

async function upsertRel(userId: bigint, targetId: bigint, type: number) {
  return db.relationship.upsert({
    where: { userId_targetId: { userId, targetId } },
    create: { userId, targetId, type },
    update: { type, since: new Date() },
    include: { target: true },
  });
}

async function notifyAdd(userId: bigint, targetId: bigint, type: number) {
  const rel = await upsertRel(userId, targetId, type);
  await dispatchToUsers("RELATIONSHIP_ADD", serializeRelationship(rel), [userId]);
}

async function removeRel(userId: bigint, targetId: bigint) {
  const removed = await db.relationship.deleteMany({ where: { userId, targetId } });
  if (removed.count) await dispatchToUsers("RELATIONSHIP_REMOVE", { id: targetId.toString() }, [userId]);
}

// Pedido de amizade. Se o outro já tinha pedido, vira amizade.
export async function sendFriendRequest(me: User, targetId: bigint) {
  if (targetId === me.id) throw Errors.badRequest("Cannot add yourself");
  const target = await db.user.findUnique({ where: { id: targetId } });
  if (!target) throw Errors.unknownUser();

  const [mine, theirs] = await Promise.all([
    db.relationship.findUnique({ where: { userId_targetId: { userId: me.id, targetId } } }),
    db.relationship.findUnique({ where: { userId_targetId: { userId: targetId, targetId: me.id } } }),
  ]);
  if (theirs?.type === Rel.BLOCKED) throw Errors.friendRequestFailed();
  if (mine?.type === Rel.FRIEND || mine?.type === Rel.OUTGOING) return;

  if (mine?.type === Rel.INCOMING) {
    await notifyAdd(me.id, targetId, Rel.FRIEND);
    await notifyAdd(targetId, me.id, Rel.FRIEND);
    return;
  }
  await notifyAdd(me.id, targetId, Rel.OUTGOING);
  await notifyAdd(targetId, me.id, Rel.INCOMING);
}

export async function blockUser(me: User, targetId: bigint) {
  if (targetId === me.id) throw Errors.badRequest("Cannot block yourself");
  const target = await db.user.findUnique({ where: { id: targetId } });
  if (!target) throw Errors.unknownUser();
  const theirs = await db.relationship.findUnique({ where: { userId_targetId: { userId: targetId, targetId: me.id } } });
  if (theirs && theirs.type !== Rel.BLOCKED) await removeRel(targetId, me.id);
  await notifyAdd(me.id, targetId, Rel.BLOCKED);
}

// Desfaz amizade, cancela/recusa pedido ou desbloqueia
export async function removeRelationship(me: User, targetId: bigint) {
  const mine = await db.relationship.findUnique({ where: { userId_targetId: { userId: me.id, targetId } } });
  if (!mine) return;
  await removeRel(me.id, targetId);
  if (mine.type !== Rel.BLOCKED) {
    const theirs = await db.relationship.findUnique({ where: { userId_targetId: { userId: targetId, targetId: me.id } } });
    if (theirs && theirs.type !== Rel.BLOCKED) await removeRel(targetId, me.id);
  }
}

export async function isBlockedBetween(a: bigint, b: bigint) {
  const count = await db.relationship.count({
    where: {
      type: Rel.BLOCKED,
      OR: [
        { userId: a, targetId: b },
        { userId: b, targetId: a },
      ],
    },
  });
  return count > 0;
}
