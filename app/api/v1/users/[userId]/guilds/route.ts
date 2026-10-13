import { requireAuth, requireMe } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { json, route } from "@/lib/server/http";
import { computeBasePermissions } from "@/lib/server/permissions";
import { sid } from "@/lib/server/serialize";

// GET /api/v1/users/@me/guilds: lista resumida (sem canais)
export const GET = route<{ userId: string }>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  requireMe((await params).userId);

  const memberships = await db.member.findMany({
    where: { userId: user.id },
    include: { roles: true, guild: { include: { roles: true } } },
    orderBy: { joinedAt: "asc" },
  });

  return json(
    memberships.map(({ guild, roles }) => {
      const roleIds = roles.map((r) => r.roleId);
      const permissions = computeBasePermissions({
        userId: user.id,
        ownerId: guild.ownerId,
        everyonePermissions: guild.roles.find((r) => r.id === guild.id)?.permissions ?? BigInt(0),
        rolePermissions: guild.roles.filter((r) => roleIds.includes(r.id)).map((r) => r.permissions),
      });
      return {
        id: sid(guild.id),
        name: guild.name,
        icon: guild.icon,
        owner: guild.ownerId === user.id,
        permissions: permissions.toString(),
      };
    }),
  );
});
