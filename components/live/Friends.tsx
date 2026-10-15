"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Ban, Check, Menu, MessageCircle, Search, UserMinus, Users, X } from "lucide-react";
import { api } from "@/lib/client/api";
import { displayName, statusOf, useStore } from "@/lib/client/store";
import { Rel, type ApiRelationship } from "@/lib/client/types";
import { STATUS_PT, UserAvatar } from "./ui";

const TABS = [
  { id: "online", label: "Online" },
  { id: "all", label: "Todos" },
  { id: "pending", label: "Pendentes" },
  { id: "blocked", label: "Bloqueados" },
] as const;

type Tab = (typeof TABS)[number]["id"] | "add";

export function Friends({ onDm, onMenu }: { onDm: (userId: string) => void; onMenu: () => void }) {
  const { state } = useStore();
  const [tab, setTab] = useState<Tab>("online");
  const [query, setQuery] = useState("");
  const [username, setUsername] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const rels = Object.values(state.relationships);
  const friends = rels.filter((r) => r.type === Rel.FRIEND);
  const pending = rels.filter((r) => r.type === Rel.INCOMING || r.type === Rel.OUTGOING);
  const blocked = rels.filter((r) => r.type === Rel.BLOCKED);
  const incoming = pending.filter((r) => r.type === Rel.INCOMING).length;

  const shown = (tab === "online" ? friends.filter((r) => statusOf(state, r.id) !== "offline") : tab === "all" ? friends : tab === "pending" ? pending : blocked)
    .filter((r) => {
      const u = state.users[r.id] ?? r.user;
      return `${displayName(u)} ${u.username}`.toLowerCase().includes(query.toLowerCase());
    })
    .sort((a, b) => displayName(a.user).localeCompare(displayName(b.user)));

  async function act(path: string, method: "PUT" | "DELETE", body?: Record<string, unknown>) {
    await api(`/users/@me/relationships/${path}`, { method, body }).catch((e) => setMsg({ ok: false, text: e.message }));
  }

  async function sendRequest(e: React.FormEvent) {
    e.preventDefault();
    const name = username.trim().toLowerCase();
    if (!name) return;
    setBusy(true);
    setMsg(null);
    try {
      await api("/users/@me/relationships", { body: { username: name } });
      setMsg({ ok: true, text: `Pedido enviado pra ${name}.` });
      setUsername("");
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const heading =
    tab === "online" ? "Online" : tab === "all" ? "Todos os amigos" : tab === "pending" ? "Pendentes" : "Bloqueados";

  return (
    <section className="flex min-w-0 flex-1 bg-sheet">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-ink/15 px-3">
          <button
            className="flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-paper-2 md:hidden"
            aria-label="Abrir menu"
            onClick={onMenu}
          >
            <Menu size={20} />
          </button>
          <span className="flex items-center gap-2 font-display font-bold">
            <Users size={20} className="text-muted" />
            Amigos
          </span>
          <span className="h-5 w-px bg-ink/20" />
          <nav className="scroll-ink flex items-center gap-1 overflow-x-auto" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`relative whitespace-nowrap rounded-md px-2.5 py-1 text-[15px] font-medium ${
                  tab === t.id ? "text-ink" : "text-muted hover:bg-paper-2 hover:text-ink"
                }`}
              >
                {tab === t.id && (
                  <motion.span
                    layoutId="live-friends-tab"
                    className="absolute inset-0 rounded-md bg-paper-2"
                    transition={{ type: "spring", stiffness: 500, damping: 36 }}
                  />
                )}
                <span className="relative">
                  {t.label}
                  {t.id === "pending" && !!incoming && (
                    <span className="ml-1.5 rounded-full bg-signal px-1.5 font-mono text-[11px] font-bold text-sheet">{incoming}</span>
                  )}
                </span>
              </button>
            ))}
            <button
              onClick={() => setTab("add")}
              className={`whitespace-nowrap rounded-md px-2.5 py-1 text-[15px] font-semibold ${
                tab === "add" ? "text-online" : "bg-online text-sheet hover:bg-online/90"
              }`}
            >
              Adicionar amigo
            </button>
          </nav>
        </header>

        <div className="scroll-thin flex-1 overflow-y-auto px-6 pt-4">
          {tab === "add" ? (
            <div className="max-w-2xl">
              <h2 className="font-display text-xl font-extrabold">Adicionar amigo</h2>
              <p className="mt-1 text-sm text-muted">Digite o nome de usuário da pessoa.</p>
              <form
                onSubmit={sendRequest}
                className="mt-4 flex items-center gap-2 rounded-lg border border-ink bg-paper px-3 py-2 shadow-hard-sm focus-within:shadow-hard"
              >
                <input
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setMsg(null);
                  }}
                  placeholder="nome.de.usuario"
                  className="flex-1 bg-transparent font-mono text-[15px] outline-none placeholder:text-faint"
                />
                <button disabled={!username.trim() || busy} className="rounded-md bg-signal px-3 py-1.5 text-sm font-semibold text-sheet disabled:opacity-40">
                  Enviar pedido
                </button>
              </form>
              {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-online" : "text-dnd"}`}>{msg.text}</p>}
              <p className="mt-6 text-sm text-muted">
                Seu usuário é <b className="font-mono text-ink">{state.me?.username}</b>. Passa pra galera te achar.
              </p>
            </div>
          ) : (
            <>
              <label className="flex items-center gap-2 rounded-md border border-ink/20 bg-paper px-3 py-1.5 focus-within:border-ink">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar"
                  className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
                />
                <Search size={16} className="text-muted" />
              </label>

              <h3 className="mb-2 mt-5 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">
                {heading} · {shown.length}
              </h3>

              {msg && !msg.ok && <p className="mb-2 text-sm text-dnd">{msg.text}</p>}

              {shown.map((r) => (
                <FriendRow key={r.id} r={r} onDm={() => onDm(r.id)} act={act} />
              ))}

              {!shown.length && (
                <div className="flex flex-col items-center py-20 text-center">
                  <span className="font-serif text-5xl italic text-faint">
                    {tab === "online" ? "Tudo quieto." : tab === "blocked" ? "Ninguém aqui." : tab === "pending" ? "Nada pendente." : "Bora fazer amigos?"}
                  </span>
                  <p className="mt-2 text-sm text-muted">
                    {tab === "online" || tab === "all" ? "Manda um pedido na aba Adicionar amigo." : ""}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <aside className="hidden w-[340px] shrink-0 border-l border-ink/15 bg-paper px-4 pt-5 xl:block">
        <h3 className="font-display text-xl font-extrabold">Rolando agora</h3>
        <div className="mt-4 space-y-3">
          {friends
            .filter((r) => statusOf(state, r.id) !== "offline")
            .slice(0, 8)
            .map((r) => {
              const u = state.users[r.id] ?? r.user;
              const p = state.presences[r.id];
              return (
                <button
                  key={r.id}
                  onClick={() => onDm(r.id)}
                  className="flex w-full items-center gap-3 rounded-lg border border-ink bg-sheet p-3 text-left shadow-hard-sm hover:-translate-y-0.5 transition-transform"
                >
                  <UserAvatar user={u} size={36} status={statusOf(state, r.id)} ring="border-sheet" />
                  <span className="min-w-0 leading-tight">
                    <span className="block truncate text-sm font-semibold">{displayName(u)}</span>
                    <span className="block truncate text-xs text-muted">{p?.custom_status || STATUS_PT[statusOf(state, r.id)]}</span>
                  </span>
                </button>
              );
            })}
        </div>
        <p className="mt-6 text-center text-xs text-faint">Quem estiver online aparece aqui.</p>
      </aside>
    </section>
  );
}

function FriendRow({
  r,
  onDm,
  act,
}: {
  r: ApiRelationship;
  onDm: () => void;
  act: (path: string, method: "PUT" | "DELETE", body?: Record<string, unknown>) => Promise<void>;
}) {
  const { state } = useStore();
  const u = state.users[r.id] ?? r.user;
  const st = statusOf(state, r.id);
  const sub =
    r.type === Rel.INCOMING
      ? "Quer ser seu amigo"
      : r.type === Rel.OUTGOING
        ? "Pedido enviado"
        : r.type === Rel.BLOCKED
          ? "Bloqueado"
          : state.presences[r.id]?.custom_status || STATUS_PT[st];

  return (
    <div
      onClick={r.type === Rel.FRIEND ? onDm : undefined}
      className={`group -mx-2 flex items-center gap-3 rounded-lg border-t border-ink/10 px-2 py-2.5 hover:border-transparent hover:bg-paper ${
        r.type === Rel.FRIEND ? "cursor-pointer" : ""
      }`}
    >
      <UserAvatar user={u} size={34} status={r.type === Rel.FRIEND ? st : undefined} ring="border-sheet" />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate font-semibold">
          {displayName(u)} <span className="hidden font-mono text-xs font-normal text-muted group-hover:inline">@{u.username}</span>
        </p>
        <p className="truncate text-xs text-muted">{sub}</p>
      </div>
      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
        {r.type === Rel.FRIEND && (
          <>
            <Round label="Mandar mensagem" onClick={onDm}>
              <MessageCircle size={18} />
            </Round>
            <Round label="Desfazer amizade" tone="dnd" onClick={() => act(r.id, "DELETE")}>
              <UserMinus size={18} />
            </Round>
            <Round label="Bloquear" tone="dnd" onClick={() => act(r.id, "PUT", { type: 2 })}>
              <Ban size={17} />
            </Round>
          </>
        )}
        {r.type === Rel.INCOMING && (
          <Round label="Aceitar" tone="online" onClick={() => act(r.id, "PUT", {})}>
            <Check size={18} />
          </Round>
        )}
        {r.type !== Rel.FRIEND && (
          <Round
            label={r.type === Rel.INCOMING ? "Recusar" : r.type === Rel.BLOCKED ? "Desbloquear" : "Cancelar"}
            tone="dnd"
            onClick={() => act(r.id, "DELETE")}
          >
            <X size={18} />
          </Round>
        )}
      </div>
    </div>
  );
}

function Round({
  label,
  children,
  onClick,
  tone,
}: {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
  tone?: "online" | "dnd";
}) {
  const hover = tone === "online" ? "hover:text-online" : tone === "dnd" ? "hover:text-dnd" : "hover:text-ink";
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 bg-paper-2 text-ink-3 ${hover}`}
    >
      {children}
    </button>
  );
}
