import { requireAuth } from "@/lib/server/auth";
import { requireMember } from "@/lib/server/access";
import { db } from "@/lib/server/db";
import { Errors, json, route } from "@/lib/server/http";
import { serializeMember } from "@/lib/server/serialize";
import { parseSnowflake } from "@/lib/server/snowflake";
import { idParam, queryInt } from "@/lib/server/validate";

// GET /api/v1/guilds/{id}/members?limit=100&after={user.id}
export const GET = route<{ guildId: string }>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const guildId = idParam((await params).guildId, Errors.unknownGuild);
  await requireMember(guildId, user.id);

  const q = req.nextUrl.searchParams;
  const limit = queryInt(q.get("limit"), 100, 1, 1000);
  const after = parseSnowflake(q.get("after"));

  const members = await db.member.findMany({
    where: { guildId, ...(after ? { userId: { gt: after } } : {}) },
    include: { roles: true, user: true },
    orderBy: { userId: "asc" },
    take: limit,
  });
  return json(members.map(serializeMember));
});
