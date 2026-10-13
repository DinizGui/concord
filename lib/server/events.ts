import type { Prisma } from "@prisma/client";
import { db } from "./db";

// Grava eventos na fila do gateway. O gateway (SSE) lê essa tabela e entrega a quem tem acesso.

type Scope = { guildId?: bigint | null; channelId?: bigint | null };

const asJson = (data: object) => data as Prisma.InputJsonObject;

// Para todos os membros da guild (ou destinatários da DM quando só tem channelId)
export async function dispatch(type: string, data: object, scope: Scope = {}) {
  await db.gatewayEvent.create({
    data: { type, data: asJson(data), guildId: scope.guildId ?? null, channelId: scope.channelId ?? null },
  });
}

// Para usuários específicos (uma linha por usuário)
export async function dispatchToUsers(
  type: string,
  data: object | ((userId: bigint) => object),
  userIds: bigint[],
  scope: Scope = {},
) {
  const unique = [...new Set(userIds.map(String))].map((id) => BigInt(id));
  if (!unique.length) return;
  await db.gatewayEvent.createMany({
    data: unique.map((userId) => ({
      type,
      data: asJson(typeof data === "function" ? data(userId) : data),
      targetUserId: userId,
      guildId: scope.guildId ?? null,
      channelId: scope.channelId ?? null,
    })),
  });
}
