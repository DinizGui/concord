import { requireAuth } from "@/lib/server/auth";
import { isTextLike, loadChannelContext, requirePermission } from "@/lib/server/access";
import { db } from "@/lib/server/db";
import { dispatch } from "@/lib/server/events";
import { Errors, json, readJson, route } from "@/lib/server/http";
import { parseMentions } from "@/lib/server/mentions";
import { fetchMessages, memberPayload, messageInclude, serializeMessages, serializeOne } from "@/lib/server/messages";
import { Permissions, has } from "@/lib/server/permissions";
import { isBlockedBetween } from "@/lib/server/relationships";
import { snowflake, snowflakeDate, parseSnowflake } from "@/lib/server/snowflake";
import { Form, idParam, queryInt } from "@/lib/server/validate";

type Params = { channelId: string };

// GET /api/v1/channels/{id}/messages?limit=50&before|after|around={message.id}
export const GET = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const channelId = idParam((await params).channelId, Errors.unknownChannel);
  const ctx = await loadChannelContext(channelId, user.id);
  if (!isTextLike(ctx.channel.type)) throw Errors.invalidChannelType();
  requirePermission(ctx, Permissions.READ_MESSAGE_HISTORY);

  const q = req.nextUrl.searchParams;
  const rows = await fetchMessages(channelId, {
    limit: queryInt(q.get("limit"), 50, 1, 100),
    before: parseSnowflake(q.get("before")) ?? undefined,
    after: parseSnowflake(q.get("after")) ?? undefined,
    around: parseSnowflake(q.get("around")) ?? undefined,
  });
  return json(await serializeMessages(rows, { viewerId: user.id, guildId: ctx.channel.guildId }));
});

// POST /api/v1/channels/{id}/messages { content, nonce?, message_reference?: { message_id } }
export const POST = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const channelId = idParam((await params).channelId, Errors.unknownChannel);
  const ctx = await loadChannelContext(channelId, user.id);
  const { channel } = ctx;
  if (!isTextLike(channel.type)) throw Errors.invalidChannelType();
  requirePermission(ctx, Permissions.SEND_MESSAGES);

  const body = await readJson(req);
  const form = new Form(body);
  const content = form.optionalString("content", { max: 2000 }) ?? "";
  const nonce = form.optionalString("nonce", { max: 64 });
  form.done();
  if (!content) throw Errors.emptyMessage();

  let referencedId: bigint | null = null;
  const ref = body.message_reference as { message_id?: unknown } | undefined;
  if (ref && typeof ref === "object") {
    referencedId = parseSnowflake(ref.message_id);
    const exists = referencedId && (await db.message.count({ where: { id: referencedId, channelId } }));
    if (!exists) throw Errors.unknownMessage();
  }

  // DM 1:1: não manda se alguém bloqueou alguém
  if (channel.type === 1) {
    const other = ctx.recipientIds.find((id) => id !== user.id);
    if (other && (await isBlockedBetween(user.id, other))) throw Errors.cannotMessageUser();
  }

  // modo lento: vale para quem não tem MANAGE_MESSAGES nem MANAGE_CHANNELS
  if (
    channel.rateLimitPerUser > 0 &&
    !has(ctx.permissions, Permissions.MANAGE_MESSAGES) &&
    !has(ctx.permissions, Permissions.MANAGE_CHANNELS)
  ) {
    const last = await db.message.findFirst({
      where: { channelId, authorId: user.id },
      orderBy: { id: "desc" },
      select: { id: true },
    });
    if (last) {
      const elapsed = (Date.now() - snowflakeDate(last.id).getTime()) / 1000;
      if (elapsed < channel.rateLimitPerUser) throw Errors.slowmode(Math.ceil(channel.rateLimitPerUser - elapsed));
    }
  }

  const mentions = await parseMentions(content, ctx);
  const id = snowflake();
  const message = await db.message.create({
    data: {
      id,
      channelId,
      authorId: user.id,
      content,
      type: referencedId ? 19 : 0,
      referencedMessageId: referencedId,
      mentionEveryone: mentions.mentionEveryone,
      mentions: mentions.users.map(String),
      mentionRoles: mentions.roles.map(String),
    },
    include: messageInclude,
  });

  await db.channel.update({ where: { id: channelId }, data: { lastMessageId: id } });
  await db.readState.upsert({
    where: { userId_channelId: { userId: user.id, channelId } },
    create: { userId: user.id, channelId, lastMessageId: id },
    update: { lastMessageId: id, mentionCount: 0 },
  });

  // contador de menções não lidas (DMs contam como menção, igual ao Discord)
  const mentioned = (channel.guildId == null ? ctx.recipientIds : mentions.users).filter((u) => u !== user.id);
  if (mentioned.length) {
    await db.$transaction(
      mentioned.map((userId) =>
        db.readState.upsert({
          where: { userId_channelId: { userId, channelId } },
          create: { userId, channelId, lastMessageId: BigInt(0), mentionCount: 1 },
          update: { mentionCount: { increment: 1 } },
        }),
      ),
    );
  }

  const payload = await serializeOne(message, { guildId: channel.guildId });
  const eventPayload = {
    ...payload,
    ...(nonce ? { nonce } : {}),
    ...(channel.guildId ? { member: await memberPayload(channel.guildId, user.id) } : {}),
  };
  await dispatch("MESSAGE_CREATE", eventPayload, { guildId: channel.guildId, channelId });
  return json({ ...payload, ...(nonce ? { nonce } : {}) });
});
