import { requireAuth } from "@/lib/server/auth";
import { requireMember, requirePermission } from "@/lib/server/access";
import { db } from "@/lib/server/db";
import { emojiSelect, serializeEmoji } from "@/lib/server/guilds";
import { ApiError, Errors, json, noContent, readJson, route } from "@/lib/server/http";
import { Permissions } from "@/lib/server/permissions";
import { removeFiles } from "@/lib/server/storage";
import { idParam } from "@/lib/server/validate";
import { EMOJI_NAME, broadcastEmojis } from "@/lib/server/emojis";

type Params = { guildId: string; emojiId: string };

async function load(req: Parameters<typeof requireAuth>[0], params: Promise<Params>) {
  const { user } = await requireAuth(req);
  const p = await params;
  const guildId = idParam(p.guildId, Errors.unknownGuild);
  const emojiId = idParam(p.emojiId, Errors.unknownEmoji);
  const ctx = await requireMember(guildId, user.id);
  requirePermission(ctx, Permissions.MANAGE_GUILD_EXPRESSIONS);
  const emoji = await db.emoji.findFirst({ where: { id: emojiId, guildId }, select: emojiSelect });
  if (!emoji) throw Errors.unknownEmoji();
  return { guildId, emoji };
}

// PATCH /api/v1/guilds/{id}/emojis/{emoji.id} { name }
export const PATCH = route<Params>(async (req, { params }) => {
  const { guildId, emoji } = await load(req, params);
  const body = await readJson(req);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!EMOJI_NAME.test(name)) {
    throw new ApiError(400, 50035, "Invalid Form Body", { name: { _errors: [{ code: "STRING_TYPE_REGEX", message: "Invalid name" }] } });
  }
  const updated = await db.emoji.update({ where: { id: emoji.id }, data: { name }, select: emojiSelect });
  await broadcastEmojis(guildId);
  return json(serializeEmoji(updated));
});

// DELETE /api/v1/guilds/{id}/emojis/{emoji.id}
export const DELETE = route<Params>(async (req, { params }) => {
  const { guildId, emoji } = await load(req, params);
  await removeFiles([emoji.url]);
  await db.emoji.delete({ where: { id: emoji.id } });
  await broadcastEmojis(guildId);
  return noContent();
});
