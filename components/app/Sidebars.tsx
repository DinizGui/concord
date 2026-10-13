"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Hash, Megaphone, Plus, Search, Settings, UserPlus, Users, Volume2, X } from "lucide-react";
import { DMS, USERS, type Server } from "@/lib/data";
import { Avatar } from "./Avatar";
import { UserPanel } from "./UserPanel";

const shell = "flex w-60 shrink-0 flex-col bg-paper-2";

export function ChannelSidebar({
  server,
  channelId,
  onSelect,
}: {
  server: Server;
  channelId: string;
  onSelect: (id: string) => void;
}) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [voice, setVoice] = useState<string | null>(null);

  return (
    <aside className={shell}>
      <button className="flex h-12 shrink-0 items-center justify-between border-b border-ink/15 px-4 font-display text-[15px] font-bold hover:bg-paper-3/60">
        <span className="truncate">{server.name}</span>
        <ChevronDown size={18} />
      </button>

      <div className="scroll-thin flex-1 overflow-y-auto px-2 pb-3 pt-2">
        <button className="mb-2 flex w-full items-center gap-2 rounded-md border border-dashed border-ink/30 px-2 py-2 text-left text-xs text-muted hover:border-ink hover:text-ink">
          <UserPlus size={15} />
          Chamar a galera pro servidor
        </button>

        {server.categories.map((cat) => {
          const isClosed = closed[cat.id];
          return (
            <div key={cat.id} className="mt-3">
              <div className="group flex items-center justify-between px-1">
                <button
                  onClick={() => setClosed((c) => ({ ...c, [cat.id]: !c[cat.id] }))}
                  className="flex items-center gap-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-ink"
                >
                  <ChevronDown size={12} className={`transition-transform ${isClosed ? "-rotate-90" : ""}`} />
                  {cat.name}
                </button>
                <Plus size={15} className="text-muted opacity-0 group-hover:opacity-100" />
              </div>

              <ul className="mt-1 space-y-px">
                {cat.channels
                  .filter((ch) => !isClosed || ch.id === channelId)
                  .map((ch) => {
                    const isActive = ch.kind !== "voice" && ch.id === channelId;
                    const Icon = ch.kind === "voice" ? Volume2 : ch.kind === "announce" ? Megaphone : Hash;
                    const people = [...(ch.inVoice ?? []), ...(voice === ch.id ? ["me"] : [])];
                    return (
                      <li key={ch.id}>
                        <button
                          onClick={() => (ch.kind === "voice" ? setVoice((v) => (v === ch.id ? null : ch.id)) : onSelect(ch.id))}
                          className={`group relative flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[15px] ${
                            isActive
                              ? "bg-paper-3 font-semibold text-ink"
                              : ch.unread
                                ? "font-semibold text-ink hover:bg-paper-3/60"
                                : "text-muted hover:bg-paper-3/60 hover:text-ink"
                          }`}
                        >
                          {ch.unread && !isActive && <span className="absolute -left-2 h-2 w-1 rounded-r bg-ink" />}
                          <Icon size={18} className="shrink-0 opacity-70" />
                          <span className="truncate">{ch.name}</span>
                          {!!ch.mentions && !isActive && (
                            <span className="ml-auto rounded-full bg-signal px-1.5 font-mono text-[11px] font-bold text-sheet">
                              {ch.mentions}
                            </span>
                          )}
                          {isActive && <Settings size={14} className="ml-auto text-muted" />}
                        </button>
                        {people.length > 0 && (
                          <ul className="mb-1 ml-7 space-y-0.5">
                            {people.map((uid) => (
                              <li key={uid} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm text-muted">
                                <Avatar user={USERS[uid]} size={22} />
                                <span className="truncate">{USERS[uid].name}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
              </ul>
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {voice && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-ink/15 bg-paper-3/40"
          >
            <div className="flex items-center justify-between px-3 py-2">
              <span className="leading-tight">
                <span className="block text-sm font-bold text-online">Voz conectada</span>
                <span className="block text-xs text-muted">
                  {server.categories.flatMap((c) => c.channels).find((c) => c.id === voice)?.name} / {server.name}
                </span>
              </span>
              <button
                aria-label="Desconectar"
                onClick={() => setVoice(null)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-paper-3 hover:text-dnd"
              >
                <X size={18} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <UserPanel />
    </aside>
  );
}

export function DmSidebar({
  view,
  onFriends,
  onDm,
}: {
  view: { kind: "friends" } | { kind: "dm"; userId: string };
  onFriends: () => void;
  onDm: (userId: string) => void;
}) {
  return (
    <aside className={shell}>
      <div className="flex h-12 shrink-0 items-center border-b border-ink/15 px-2.5">
        <button className="flex w-full items-center gap-2 rounded-md bg-paper-3 px-2 py-1.5 text-left text-sm text-muted">
          <Search size={14} />
          Achar ou começar conversa
        </button>
      </div>
      <div className="scroll-thin flex-1 overflow-y-auto px-2 pt-2">
        <button
          onClick={onFriends}
          className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-[15px] font-semibold ${
            view.kind === "friends" ? "bg-paper-3 text-ink" : "text-muted hover:bg-paper-3/60 hover:text-ink"
          }`}
        >
          <Users size={20} />
          Amigos
          <span className="ml-auto rounded-full bg-signal px-1.5 font-mono text-[11px] font-bold text-sheet">1</span>
        </button>

        <div className="mt-4 flex items-center justify-between px-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">
          Mensagens diretas
          <Plus size={15} className="cursor-pointer hover:text-ink" />
        </div>
        <ul className="mt-1 space-y-px">
          {DMS.map((dm) => {
            const u = USERS[dm.userId];
            const active = view.kind === "dm" && view.userId === dm.userId;
            return (
              <li key={dm.userId}>
                <button
                  onClick={() => onDm(dm.userId)}
                  className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left ${
                    active ? "bg-paper-3" : "hover:bg-paper-3/60"
                  }`}
                >
                  <Avatar user={u} size={32} showStatus ring={active ? "border-paper-3" : "border-paper-2"} />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className={`block truncate text-[15px] ${dm.unread || active ? "font-semibold text-ink" : "text-ink-3"}`}>
                      {u.name}
                    </span>
                    <span className="block truncate text-xs text-muted">{dm.preview}</span>
                  </span>
                  {!!dm.unread && (
                    <span className="rounded-full bg-signal px-1.5 font-mono text-[11px] font-bold text-sheet">{dm.unread}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <UserPanel />
    </aside>
  );
}
