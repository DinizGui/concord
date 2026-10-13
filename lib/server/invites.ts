import { randomInt } from "node:crypto";
import type { Channel, Guild, Invite, User } from "@prisma/client";
import { db } from "./db";
import { serializeInvite } from "./serialize";

const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function inviteCode(length = 8) {
  let code = "";
  for (let i = 0; i < length; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

export function isInviteUsable(invite: Invite) {
  if (invite.expiresAt && invite.expiresAt.getTime() <= Date.now()) return false;
  if (invite.maxUses > 0 && invite.uses >= invite.maxUses) return false;
  return true;
}

export async function inviteWithCounts(invite: Invite & { guild: Guild; channel: Channel; inviter: User }, withCounts: boolean) {
  const counts = withCounts
    ? await Promise.all([
        db.member.count({ where: { guildId: invite.guildId } }),
        db.presence.count({
          where: { online: true, status: { not: "invisible" }, user: { memberships: { some: { guildId: invite.guildId } } } },
        }),
      ])
    : null;
  return serializeInvite(invite, {
    guild: invite.guild,
    channel: invite.channel,
    inviter: invite.inviter,
    memberCount: counts?.[0],
    onlineCount: counts?.[1],
  });
}

export const inviteInclude = { guild: true, channel: true, inviter: true } as const;
