import { Errors, json, route } from "@/lib/server/http";
import { createThread } from "@/lib/server/threads";
import { idParam } from "@/lib/server/validate";

// POST /api/v1/channels/{id}/threads { name }  → thread solta no canal
export const POST = route<{ channelId: string }>(async (req, { params }) => {
  const channelId = idParam((await params).channelId, Errors.unknownChannel);
  return json(await createThread(req, channelId, null), 201);
});
