import { requireAuth, requireMe } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { dispatchToUsers } from "@/lib/server/events";
import { ApiError, Errors, json, readJson, route } from "@/lib/server/http";
import { serializeChannel } from "@/lib/server/serialize";
import { snowflake } from "@/lib/server/snowflake";
import { Form } from "@/lib/server/validate";

type Params = { userId: string };

const dmInclude = { recipients: { include: { user: true } } } as const;

// GET /api/v1/users/@me/channels: DMs e grupos
export const GET = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  requireMe((await params).userId);
  const channels = await db.channel.findMany({
    where: { guildId: null, recipients: { some: { userId: user.id } } },
    include: dmInclude,
    orderBy: { lastMessageId: "desc" },
  });
  return json(
    channels.map((c) =>
      serializeChannel(c, { recipients: c.recipients.filter((r) => r.userId !== user.id).map((r) => r.user) }),
    ),
  );
});

// POST /api/v1/users/@me/channels
//   { recipient_id }      abre (ou reaproveita) a DM 1:1
//   { recipients: [ids] } cria DM em grupo (só com amigos, até 10 pessoas)
export const POST = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  requireMe((await params).userId);

  const form = new Form(await readJson(req));
  const recipientId = form.snowflake("recipient_id");
  const recipients = form.snowflakes("recipients", { max: 9 });
  form.done();

  if (recipientId != null) {
    if (recipientId === user.id) throw Errors.badRequest("Cannot open a DM with yourself");
    const target = await db.user.findUnique({ where: { id: recipientId } });
    if (!target) throw Errors.unknownUser();

    const existing = await db.channel.findFirst({
      where: {
        type: 1,
        AND: [{ recipients: { some: { userId: user.id } } }, { recipients: { some: { userId: recipientId } } }],
      },
      include: dmInclude,
    });
    if (existing) {
      return json(serializeChannel(existing, { recipients: [target] }));
    }

    const channel = await db.channel.create({
      data: {
        id: snowflake(),
        type: 1,
        recipients: { create: [{ userId: user.id }, { userId: recipientId }] },
      },
    });
    await dispatchToUsers(
      "CHANNEL_CREATE",
      (to) => serializeChannel(channel, { recipients: [to === user.id ? target : user] }),
      [user.id, recipientId],
    );
    return json(serializeChannel(channel, { recipients: [target] }));
  }

  const ids = (recipients ?? []).filter((id) => id !== user.id);
  if (ids.length < 1) throw Errors.badRequest("recipient_id or recipients is required");

  const friends = await db.relationship.count({ where: { userId: user.id, type: 1, targetId: { in: ids } } });
  if (friends !== ids.length) throw new ApiError(403, 50007, "You can only add friends to a group DM");

  const users = await db.user.findMany({ where: { id: { in: [user.id, ...ids] } } });
  const channel = await db.channel.create({
    data: {
      id: snowflake(),
      type: 3,
      ownerId: user.id,
      recipients: { create: users.map((u) => ({ userId: u.id })) },
    },
  });
  await dispatchToUsers(
    "CHANNEL_CREATE",
    (to) => serializeChannel(channel, { recipients: users.filter((u) => u.id !== to) }),
    users.map((u) => u.id),
  );
  return json(serializeChannel(channel, { recipients: users.filter((u) => u.id !== user.id) }));
});
