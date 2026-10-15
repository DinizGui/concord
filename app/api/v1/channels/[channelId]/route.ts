import { requireAuth } from "@/lib/server/auth";
import { loadChannelContext, requirePermission } from "@/lib/server/access";
import { normalizeTextChannelName } from "@/lib/server/channels";
import { db } from "@/lib/server/db";
import { dispatch, dispatchToUsers } from "@/lib/server/events";
import { Errors, json, readJson, route } from "@/lib/server/http";
import { Permissions } from "@/lib/server/permissions";
import { serializeChannel, serializeUser, sid } from "@/lib/server/serialize";
import { Form, idParam } from "@/lib/server/validate";

type Params = { channelId: string };

function loadFull(channelId: bigint) {
  return db.channel.findUniqueOrThrow({
    where: { id: channelId },
    include: { overwrites: true, recipients: { include: { user: true } } },
  });
}

type FullChannel = Awaited<ReturnType<typeof loadFull>>;

// Em DMs, cada um vê na lista de recipients só os outros
function view(c: FullChannel, viewerId: bigint) {
  return serializeChannel(c, {
    overwrites: c.overwrites,
    recipients: c.recipients.filter((r) => r.userId !== viewerId).map((r) => r.user),
  });
}

async function serializeFor(channelId: bigint, viewerId: bigint) {
  return view(await loadFull(channelId), viewerId);
}

// GET /api/v1/channels/{id}
export const GET = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const channelId = idParam((await params).channelId, Errors.unknownChannel);
  await loadChannelContext(channelId, user.id);
  return json(await serializeFor(channelId, user.id));
});

// PATCH /api/v1/channels/{id}
// guild: { name?, topic?, position?, parent_id?, nsfw?, rate_limit_per_user?, bitrate?, user_limit? }
// DM em grupo: { name?, icon? }
export const PATCH = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const channelId = idParam((await params).channelId, Errors.unknownChannel);
  const ctx = await loadChannelContext(channelId, user.id);
  const { channel } = ctx;
  const form = new Form(await readJson(req));

  if (channel.guildId == null) {
    if (channel.type !== 3) throw Errors.invalidChannelType();
    const name = form.optionalString("name", { max: 100 });
    const icon = form.optionalString("icon", { max: 512, pattern: /^https:\/\/\S+$/ });
    form.done();
    await db.channel.update({
      where: { id: channelId },
      data: { ...(name !== undefined ? { name: name || null } : {}), ...(icon !== undefined ? { icon } : {}) },
    });
    const full = await loadFull(channelId);
    await dispatchToUsers("CHANNEL_UPDATE", (to) => view(full, to), ctx.recipientIds);
    return json(view(full, user.id));
  }

  // thread: o dono (ou MANAGE_CHANNELS) troca nome e arquiva
  if (channel.type === 11) {
    if (channel.ownerId !== user.id) requirePermission(ctx, Permissions.MANAGE_CHANNELS);
    const threadName = form.optionalString("name", { min: 1, max: 100 });
    const archived = form.bool("archived");
    form.done();
    await db.channel.update({
      where: { id: channelId },
      data: { ...(threadName ? { name: threadName } : {}), ...(archived !== undefined ? { archived } : {}) },
    });
    const payload = await serializeFor(channelId, user.id);
    await dispatch("CHANNEL_UPDATE", payload, { guildId: channel.guildId, channelId });
    return json(payload);
  }

  requirePermission(ctx, Permissions.MANAGE_CHANNELS);
  const name = form.optionalString("name", { min: 1, max: 100 });
  const topic = form.optionalString("topic", { max: 1024 });
  const position = form.int("position", { min: 0, max: 10000 });
  const parentId = form.snowflake("parent_id");
  const nsfw = form.bool("nsfw");
  const rateLimit = form.int("rate_limit_per_user", { min: 0, max: 21600 });
  const bitrate = form.int("bitrate", { min: 8000, max: 384000 });
  const userLimit = form.int("user_limit", { min: 0, max: 99 });
  form.done();

  if (parentId) {
    if (channel.type === 4) throw Errors.badRequest("Categories cannot have a parent");
    const parent = await db.channel.findFirst({ where: { id: parentId, guildId: channel.guildId, type: 4 } });
    if (!parent) throw Errors.unknownChannel();
  }

  await db.channel.update({
    where: { id: channelId },
    data: {
      ...(name ? { name: channel.type === 0 ? normalizeTextChannelName(name) || channel.name : name } : {}),
      ...(topic !== undefined && channel.type === 0 ? { topic } : {}),
      ...(position !== undefined ? { position } : {}),
      ...(parentId !== undefined && channel.type !== 4 ? { parentId } : {}),
      ...(nsfw !== undefined ? { nsfw } : {}),
      ...(rateLimit !== undefined && channel.type === 0 ? { rateLimitPerUser: rateLimit } : {}),
      ...(bitrate !== undefined && channel.type === 2 ? { bitrate } : {}),
      ...(userLimit !== undefined && channel.type === 2 ? { userLimit } : {}),
    },
  });

  const payload = await serializeFor(channelId, user.id);
  await dispatch("CHANNEL_UPDATE", payload, { guildId: channel.guildId, channelId });
  return json(payload);
});

// DELETE /api/v1/channels/{id}
// guild: apaga o canal. DM em grupo: sai do grupo. DM 1:1: só "fecha" (não apaga nada).
export const DELETE = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const channelId = idParam((await params).channelId, Errors.unknownChannel);
  const ctx = await loadChannelContext(channelId, user.id);
  const { channel } = ctx;
  const payload = await serializeFor(channelId, user.id);

  if (channel.guildId == null) {
    if (channel.type === 3) {
      const rest = ctx.recipientIds.filter((id) => id !== user.id);
      if (!rest.length) {
        await db.channel.delete({ where: { id: channelId } });
      } else {
        await db.channelRecipient.delete({ where: { channelId_userId: { channelId, userId: user.id } } });
        if (channel.ownerId === user.id) await db.channel.update({ where: { id: channelId }, data: { ownerId: rest[0] } });
        await dispatch("CHANNEL_RECIPIENT_REMOVE", { channel_id: sid(channelId), user: serializeUser(user) }, { channelId });
      }
      await dispatchToUsers("CHANNEL_DELETE", payload, [user.id]);
    }
    return json(payload);
  }

  if (!(channel.type === 11 && channel.ownerId === user.id)) requirePermission(ctx, Permissions.MANAGE_CHANNELS);
  const guildId = channel.guildId;

  // canal de texto apagado leva as threads junto
  const threads = channel.type === 0 ? await db.channel.findMany({ where: { parentId: channelId, type: 11 } }) : [];
  if (threads.length) await db.channel.deleteMany({ where: { id: { in: threads.map((t) => t.id) } } });
  for (const t of threads) {
    await dispatch("CHANNEL_DELETE", serializeChannel(t, { overwrites: [] }), { guildId });
  }

  const children = channel.type === 4 ? await db.channel.findMany({ where: { parentId: channelId } }) : [];
  await db.$transaction([
    db.channel.updateMany({ where: { parentId: channelId }, data: { parentId: null } }),
    db.guild.updateMany({ where: { id: guildId, systemChannelId: channelId }, data: { systemChannelId: null } }),
    db.channel.delete({ where: { id: channelId } }),
  ]);
  for (const child of children) {
    await dispatch("CHANNEL_UPDATE", await serializeFor(child.id, user.id), { guildId, channelId: child.id });
  }
  await dispatch("CHANNEL_DELETE", payload, { guildId });
  return json(payload);
});
