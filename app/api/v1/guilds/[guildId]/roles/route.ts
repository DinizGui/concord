import { requireAuth } from "@/lib/server/auth";
import { outranks, requireMember, requirePermission } from "@/lib/server/access";
import { db } from "@/lib/server/db";
import { dispatch } from "@/lib/server/events";
import { Errors, json, readJson, readJsonArray, route } from "@/lib/server/http";
import { Permissions } from "@/lib/server/permissions";
import { serializeRole, sid } from "@/lib/server/serialize";
import { snowflake } from "@/lib/server/snowflake";
import { Form, idParam } from "@/lib/server/validate";

type Params = { guildId: string };

// GET /api/v1/guilds/{id}/roles
export const GET = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const guildId = idParam((await params).guildId, Errors.unknownGuild);
  const ctx = await requireMember(guildId, user.id);
  return json(ctx.roles.sort((a, b) => a.position - b.position).map(serializeRole));
});

// POST /api/v1/guilds/{id}/roles { name?, permissions?, color?, hoist?, mentionable? }
// Cargo novo entra logo acima do @everyone (posição 1), como no Discord.
export const POST = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const guildId = idParam((await params).guildId, Errors.unknownGuild);
  const ctx = await requireMember(guildId, user.id);
  requirePermission(ctx, Permissions.MANAGE_ROLES);

  const form = new Form(await readJson(req));
  const name = form.optionalString("name", { min: 1, max: 100 });
  const permissions = form.permissions("permissions");
  const color = form.int("color", { min: 0, max: 0xffffff });
  const hoist = form.bool("hoist");
  const mentionable = form.bool("mentionable");
  form.done();

  // não dá para conceder permissão que você mesmo não tem
  const perms = permissions ?? BigInt(0);
  if ((perms & ~ctx.permissions) !== BigInt(0)) throw Errors.missingPermissions();
  if ((await db.role.count({ where: { guildId } })) >= 250) throw Errors.badRequest("Maximum number of roles reached (250)");

  const [, role] = await db.$transaction([
    db.role.updateMany({ where: { guildId, position: { gte: 1 } }, data: { position: { increment: 1 } } }),
    db.role.create({
      data: {
        id: snowflake(),
        guildId,
        name: name || "novo cargo",
        permissions: perms,
        color: color ?? 0,
        hoist: hoist ?? false,
        mentionable: mentionable ?? false,
        position: 1,
      },
    }),
  ]);

  await dispatch("GUILD_ROLE_CREATE", { guild_id: sid(guildId), role: serializeRole(role) }, { guildId });
  return json(serializeRole(role));
});

// PATCH /api/v1/guilds/{id}/roles [{ id, position }]: reordenar
export const PATCH = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const guildId = idParam((await params).guildId, Errors.unknownGuild);
  const ctx = await requireMember(guildId, user.id);
  requirePermission(ctx, Permissions.MANAGE_ROLES);

  const items = (await readJsonArray(req)).slice(0, 250);
  const moves: { id: bigint; position: number }[] = [];
  for (const item of items) {
    const form = new Form((item ?? {}) as Record<string, unknown>);
    const id = form.snowflake("id");
    const position = form.int("position", { min: 1, max: 250 });
    form.done();
    if (!id || position == null) throw Errors.badRequest("id and position are required");
    moves.push({ id, position });
  }

  for (const m of moves) {
    const role = ctx.roles.find((r) => r.id === m.id);
    if (!role || role.id === guildId) throw Errors.unknownRole();
    // nem o cargo nem o destino podem ficar no nível ou acima do seu cargo mais alto
    if (!outranks(ctx, role.position) || !outranks(ctx, m.position)) throw Errors.missingPermissions();
  }

  const updated = await db.$transaction(
    moves.map((m) => db.role.update({ where: { id: m.id }, data: { position: m.position } })),
  );
  for (const role of updated) {
    await dispatch("GUILD_ROLE_UPDATE", { guild_id: sid(guildId), role: serializeRole(role) }, { guildId });
  }
  const all = await db.role.findMany({ where: { guildId }, orderBy: { position: "asc" } });
  return json(all.map(serializeRole));
});
