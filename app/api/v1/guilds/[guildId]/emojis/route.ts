import { requireAuth } from "@/lib/server/auth";
import { requireMember, requirePermission } from "@/lib/server/access";
import { db } from "@/lib/server/db";
import { EMOJI_NAME, broadcastEmojis } from "@/lib/server/emojis";
import { emojiSelect, serializeEmoji } from "@/lib/server/guilds";
import { ApiError, Errors, json, route } from "@/lib/server/http";
import { Permissions } from "@/lib/server/permissions";
import { limit } from "@/lib/server/ratelimit";
import { snowflake } from "@/lib/server/snowflake";
import { sniffImageType, storeFile } from "@/lib/server/storage";
import { idParam } from "@/lib/server/validate";

type Params = { guildId: string };

const MAX_EMOJI_BYTES = 256 * 1024;
const MAX_EMOJIS = 50;

// GET /api/v1/guilds/{id}/emojis
export const GET = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const guildId = idParam((await params).guildId, Errors.unknownGuild);
  await requireMember(guildId, user.id);
  const emojis = await db.emoji.findMany({ where: { guildId }, select: emojiSelect, orderBy: { name: "asc" } });
  return json(emojis.map(serializeEmoji));
});

// POST /api/v1/guilds/{id}/emojis  (multipart: name, image)  MANAGE_GUILD_EXPRESSIONS
export const POST = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const guildId = idParam((await params).guildId, Errors.unknownGuild);
  const ctx = await requireMember(guildId, user.id);
  requirePermission(ctx, Permissions.MANAGE_GUILD_EXPRESSIONS);
  await limit("emojiCreate", user.id);

  const form = await req.formData().catch(() => null);
  const name = String(form?.get("name") ?? "").trim();
  const file = form?.get("image");
  if (!EMOJI_NAME.test(name)) {
    throw new ApiError(400, 50035, "Invalid Form Body", { name: { _errors: [{ code: "STRING_TYPE_REGEX", message: "Invalid name" }] } });
  }
  if (!file || typeof file === "string") throw Errors.badRequest("Missing image");
  if (file.size > MAX_EMOJI_BYTES) throw new ApiError(400, 50138, "Emoji image too big (max 256 KB)");
  if ((await db.emoji.count({ where: { guildId } })) >= MAX_EMOJIS) throw new ApiError(400, 30008, "Maximum number of emojis reached (50)");

  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniffImageType(buf);
  if (!type) throw Errors.badRequest("Image must be PNG, JPEG, GIF or WebP");

  const id = snowflake();
  const animated = type === "image/gif";
  const stored = await storeFile(`emojis/${guildId}/${id}.${animated ? "gif" : "png"}`, buf, type);
  const emoji = await db.emoji.create({
    data: {
      id,
      guildId,
      name,
      creatorId: user.id,
      animated,
      contentType: type,
      url: stored.url,
      data: stored.data ? new Uint8Array(stored.data) : null,
    },
    select: emojiSelect,
  });
  await broadcastEmojis(guildId);
  return json(serializeEmoji(emoji), 201);
});
