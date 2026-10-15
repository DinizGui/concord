"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import { api } from "./api";
import type {
  ApiChannel,
  ApiGuild,
  ApiMember,
  ApiMessage,
  ApiReadState,
  ApiRelationship,
  ApiUser,
  ApiVoiceState,
  Ready,
  Status,
} from "./types";

type MessageList = { items: ApiMessage[]; loaded: boolean; hasMore: boolean };

export type State = {
  conn: "connecting" | "ready" | "reconnecting";
  me: ApiUser | null;
  myStatus: Status;
  guilds: Record<string, ApiGuild>;
  guildOrder: string[];
  dms: Record<string, ApiChannel>;
  relationships: Record<string, ApiRelationship>;
  readState: Record<string, ApiReadState>;
  presences: Record<string, { status: Status; custom_status: string | null }>;
  users: Record<string, ApiUser>;
  messages: Record<string, MessageList>;
  members: Record<string, Record<string, ApiMember>>;
  typing: Record<string, Record<string, number>>;
};

type Action =
  | { type: "READY"; d: Ready }
  | { type: "CONN"; conn: State["conn"] }
  | { type: "EVENT"; t: string; d: Record<string, unknown> }
  | { type: "MESSAGES"; channelId: string; items: ApiMessage[]; older: boolean; hasMore: boolean }
  | { type: "PENDING"; message: ApiMessage }
  | { type: "FAILED"; channelId: string; nonce: string }
  | { type: "MEMBERS"; guildId: string; members: ApiMember[] }
  | { type: "TYPING_SWEEP" }
  | { type: "MY_STATUS"; status: Status }
  | { type: "UPSERT_DM"; channel: ApiChannel }
  | { type: "UPSERT_GUILD"; guild: ApiGuild };

const initial: State = {
  conn: "connecting",
  me: null,
  myStatus: "online",
  guilds: {},
  guildOrder: [],
  dms: {},
  relationships: {},
  readState: {},
  presences: {},
  users: {},
  messages: {},
  members: {},
  typing: {},
};

const byId = <T extends { id: string }>(list: T[]) => Object.fromEntries(list.map((x) => [x.id, x]));
const cmpId = (a: string, b: string) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0);

function rememberUsers(users: State["users"], list: (ApiUser | undefined | null)[]) {
  let next = users;
  for (const u of list) {
    if (!u?.id) continue;
    if (next === users) next = { ...users };
    next[u.id] = { ...next[u.id], ...u };
  }
  return next;
}

function patchGuild(s: State, guildId: string | undefined, fn: (g: ApiGuild) => ApiGuild): State {
  if (!guildId || !s.guilds[guildId]) return s;
  return { ...s, guilds: { ...s.guilds, [guildId]: fn(s.guilds[guildId]) } };
}

function patchMessages(s: State, channelId: string, fn: (items: ApiMessage[]) => ApiMessage[]): State {
  const list = s.messages[channelId];
  if (!list) return s;
  return { ...s, messages: { ...s.messages, [channelId]: { ...list, items: fn(list.items) } } };
}

function patchChannelLast(s: State, channelId: string, messageId: string): State {
  if (s.dms[channelId]) return { ...s, dms: { ...s.dms, [channelId]: { ...s.dms[channelId], last_message_id: messageId } } };
  for (const g of Object.values(s.guilds)) {
    if (g.channels.some((c) => c.id === channelId)) {
      return patchGuild(s, g.id, (gg) => ({
        ...gg,
        channels: gg.channels.map((c) => (c.id === channelId ? { ...c, last_message_id: messageId } : c)),
      }));
    }
  }
  return s;
}

function setVoice(g: ApiGuild, vs: ApiVoiceState): ApiGuild {
  const rest = g.voice_states.filter((v) => v.user_id !== vs.user_id);
  return { ...g, voice_states: vs.channel_id ? [...rest, vs] : rest };
}

function onEvent(s: State, t: string, d: Record<string, unknown>): State {
  const me = s.me?.id;
  switch (t) {
    case "MESSAGE_CREATE": {
      const m = d as unknown as ApiMessage;
      let next: State = { ...s, users: rememberUsers(s.users, [m.author, ...(m.mentions ?? [])]) };
      next = patchChannelLast(next, m.channel_id, m.id);
      // mensagem numa thread: sobe o contador (no canal e no chip da mensagem de origem)
      const thread = m.guild_id ? next.guilds[m.guild_id]?.channels.find((c) => c.id === m.channel_id && c.type === 11) : undefined;
      if (thread && m.guild_id) {
        const count = (thread.message_count ?? 0) + 1;
        next = patchGuild(next, m.guild_id, (g) => ({
          ...g,
          channels: g.channels.map((c) => (c.id === thread.id ? { ...c, message_count: count } : c)),
        }));
        if (thread.parent_id) {
          next = patchMessages(next, thread.parent_id, (items) =>
            items.map((x) => (x.id === thread.id && x.thread ? { ...x, thread: { ...x.thread, message_count: count } } : x)),
          );
        }
      }
      const list = next.messages[m.channel_id];
      if (list) {
        const items = list.items.filter((x) => x.id !== m.id && !(m.nonce && x.nonce === m.nonce));
        next = { ...next, messages: { ...next.messages, [m.channel_id]: { ...list, items: [...items, m] } } };
      }
      // quem mandou mensagem parou de digitar
      if (next.typing[m.channel_id]?.[m.author.id]) {
        const rest = { ...next.typing[m.channel_id] };
        delete rest[m.author.id];
        next = { ...next, typing: { ...next.typing, [m.channel_id]: rest } };
      }
      if (m.author.id === me) {
        next = { ...next, readState: { ...next.readState, [m.channel_id]: { id: m.channel_id, last_message_id: m.id, mention_count: 0 } } };
      } else {
        const mentioned =
          !m.guild_id || m.mention_everyone || m.mentions?.some((u) => u.id === me);
        if (mentioned) {
          const rs = next.readState[m.channel_id] ?? { id: m.channel_id, last_message_id: null, mention_count: 0 };
          next = { ...next, readState: { ...next.readState, [m.channel_id]: { ...rs, mention_count: rs.mention_count + 1 } } };
        }
      }
      return next;
    }
    case "MESSAGE_UPDATE": {
      const m = d as unknown as ApiMessage;
      return patchMessages(s, m.channel_id, (items) =>
        items.map((x) => (x.id === m.id ? { ...x, ...m, reactions: x.reactions } : x)),
      );
    }
    case "MESSAGE_DELETE":
      return patchMessages(s, d.channel_id as string, (items) => items.filter((x) => x.id !== d.id));
    case "MESSAGE_DELETE_BULK": {
      const ids = new Set(d.ids as string[]);
      return patchMessages(s, d.channel_id as string, (items) => items.filter((x) => !ids.has(x.id)));
    }
    case "MESSAGE_REACTION_ADD":
    case "MESSAGE_REACTION_REMOVE": {
      const add = t === "MESSAGE_REACTION_ADD";
      const name = (d.emoji as { name: string }).name;
      const mine = d.user_id === me;
      return patchMessages(s, d.channel_id as string, (items) =>
        items.map((x) => {
          if (x.id !== d.message_id) return x;
          const rs = [...x.reactions];
          const i = rs.findIndex((r) => r.emoji.name === name);
          if (add) {
            if (i === -1) rs.push({ emoji: { id: null, name }, count: 1, me: mine });
            else rs[i] = { ...rs[i], count: rs[i].count + 1, me: rs[i].me || mine };
          } else if (i !== -1) {
            rs[i] = { ...rs[i], count: rs[i].count - 1, me: mine ? false : rs[i].me };
          }
          return { ...x, reactions: rs.filter((r) => r.count > 0) };
        }),
      );
    }
    case "MESSAGE_REACTION_REMOVE_ALL":
      return patchMessages(s, d.channel_id as string, (items) =>
        items.map((x) => (x.id === d.message_id ? { ...x, reactions: [] } : x)),
      );
    case "MESSAGE_REACTION_REMOVE_EMOJI": {
      const name = (d.emoji as { name: string }).name;
      return patchMessages(s, d.channel_id as string, (items) =>
        items.map((x) => (x.id === d.message_id ? { ...x, reactions: x.reactions.filter((r) => r.emoji.name !== name) } : x)),
      );
    }
    case "MESSAGE_ACK":
      return { ...s, readState: { ...s.readState, [d.id as string]: d as unknown as ApiReadState } };
    case "TYPING_START": {
      if (d.user_id === me) return s;
      const ch = d.channel_id as string;
      const member = d.member as ApiMember | undefined;
      return {
        ...s,
        users: rememberUsers(s.users, [member?.user]),
        typing: { ...s.typing, [ch]: { ...s.typing[ch], [d.user_id as string]: Date.now() + 10_000 } },
      };
    }
    case "GUILD_CREATE": {
      const g = d as unknown as ApiGuild;
      return {
        ...s,
        guilds: { ...s.guilds, [g.id]: g },
        guildOrder: s.guildOrder.includes(g.id) ? s.guildOrder : [...s.guildOrder, g.id],
        users: rememberUsers(s.users, g.members.map((m) => m.user)),
      };
    }
    case "GUILD_UPDATE":
      return patchGuild(s, d.id as string, (g) => ({ ...g, ...(d as Partial<ApiGuild>), channels: g.channels, roles: g.roles }));
    case "GUILD_DELETE": {
      const guilds = { ...s.guilds };
      delete guilds[d.id as string];
      return { ...s, guilds, guildOrder: s.guildOrder.filter((id) => id !== d.id) };
    }
    case "CHANNEL_CREATE":
    case "CHANNEL_UPDATE": {
      const c = d as unknown as ApiChannel;
      if (!c.guild_id) {
        return { ...s, dms: { ...s.dms, [c.id]: c }, users: rememberUsers(s.users, c.recipients ?? []) };
      }
      let base = s;
      // thread nova a partir de mensagem: mostra o chip na mensagem de origem
      if (t === "CHANNEL_CREATE" && c.type === 11 && c.parent_id) {
        base = patchMessages(base, c.parent_id, (items) =>
          items.map((x) => (x.id === c.id ? { ...x, thread: { id: c.id, name: c.name ?? "", message_count: 0, archived: false } } : x)),
        );
      }
      if (c.type === 11 && c.thread_metadata?.archived) {
        return patchGuild(base, c.guild_id, (g) => ({ ...g, channels: g.channels.filter((x) => x.id !== c.id) }));
      }
      return patchGuild(base, c.guild_id, (g) => ({
        ...g,
        channels: g.channels.some((x) => x.id === c.id) ? g.channels.map((x) => (x.id === c.id ? c : x)) : [...g.channels, c],
      }));
    }
    case "CHANNEL_DELETE": {
      const c = d as unknown as ApiChannel;
      if (!c.guild_id) {
        const dms = { ...s.dms };
        delete dms[c.id];
        return { ...s, dms };
      }
      return patchGuild(s, c.guild_id, (g) => ({ ...g, channels: g.channels.filter((x) => x.id !== c.id) }));
    }
    case "GUILD_ROLE_CREATE":
    case "GUILD_ROLE_UPDATE": {
      const role = d.role as ApiGuild["roles"][number];
      return patchGuild(s, d.guild_id as string, (g) => ({
        ...g,
        roles: g.roles.some((r) => r.id === role.id) ? g.roles.map((r) => (r.id === role.id ? role : r)) : [...g.roles, role],
      }));
    }
    case "GUILD_EMOJIS_UPDATE":
      return patchGuild(s, d.guild_id as string, (g) => ({ ...g, emojis: d.emojis as ApiGuild["emojis"] }));
    case "GUILD_ROLE_DELETE":
      return patchGuild(s, d.guild_id as string, (g) => ({ ...g, roles: g.roles.filter((r) => r.id !== d.role_id) }));
    case "GUILD_MEMBER_ADD":
    case "GUILD_MEMBER_UPDATE": {
      const m = d as unknown as ApiMember & { guild_id: string };
      const gid = m.guild_id;
      const users = rememberUsers(s.users, [m.user]);
      const list = s.members[gid];
      let next: State = { ...s, users };
      if (t === "GUILD_MEMBER_ADD") next = patchGuild(next, gid, (g) => ({ ...g, member_count: g.member_count + 1 }));
      if (!list || !m.user) return next;
      return { ...next, members: { ...next.members, [gid]: { ...list, [m.user.id]: { ...list[m.user.id], ...m } } } };
    }
    case "GUILD_MEMBER_REMOVE": {
      const gid = d.guild_id as string;
      const uid = (d.user as ApiUser).id;
      let next = patchGuild(s, gid, (g) => ({ ...g, member_count: Math.max(0, g.member_count - 1) }));
      if (next.members[gid]) {
        const list = { ...next.members[gid] };
        delete list[uid];
        next = { ...next, members: { ...next.members, [gid]: list } };
      }
      return next;
    }
    case "VOICE_STATE_UPDATE": {
      const vs = d as unknown as ApiVoiceState;
      return patchGuild(s, vs.guild_id, (g) => setVoice(g, vs));
    }
    case "PRESENCE_UPDATE": {
      const uid = (d.user as { id: string }).id;
      if (uid === me) return { ...s, myStatus: d.status as Status };
      return { ...s, presences: { ...s.presences, [uid]: { status: d.status as Status, custom_status: (d.custom_status as string) ?? null } } };
    }
    case "RELATIONSHIP_ADD": {
      const r = d as unknown as ApiRelationship;
      return { ...s, relationships: { ...s.relationships, [r.id]: r }, users: rememberUsers(s.users, [r.user]) };
    }
    case "RELATIONSHIP_REMOVE": {
      const rel = { ...s.relationships };
      delete rel[d.id as string];
      return { ...s, relationships: rel };
    }
    case "USER_UPDATE":
      return { ...s, me: { ...s.me!, ...(d as unknown as ApiUser) }, users: rememberUsers(s.users, [d as unknown as ApiUser]) };
    default:
      return s;
  }
}

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "READY": {
      const d = a.d;
      const users = rememberUsers({}, [
        d.user,
        ...d.relationships.map((r) => r.user),
        ...d.private_channels.flatMap((c) => c.recipients ?? []),
        ...d.guilds.flatMap((g) => g.members.map((m) => m.user)),
      ]);
      return {
        ...s,
        conn: "ready",
        me: d.user,
        guilds: byId(d.guilds),
        guildOrder: d.guilds.map((g) => g.id),
        dms: byId(d.private_channels),
        relationships: byId(d.relationships),
        readState: byId(d.read_state),
        presences: Object.fromEntries(d.presences.map((p) => [p.user.id, { status: p.status, custom_status: p.custom_status }])),
        users,
        // um READY novo invalida o que estava em memória
        messages: {},
        members: {},
        typing: {},
      };
    }
    case "CONN":
      return { ...s, conn: a.conn };
    case "EVENT":
      return onEvent(s, a.t, a.d);
    case "MESSAGES": {
      const prev = s.messages[a.channelId];
      const incoming = [...a.items].sort((x, y) => cmpId(x.id, y.id));
      const keep = a.older && prev ? prev.items : (prev?.items ?? []).filter((m) => m.pending || m.failed);
      const ids = new Set(incoming.map((m) => m.id));
      const merged = a.older ? [...incoming, ...keep.filter((m) => !ids.has(m.id))] : [...incoming, ...keep];
      return {
        ...s,
        users: rememberUsers(s.users, a.items.map((m) => m.author)),
        messages: { ...s.messages, [a.channelId]: { items: merged, loaded: true, hasMore: a.hasMore } },
      };
    }
    case "PENDING": {
      const list = s.messages[a.message.channel_id] ?? { items: [], loaded: true, hasMore: false };
      return { ...s, messages: { ...s.messages, [a.message.channel_id]: { ...list, items: [...list.items, a.message] } } };
    }
    case "FAILED":
      return patchMessages(s, a.channelId, (items) =>
        items.map((m) => (m.nonce === a.nonce && m.pending ? { ...m, pending: false, failed: true } : m)),
      );
    case "MEMBERS":
      return {
        ...s,
        users: rememberUsers(s.users, a.members.map((m) => m.user)),
        members: { ...s.members, [a.guildId]: Object.fromEntries(a.members.filter((m) => m.user).map((m) => [m.user!.id, m])) },
      };
    case "TYPING_SWEEP": {
      const now = Date.now();
      let changed = false;
      const typing: State["typing"] = {};
      for (const [ch, users] of Object.entries(s.typing)) {
        const alive = Object.fromEntries(Object.entries(users).filter(([, exp]) => exp > now));
        if (Object.keys(alive).length !== Object.keys(users).length) changed = true;
        typing[ch] = alive;
      }
      return changed ? { ...s, typing } : s;
    }
    case "MY_STATUS":
      return { ...s, myStatus: a.status };
    case "UPSERT_DM":
      return { ...s, dms: { ...s.dms, [a.channel.id]: a.channel }, users: rememberUsers(s.users, a.channel.recipients ?? []) };
    case "UPSERT_GUILD":
      return onEvent(s, "GUILD_CREATE", a.guild as unknown as Record<string, unknown>);
  }
}

type Ctx = {
  state: State;
  dispatch: React.Dispatch<Action>;
  loadMessages: (channelId: string, older?: boolean) => Promise<void>;
  loadMembers: (guildId: string) => Promise<void>;
  gatewaySend: (op: number, d: Record<string, unknown>) => Promise<unknown>;
};

const StoreContext = createContext<Ctx | null>(null);

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore fora do StoreProvider");
  return ctx;
}

// Conexão com o gateway (SSE). O EventSource reconecta sozinho mandando Last-Event-ID,
// então RECONNECT e quedas de rede retomam do último evento sem novo READY.
export function StoreProvider({ children, onUnauthorized }: { children: React.ReactNode; onUnauthorized: () => void }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const loading = useRef(new Set<string>());
  const unauthorized = useRef(onUnauthorized);

  useEffect(() => {
    unauthorized.current = onUnauthorized;
  }, [onUnauthorized]);

  useEffect(() => {
    let es: EventSource | null = null;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const open = async () => {
      // confere a sessão antes: o EventSource não mostra o status 401
      try {
        await api("/users/@me");
      } catch (err) {
        if ((err as { status?: number }).status === 401) return unauthorized.current();
        retry = setTimeout(open, 3000);
        return;
      }
      if (stopped) return;
      es = new EventSource("/api/v1/gateway/connect");
      es.onmessage = (ev) => {
        const msg = JSON.parse(ev.data) as { op: number; t: string | null; d: unknown };
        if (msg.op === 0 && msg.t === "READY") dispatch({ type: "READY", d: msg.d as Ready });
        else if (msg.op === 0 && msg.t === "RESUMED") dispatch({ type: "CONN", conn: "ready" });
        else if (msg.op === 0 && msg.t) dispatch({ type: "EVENT", t: msg.t, d: msg.d as Record<string, unknown> });
        else if (msg.op === 9) {
          // não dá pra retomar: conexão nova, sem Last-Event-ID
          es?.close();
          dispatch({ type: "CONN", conn: "reconnecting" });
          retry = setTimeout(open, 500);
        }
      };
      es.onerror = () => {
        dispatch({ type: "CONN", conn: "reconnecting" });
        if (es?.readyState === EventSource.CLOSED) {
          retry = setTimeout(open, 2000);
        }
      };
    };
    open();

    const sweep = setInterval(() => dispatch({ type: "TYPING_SWEEP" }), 2000);
    return () => {
      stopped = true;
      es?.close();
      clearTimeout(retry);
      clearInterval(sweep);
    };
  }, []);

  const loadMessages = useCallback(async (channelId: string, older = false) => {
    const key = `${channelId}:${older}`;
    if (loading.current.has(key)) return;
    loading.current.add(key);
    try {
      const first = older ? stateRef.current.messages[channelId]?.items.find((m) => !m.pending && !m.failed) : undefined;
      const items = await api<ApiMessage[]>(`/channels/${channelId}/messages?limit=50${first ? `&before=${first.id}` : ""}`);
      dispatch({ type: "MESSAGES", channelId, items, older, hasMore: items.length === 50 });
    } finally {
      loading.current.delete(key);
    }
  }, []);

  const loadMembers = useCallback(async (guildId: string) => {
    if (loading.current.has(`m:${guildId}`)) return;
    loading.current.add(`m:${guildId}`);
    try {
      const members = await api<ApiMember[]>(`/guilds/${guildId}/members?limit=1000`);
      dispatch({ type: "MEMBERS", guildId, members });
    } finally {
      loading.current.delete(`m:${guildId}`);
    }
  }, []);

  const gatewaySend = useCallback((op: number, d: Record<string, unknown>) => api("/gateway", { body: { op, d } }), []);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const value = useMemo(
    () => ({ state, dispatch, loadMessages, loadMembers, gatewaySend }),
    [state, loadMessages, loadMembers, gatewaySend],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

// ---- seletores ----

export function displayName(u: ApiUser | undefined | null) {
  return u?.global_name || u?.username || "alguém";
}

export function statusOf(s: State, userId: string): Status {
  if (userId === s.me?.id) return s.myStatus === "invisible" ? "offline" : s.myStatus;
  return s.presences[userId]?.status ?? "offline";
}

export function isUnread(s: State, channel: ApiChannel) {
  if (!channel.last_message_id) return false;
  const rs = s.readState[channel.id];
  if (!rs?.last_message_id) return true;
  return cmpId(channel.last_message_id, rs.last_message_id) > 0;
}

export function mentionCount(s: State, channelId: string) {
  return s.readState[channelId]?.mention_count ?? 0;
}

export function dmName(s: State, c: ApiChannel) {
  if (c.name) return c.name;
  const others = (c.recipients ?? []).map((u) => displayName(s.users[u.id] ?? u));
  return others.join(", ") || "Só você";
}
