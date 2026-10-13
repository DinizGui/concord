"use client";

import { useEffect, useRef, useState } from "react";
import { DMS, SERVERS, USERS, seedDm, seedMessages, type Message } from "@/lib/data";
import { ServerRail } from "./ServerRail";
import { ChannelSidebar, DmSidebar } from "./Sidebars";
import { ChatView } from "./ChatView";
import { FriendsView } from "./FriendsView";
import { MemberList } from "./MemberList";

type HomeView = { kind: "friends" } | { kind: "dm"; userId: string };

const REPLIES = ["Boa!", "Fechado.", "kkkkk verdade", "Pode deixar.", "Vou ver aqui e já te falo.", "Concordo 100%."];

function now() {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function ConcordApp({ embedded = false }: { embedded?: boolean }) {
  const [active, setActive] = useState<string>("estudio");
  const [channelBy, setChannelBy] = useState<Record<string, string>>({});
  const [home, setHome] = useState<HomeView>({ kind: "friends" });
  const [store, setStore] = useState<Record<string, Message[]>>({});
  const [typing, setTyping] = useState<Record<string, string | null>>({});
  const [membersOpen, setMembersOpen] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const server = SERVERS.find((s) => s.id === active);
  const channels = server?.categories.flatMap((c) => c.channels) ?? [];
  const channelId = server ? (channelBy[server.id] ?? (channels.find((c) => c.id === "geral") ?? channels.find((c) => c.kind !== "voice")!).id) : "";
  const channel = channels.find((c) => c.id === channelId);

  const key = server ? `${server.id}/${channelId}` : home.kind === "dm" ? `dm/${home.userId}` : null;
  const messages = key ? (store[key] ?? (server ? seedMessages(server.id, channelId) : home.kind === "dm" ? seedDm(home.userId) : [])) : [];

  function push(k: string, base: Message[], m: Message) {
    setStore((s) => ({ ...s, [k]: [...(s[k] ?? base), m] }));
  }

  function send(text: string, replyTo?: string) {
    if (!key) return;
    const base = messages;
    push(key, base, { id: `new-${Date.now()}`, authorId: "me", time: now(), text, replyTo });

    // alguém responde depois de um tempinho
    const responder =
      home.kind === "dm" && !server
        ? home.userId
        : (server?.roles.flatMap((r) => r.members).filter((id) => id !== "me" && USERS[id].status === "online" && USERS[id].role !== "bot") ?? [])[
            Math.floor(Math.random() * 3)
          ];
    if (!responder) return;
    const k = key;
    timers.current.push(
      setTimeout(() => setTyping((t) => ({ ...t, [k]: responder })), 700),
      setTimeout(() => {
        setTyping((t) => ({ ...t, [k]: null }));
        push(k, base, {
          id: `new-${Date.now()}-r`,
          authorId: responder,
          time: now(),
          text: REPLIES[Math.floor(Math.random() * REPLIES.length)],
        });
      }, 2400),
    );
  }

  function react(messageId: string, emoji: string) {
    if (!key) return;
    const next = messages.map((m) => {
      if (m.id !== messageId) return m;
      const rs = [...(m.reactions ?? [])];
      const i = rs.findIndex((r) => r.emoji === emoji);
      if (i === -1) rs.push({ emoji, count: 1, mine: true });
      else if (rs[i].mine) rs[i] = { ...rs[i], count: rs[i].count - 1, mine: false };
      else rs[i] = { ...rs[i], count: rs[i].count + 1, mine: true };
      return { ...m, reactions: rs.filter((r) => r.count > 0) };
    });
    setStore((s) => ({ ...s, [key]: next }));
  }

  const sidebar = server ? (
    <ChannelSidebar
      server={server}
      channelId={channelId}
      onSelect={(id) => {
        setChannelBy((c) => ({ ...c, [server.id]: id }));
        setDrawer(false);
      }}
    />
  ) : (
    <DmSidebar
      view={home}
      onFriends={() => {
        setHome({ kind: "friends" });
        setDrawer(false);
      }}
      onDm={(userId) => {
        setHome({ kind: "dm", userId });
        setDrawer(false);
      }}
    />
  );

  return (
    <div className={`flex overflow-hidden bg-ink text-ink ${embedded ? "h-full" : "h-dvh"}`}>
      {/* trilho + barra lateral: fixos no desktop, gaveta no celular */}
      <div
        className={`fixed inset-y-0 left-0 z-40 flex transition-transform duration-300 md:static md:translate-x-0 ${
          drawer ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <ServerRail
          servers={SERVERS}
          active={active}
          onSelect={(id) => {
            setActive(id);
            if (id === "home" && home.kind === "dm" && !DMS.some((d) => d.userId === home.userId)) setHome({ kind: "friends" });
          }}
        />
        <div className="flex md:rounded-tl-xl md:overflow-hidden">{sidebar}</div>
      </div>
      {drawer && <button aria-label="Fechar menu" className="fixed inset-0 z-30 bg-ink/50 md:hidden" onClick={() => setDrawer(false)} />}

      <main className="flex min-w-0 flex-1">
        {server && channel ? (
          <>
            <ChatView
              key={key ?? ""}
              kind="channel"
              title={channel.name}
              topic={channel.topic}
              channelKind={channel.kind === "announce" ? "announce" : "text"}
              messages={messages}
              typing={key ? (typing[key] ?? null) : null}
              membersOpen={membersOpen}
              onToggleMembers={() => setMembersOpen((v) => !v)}
              onSend={send}
              onReact={react}
              onMenu={() => setDrawer(true)}
            />
            {membersOpen && <MemberList server={server} />}
          </>
        ) : home.kind === "dm" ? (
          <ChatView
            key={key ?? ""}
            kind="dm"
            title={USERS[home.userId].name}
            dmUserId={home.userId}
            messages={messages}
            typing={key ? (typing[key] ?? null) : null}
            onSend={send}
            onReact={react}
            onMenu={() => setDrawer(true)}
          />
        ) : (
          <FriendsView
            onMenu={() => setDrawer(true)}
            onDm={(userId) => {
              setHome({ kind: "dm", userId });
            }}
          />
        )}
      </main>
    </div>
  );
}
