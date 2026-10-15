import { db } from "./db";
import { dispatch } from "./events";
import { emojiSelect, serializeEmoji } from "./guilds";
import { sid } from "./serialize";

export const EMOJI_NAME = /^[A-Za-z0-9_]{2,32}$/;

// Emoji custom na reação: "nome:id"
export const CUSTOM_REACTION = /^[A-Za-z0-9_]{2,32}:(\d{1,20})$/;

export async function broadcastEmojis(guildId: bigint) {
  const emojis = await db.emoji.findMany({ where: { guildId }, select: emojiSelect, orderBy: { name: "asc" } });
  await dispatch("GUILD_EMOJIS_UPDATE", { guild_id: sid(guildId), emojis: emojis.map(serializeEmoji) }, { guildId });
}
