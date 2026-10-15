import { createHmac } from "node:crypto";

// Token de acesso do LiveKit (SFU de áudio/vídeo). É um JWT HS256 comum:
// https://docs.livekit.io/home/get-started/authentication/
// Configuração: LIVEKIT_URL (wss://...), LIVEKIT_API_KEY, LIVEKIT_API_SECRET.

export function livekitConfig() {
  const url = process.env.LIVEKIT_URL;
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  return url && key && secret ? { url, key, secret } : null;
}

const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");

export function livekitToken(input: {
  key: string;
  secret: string;
  identity: string;
  name: string;
  room: string;
  canPublish: boolean;
  canPublishVideo: boolean;
  ttlSeconds?: number;
}) {
  const now = Math.floor(Date.now() / 1000);
  const sources = input.canPublish ? ["microphone", ...(input.canPublishVideo ? ["camera", "screen_share", "screen_share_audio"] : [])] : [];
  const header = b64({ alg: "HS256", typ: "JWT" });
  const payload = b64({
    iss: input.key,
    sub: input.identity,
    name: input.name,
    nbf: now - 10,
    exp: now + (input.ttlSeconds ?? 6 * 60 * 60),
    video: {
      room: input.room,
      roomJoin: true,
      canSubscribe: true,
      canPublish: input.canPublish,
      canPublishData: true,
      canPublishSources: sources,
    },
  });
  const signature = createHmac("sha256", input.secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}
