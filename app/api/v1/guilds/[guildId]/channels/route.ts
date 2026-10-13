import { requireAuth } from "@/lib/server/auth";
import { channelPermissions, requireMember, requirePermission } from "@/lib/server/access";
import { copyOverwrites, nextChannelPosition, normalizeTextChannelName, parseOverwrites } from "@/lib/server/channels";
import { db } from "@/lib/server/db";
import { dispatch } from "@/lib/server/events";
import { ApiError, Errors, json, readJson, readJsonArray, route } from "@/lib/server/http";
import { Permissions, has } from "@/lib/server/permissions";
import { serializeChannel } from "@/lib/server/serialize";
import { snowflake } from "@/lib/server/snowflake";
import { Form, idParam } from "@/lib/server/validate";

type Params = { guildId: string };

// GET /api/v1/guilds/{id}/channels: só os que o usuário pode ver
export const GET = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const guildId = idParam((await params).guildId, Errors.unknownGuild);
  const ctx = await requireMember(guildId, user.id);

  const channels = await db.channel.findMany({ where: { guildId }, include: { overwrites: true }, orderBy: { position: "asc" } });
  return json(
    channels
      .filter((c) => has(channelPermissions(ctx, c, user.id), Permissions.VIEW_CHANNEL))
      .map((c) => serializeChannel(c, { overwrites: c.overwrites })),
  );
});

// POST /api/v1/guilds/{id}/channels
// { name, type (0 texto | 2 voz | 4 categoria), topic?, parent_id?, position?, nsfw?,
//   rate_limit_per_user?, bitrate?, user_limit?, permission_overwrites? }
export const POST = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const guildId = idParam((await params).guildId, Errors.unknownGuild);
  const ctx = await requireMember(guildId, user.id);
  requirePermission(ctx, Permissions.MANAGE_CHANNELS);

  const body = await readJson(req);
  const form = new Form(body);
  const rawName = form.string("name", { min: 1, max: 100 });
  const type = form.int("type", { min: 0, max: 4 }) ?? 0;
  const topic = form.optionalString("topic", { max: 1024 });
  const parentId = form.snowflake("parent_id");
  const position = form.int("position", { min: 0, max: 10000 });
  const nsfw = form.bool("nsfw");
  const rateLimit = form.int("rate_limit_per_user", { min: 0, max: 21600 });
  const bitrate = form.int("bitrate", { min: 8000, max: 384000 });
  const userLimit = form.int("user_limit", { min: 0, max: 99 });
  form.done();
  if (![0, 2, 4].includes(type)) throw Errors.invalidChannelType();

  let overwrites = form.has("permission_overwrites") ? parseOverwrites(body.permission_overwrites) : [];
  if (overwrites === null) throw new ApiError(400, 50035, "Invalid Form Body", { permission_overwrites: { _errors: [{ code: "BASE_TYPE_ARRAY", message: "Invalid overwrites" }] } });

  if (parentId) {
    if (type === 4) throw Errors.badRequest("Categories cannot have a parent");
    const parent = await db.channel.findFirst({ where: { id: parentId, guildId, type: 4 }, include: { overwrites: true } });
    if (!parent) throw Errors.unknownChannel();
    // igual ao Discord: canal novo numa categoria herda as permissões dela
    if (!form.has("permission_overwrites")) overwrites = copyOverwrites(parent.overwrites);
  }

  const name = type === 0 ? normalizeTextChannelName(rawName!) || "novo-canal" : rawName!;
  const channel = await db.channel.create({
    data: {
      id: snowflake(),
      guildId,
      type,
      name,
      topic: type === 0 ? (topic ?? null) : null,
      parentId: parentId ?? null,
      position: position ?? (await nextChannelPosition(guildId, parentId ?? null, type)),
      nsfw: nsfw ?? false,
      rateLimitPerUser: type === 0 ? (rateLimit ?? 0) : 0,
      bitrate: type === 2 ? (bitrate ?? 64000) : null,
      userLimit: type === 2 ? (userLimit ?? 0) : null,
      overwrites: { create: overwrites },
    },
    include: { overwrites: true },
  });

  const payload = serializeChannel(channel, { overwrites: channel.overwrites });
  await dispatch("CHANNEL_CREATE", payload, { guildId, channelId: channel.id });
  return json(payload, 201);
});

// PATCH /api/v1/guilds/{id}/channels  [{ id, position, parent_id? }]: reordenar
export const PATCH = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const guildId = idParam((await params).guildId, Errors.unknownGuild);
  const ctx = await requireMember(guildId, user.id);
  requirePermission(ctx, Permissions.MANAGE_CHANNELS);

  const items = (await readJsonArray(req)).slice(0, 500);
  const updates: { id: bigint; position?: number; parentId?: bigint | null }[] = [];
  for (const item of items) {
    const form = new Form((item ?? {}) as Record<string, unknown>);
    const id = form.snowflake("id");
    const position = form.int("position", { min: 0, max: 10000 });
    const parentId = form.snowflake("parent_id");
    form.done();
    if (!id) throw Errors.badRequest("id is required");
    updates.push({ id, position, parentId });
  }

  const channels = await db.channel.findMany({ where: { guildId, id: { in: updates.map((u) => u.id) } } });
  if (channels.length !== updates.length) throw Errors.unknownChannel();
  const categories = new Set(
    (await db.channel.findMany({ where: { guildId, type: 4 }, select: { id: true } })).map((c) => c.id.toString()),
  );
  for (const u of updates) {
    if (u.parentId && !categories.has(u.parentId.toString())) throw Errors.unknownChannel();
  }

  const updated = await db.$transaction(
    updates.map((u) =>
      db.channel.update({
        where: { id: u.id },
        data: {
          ...(u.position !== undefined ? { position: u.position } : {}),
          ...(u.parentId !== undefined ? { parentId: u.parentId } : {}),
        },
        include: { overwrites: true },
      }),
    ),
  );
  for (const c of updated) {
    await dispatch("CHANNEL_UPDATE", serializeChannel(c, { overwrites: c.overwrites }), { guildId, channelId: c.id });
  }
  return new Response(null, { status: 204 });
});
