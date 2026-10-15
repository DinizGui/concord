import { Errors, json, route } from "@/lib/server/http";
import { createThread } from "@/lib/server/threads";
import { idParam } from "@/lib/server/validate";

// POST /api/v1/channels/{id}/messages/{message.id}/threads { name }  → thread a partir da mensagem
export const POST = route<{ channelId: string; messageId: string }>(async (req, { params }) => {
  const p = await params;
  const channelId = idParam(p.channelId, Errors.unknownChannel);
  const messageId = idParam(p.messageId, Errors.unknownMessage);
  return json(await createThread(req, channelId, messageId), 201);
});
