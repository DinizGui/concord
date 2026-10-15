import { requireAuth } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { dispatchToUsers } from "@/lib/server/events";
import { loadGuildPayload } from "@/lib/server/guilds";
import { Errors, json, readJson, route } from "@/lib/server/http";
import { DEFAULT_EVERYONE_PERMISSIONS } from "@/lib/server/permissions";
import { snowflake } from "@/lib/server/snowflake";
import { Form } from "@/lib/server/validate";
import { limit } from "@/lib/server/ratelimit";

const MAX_GUILDS = 100;

// POST /api/v1/guilds { name, icon?, description? }
// Cria a guild já com @everyone, categorias e os canais "geral" (texto) e "Geral" (voz).
export const POST = route(async (req) => {
  const { user } = await requireAuth(req);
  await limit("guildCreate", user.id);
  const form = new Form(await readJson(req));
  const name = form.string("name", { min: 2, max: 100 });
  const icon = form.optionalString("icon", { max: 512, pattern: /^https:\/\/\S+$/ });
  const description = form.optionalString("description", { max: 300 });
  form.done();

  if ((await db.member.count({ where: { userId: user.id } })) >= MAX_GUILDS) throw Errors.maxGuilds();

  const guildId = snowflake();
  const textCategory = snowflake();
  const general = snowflake();
  const voiceCategory = snowflake();
  const voice = snowflake();

  await db.$transaction([
    db.guild.create({
      data: { id: guildId, name: name!, icon: icon ?? null, description: description ?? null, ownerId: user.id },
    }),
    db.role.create({
      data: { id: guildId, guildId, name: "@everyone", permissions: DEFAULT_EVERYONE_PERMISSIONS, position: 0 },
    }),
    db.channel.createMany({
      data: [
        { id: textCategory, guildId, type: 4, name: "Canais de texto", position: 0 },
        { id: general, guildId, type: 0, name: "geral", position: 0, parentId: textCategory },
        { id: voiceCategory, guildId, type: 4, name: "Canais de voz", position: 1 },
        { id: voice, guildId, type: 2, name: "Geral", position: 0, parentId: voiceCategory, bitrate: 64000, userLimit: 0 },
      ],
    }),
    db.member.create({ data: { guildId, userId: user.id } }),
    db.guild.update({ where: { id: guildId }, data: { systemChannelId: general } }),
  ]);

  const payload = await loadGuildPayload(guildId, user.id);
  await dispatchToUsers("GUILD_CREATE", payload!, [user.id], { guildId });
  return json(payload, 201);
});
