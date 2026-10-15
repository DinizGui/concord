import { randomBytes } from "node:crypto";
import { requireAuth } from "@/lib/server/auth";
import { isTextLike, loadChannelContext, requirePermission } from "@/lib/server/access";
import { db } from "@/lib/server/db";
import { ApiError, Errors, json, route } from "@/lib/server/http";
import { attachmentSelect, serializeAttachment } from "@/lib/server/messages";
import { Permissions } from "@/lib/server/permissions";
import { limit } from "@/lib/server/ratelimit";
import { snowflake } from "@/lib/server/snowflake";
import { imageSize, safeFilename, sniffImageType, storeFile } from "@/lib/server/storage";
import { idParam } from "@/lib/server/validate";

type Params = { channelId: string };

// Abaixo do limite de corpo da Vercel (4,5 MB) com folga para o multipart
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

// POST /api/v1/channels/{id}/attachments  (multipart, campo "file")
// Sobe o arquivo e devolve o anexo; ele só aparece no canal quando for numa mensagem
// (POST /messages com attachments: [{ id }]).
export const POST = route<Params>(async (req, { params }) => {
  const { user } = await requireAuth(req);
  const channelId = idParam((await params).channelId, Errors.unknownChannel);
  const ctx = await loadChannelContext(channelId, user.id);
  if (!isTextLike(ctx.channel.type)) throw Errors.invalidChannelType();
  requirePermission(ctx, Permissions.SEND_MESSAGES, Permissions.ATTACH_FILES);
  await limit("upload", user.id);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") throw Errors.badRequest("Missing file");
  if (file.size === 0) throw Errors.badRequest("Empty file");
  if (file.size > MAX_ATTACHMENT_BYTES) throw new ApiError(413, 40005, "Request entity too large");

  const buf = Buffer.from(await file.arrayBuffer());
  const filename = safeFilename(file.name);
  // imagem: tipo pelo conteúdo; o resto vai como veio (servido sempre como download)
  const image = sniffImageType(buf);
  const contentType = image ?? (file.type || "application/octet-stream").slice(0, 127);
  const size = image ? imageSize(buf) : null;

  const id = snowflake();
  const stored = await storeFile(`attachments/${channelId}/${id}/${filename}`, buf, contentType);
  const attachment = await db.attachment.create({
    data: {
      id,
      channelId,
      uploaderId: user.id,
      filename,
      contentType,
      size: buf.length,
      width: size?.width ?? null,
      height: size?.height ?? null,
      token: randomBytes(12).toString("base64url"),
      url: stored.url,
      data: stored.data ? new Uint8Array(stored.data) : null,
    },
    select: attachmentSelect,
  });
  return json(serializeAttachment(attachment), 201);
});
