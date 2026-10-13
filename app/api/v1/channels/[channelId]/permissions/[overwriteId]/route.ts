import { requireAuth } from "@/lib/server/auth";
import { loadChannelContext, requirePermission, type ChannelContext } from "@/lib/server/access";
import { db } from "@/lib/server/db";
import { dispatch } from "@/lib/server/events";
import { Errors, noContent, readJson, route } from "@/lib/server/http";
import { Permissions } from "@/lib/server/permissions";
import { serializeChannel } from "@/lib/server/serialize";
import { Form, idParam } from "@/lib/server/validate";
import type { NextRequest } from "next/server";

type Params = { channelId: string; overwriteId: string };

async function load(req: NextRequest, params: Promise<Params>) {
  const { user } = await requireAuth(req);
  const p = await params;
  const channelId = idParam(p.channelId, Errors.unknownChannel);
  const targetId = idParam(p.overwriteId, Errors.unknownRole);
  const ctx = await loadChannelContext(channelId, user.id);
  if (ctx.channel.guildId == null) throw Errors.invalidChannelType();
  requirePermission(ctx, Permissions.MANAGE_ROLES);
  return { ctx, channelId, targetId };
}

async function broadcast(ctx: ChannelContext) {
  const c = await db.channel.findUniqueOrThrow({ where: { id: ctx.channel.id }, include: { overwrites: true } });
  await dispatch("CHANNEL_UPDATE", serializeChannel(c, { overwrites: c.overwrites }), {
    guildId: c.guildId,
    channelId: c.id,
  });
}

// PUT /api/v1/channels/{id}/permissions/{overwrite.id} { type (0 cargo | 1 membro), allow?, deny? }
export const PUT = route<Params>(async (req, { params }) => {
  const { ctx, channelId, targetId } = await load(req, params);
  const form = new Form(await readJson(req));
  const type = form.int("type", { min: 0, max: 1 });
  const allow = form.permissions("allow") ?? BigInt(0);
  const deny = form.permissions("deny") ?? BigInt(0);
  form.done();
  if (type == null) throw Errors.badRequest("type is required");

  // não dá para liberar ou negar algo que você não tem no canal
  if (((allow | deny) & ~ctx.permissions) !== BigInt(0)) throw Errors.missingPermissions();

  if (type === 0) {
    const role = ctx.member!.roles.find((r) => r.id === targetId);
    if (!role) throw Errors.unknownRole();
  } else {
    const member = await db.member.findUnique({ where: { guildId_userId: { guildId: ctx.channel.guildId!, userId: targetId } } });
    if (!member) throw Errors.unknownMember();
  }

  await db.permissionOverwrite.upsert({
    where: { channelId_targetId: { channelId, targetId } },
    create: { channelId, targetId, type, allow, deny },
    update: { type, allow, deny },
  });
  await broadcast(ctx);
  return noContent();
});

// DELETE /api/v1/channels/{id}/permissions/{overwrite.id}
export const DELETE = route<Params>(async (req, { params }) => {
  const { ctx, channelId, targetId } = await load(req, params);
  await db.permissionOverwrite.deleteMany({ where: { channelId, targetId } });
  await broadcast(ctx);
  return noContent();
});
