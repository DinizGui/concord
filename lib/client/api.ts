// Chamadas à API do próprio app. Autenticação vai pelo cookie httpOnly (mesma origem).

export class ClientError extends Error {
  constructor(
    public status: number,
    public code: number,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

const CODE_PT: Record<number, string> = {
  0: "Algo deu errado. Tenta de novo.",
  10003: "Esse canal não existe mais.",
  10004: "Esse servidor não existe mais.",
  10006: "Convite inválido ou vencido.",
  10013: "Não achei esse usuário.",
  20016: "Calma! Esse canal está no modo lento.",
  40007: "Você está banido desse servidor.",
  50001: "Você não tem acesso a isso.",
  50006: "Não dá pra mandar mensagem vazia.",
  50007: "Não dá pra mandar mensagem pra essa pessoa.",
  50013: "Você não tem permissão pra isso.",
  80000: "Essa pessoa não aceita pedidos de amizade.",
  30001: "Você chegou no limite de servidores.",
  429: "Muitas tentativas. Espera um pouco.",
};

const FIELD_PT: Record<string, string> = {
  USERNAME_ALREADY_TAKEN: "Esse nome de usuário já tem dono.",
  EMAIL_ALREADY_REGISTERED: "Esse e-mail já tem conta.",
  INVALID_LOGIN: "Login ou senha não batem.",
  STRING_TYPE_REGEX: "Formato inválido.",
  BASE_TYPE_BAD_LENGTH: "Tamanho inválido.",
  BASE_TYPE_REQUIRED: "Obrigatório.",
  EMAIL_TYPE_INVALID_EMAIL: "E-mail inválido.",
  PASSWORD_DOES_NOT_MATCH: "Senha errada.",
  INVALID_TOKEN: "Link inválido ou vencido.",
};

type Body = Record<string, unknown> | unknown[] | FormData | undefined;

export async function api<T = unknown>(path: string, init: { method?: string; body?: Body } = {}): Promise<T> {
  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
  const res = await fetch(`/api/v1${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: init.body && !isForm ? { "content-type": "application/json" } : undefined,
    body: init.body ? (isForm ? (init.body as FormData) : JSON.stringify(init.body)) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const fields: Record<string, string> = {};
    const errors = (data?.errors ?? {}) as Record<string, { _errors?: { code: string; message: string }[] }>;
    for (const [key, val] of Object.entries(errors)) {
      const first = val?._errors?.[0];
      if (first) fields[key] = FIELD_PT[first.code] ?? first.message;
    }
    const code = typeof data?.code === "number" ? data.code : 0;
    const msg =
      Object.values(fields)[0] ??
      (res.status === 429 ? CODE_PT[429] : CODE_PT[code] ?? (res.status === 401 ? "Sua sessão acabou. Entra de novo." : CODE_PT[0]));
    throw new ClientError(res.status, code, msg, fields);
  }
  return data as T;
}

export const encodeEmoji = (e: string) => encodeURIComponent(e);
