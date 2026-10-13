import { requireAuth } from "@/lib/server/auth";
import { loadChannelContext } from "@/lib/server/access";
import { db } from "@/lib/server/db";
import { dispatchToUsers } from "@/lib/server/events";
import { Errors, json, route } from "@/lib/server/http";
import { serializeReadState } from "@/lib/server/serialize";
import { idParam } from "@/lib/server/validate";

// POST /api/v1/channels/{id}/messages/{message.id}/ack: marca como lido até essa mensagem
export const POST = route<{ channelId: string; messageId: string }>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const p = await params;
  const channelId = idParam(p.channelId, Errors.unknownChannel);
  const messageId = idParam(p.messageId, Errors.unknownMessage);
  await loadChannelContext(channelId, user.id);

  const current = await db.readState.findUnique({ where: { userId_channelId: { userId: user.id, channelId } } });
  const state = await db.readState.upsert({
    where: { userId_channelId: { userId: user.id, channelId } },
    create: { userId: user.id, channelId, lastMessageId: messageId },
    update: {
      mentionCount: 0,
      ...(!current || messageId > current.lastMessageId ? { lastMessageId: messageId } : {}),
    },
  });

  // sincroniza as outras abas/dispositivos do mesmo usuário
  await dispatchToUsers("MESSAGE_ACK", serializeReadState(state), [user.id]);
  return json(serializeReadState(state));
});
