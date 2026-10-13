import type { ChannelContext } from "./access";
import { db } from "./db";
import { Permissions, has } from "./permissions";

// Lê menções no formato do Discord: <@id>, <@!id>, <@&cargo>, @everyone, @here
export async function parseMentions(content: string, ctx: ChannelContext) {
  const userIds = [...new Set([...content.matchAll(/<@!?(\d{1,20})>/g)].map((m) => m[1]))].slice(0, 50);
  const roleIds = [...new Set([...content.matchAll(/<@&(\d{1,20})>/g)].map((m) => m[1]))].slice(0, 50);
  const canEveryone = has(ctx.permissions, Permissions.MENTION_EVERYONE);
  const mentionEveryone = canEveryone && /@(everyone|here)\b/.test(content);

  let users: bigint[] = [];
  if (userIds.length) {
    const ids = userIds.map(BigInt);
    if (ctx.channel.guildId == null) {
      users = ids.filter((id) => ctx.recipientIds.includes(id));
    } else {
      const members = await db.member.findMany({
        where: { guildId: ctx.channel.guildId, userId: { in: ids } },
        select: { userId: true },
      });
      users = members.map((m) => m.userId);
    }
  }

  let roles: bigint[] = [];
  if (roleIds.length && ctx.member) {
    const ids = roleIds.map(BigInt);
    roles = ctx.member.roles
      .filter((r) => ids.includes(r.id) && r.id !== ctx.member!.guild.id && (r.mentionable || canEveryone))
      .map((r) => r.id);
  }

  return { users, roles, mentionEveryone };
}
