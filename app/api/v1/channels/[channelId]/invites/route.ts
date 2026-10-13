import { requireAuth } from "@/lib/server/auth";
import { loadChannelContext, requirePermission } from "@/lib/server/access";
import { db } from "@/lib/server/db";
import { dispatch } from "@/lib/server/events";
import { Errors, json, readJson, route } from "@/lib/server/http";
import { inviteCode, inviteInclude, isInviteUsable } from "@/lib/server/invites";
import { Permissions } from "@/lib/server/permissions";
import { serializeInvite } from "@/lib/server/serialize";
import { Form, idParam } from "@/lib/server/validate";

type Params = { channelId: string };

// GET /api/v1/channels/{id}/invites
export const GET = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const channelId = idParam((await params).channelId, Errors.unknownChannel);
  const ctx = await loadChannelContext(channelId, user.id);
  if (ctx.channel.guildId == null) throw Errors.invalidChannelType();
  requirePermission(ctx, Permissions.MANAGE_CHANNELS);

  const invites = await db.invite.findMany({ where: { channelId }, include: inviteInclude, orderBy: { createdAt: "desc" } });
  return json(invites.map((i) => serializeInvite(i, { guild: i.guild, channel: i.channel, inviter: i.inviter })));
});

// POST /api/v1/channels/{id}/invites { max_age? (s, 0 = nunca expira), max_uses?, temporary?, unique? }
export const POST = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const channelId = idParam((await params).channelId, Errors.unknownChannel);
  const ctx = await loadChannelContext(channelId, user.id);
  const { channel } = ctx;
  if (channel.guildId == null || channel.type === 4) throw Errors.invalidChannelType();
  requirePermission(ctx, Permissions.CREATE_INSTANT_INVITE);

  const form = new Form(await readJson(req));
  const maxAge = form.int("max_age", { min: 0, max: 604800 }) ?? 86400;
  const maxUses = form.int("max_uses", { min: 0, max: 100 }) ?? 0;
  const temporary = form.bool("temporary") ?? false;
  const unique = form.bool("unique") ?? false;
  form.done();

  // sem unique, reaproveita um convite igual que ainda funciona (igual ao Discord)
  if (!unique) {
    const same = await db.invite.findFirst({
      where: { channelId, inviterId: user.id, maxAge, maxUses, temporary },
      include: inviteInclude,
      orderBy: { createdAt: "desc" },
    });
    if (same && isInviteUsable(same)) {
      return json(serializeInvite(same, { guild: same.guild, channel: same.channel, inviter: same.inviter }));
    }
  }

  let invite = null;
  for (let attempt = 0; attempt < 5 && !invite; attempt++) {
    try {
      invite = await db.invite.create({
        data: {
          code: inviteCode(),
          guildId: channel.guildId,
          channelId,
          inviterId: user.id,
          maxAge,
          maxUses,
          temporary,
          expiresAt: maxAge > 0 ? new Date(Date.now() + maxAge * 1000) : null,
        },
        include: inviteInclude,
      });
    } catch {
      // colisão de código: tenta outro
    }
  }
  if (!invite) throw Errors.badRequest("Could not generate invite code");

  const payload = serializeInvite(invite, { guild: invite.guild, channel: invite.channel, inviter: invite.inviter });
  await dispatch("INVITE_CREATE", payload, { guildId: channel.guildId, channelId });
  return json(payload);
});
