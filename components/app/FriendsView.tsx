"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, EllipsisVertical, Menu, MessageCircle, Search, Users, X } from "lucide-react";
import { FRIENDS, PENDING, USERS } from "@/lib/data";
import { Avatar, statusLabel } from "./Avatar";

const TABS = [
  { id: "online", label: "Online" },
  { id: "all", label: "Todos" },
  { id: "pending", label: "Pendentes" },
  { id: "blocked", label: "Bloqueados" },
] as const;

type Tab = (typeof TABS)[number]["id"] | "add";

export function FriendsView({ onDm, onMenu }: { onDm: (userId: string) => void; onMenu: () => void }) {
  const [tab, setTab] = useState<Tab>("online");
  const [query, setQuery] = useState("");
  const [sent, setSent] = useState<string | null>(null);

  const list =
    tab === "online"
      ? FRIENDS.filter((id) => USERS[id].status !== "offline")
      : tab === "all"
        ? FRIENDS
        : [];
  const filtered = list.filter((id) => USERS[id].name.toLowerCase().includes(query.toLowerCase()));

  return (
    <section className="flex min-w-0 flex-1 bg-sheet">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-ink/15 px-3">
          <button className="flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-paper-2 md:hidden" aria-label="Abrir menu" onClick={onMenu}>
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
                  <motion.span layoutId="friends-tab" className="absolute inset-0 rounded-md bg-paper-2" transition={{ type: "spring", stiffness: 500, damping: 36 }} />
                )}
                <span className="relative">
                  {t.label}
                  {t.id === "pending" && (
                    <span className="ml-1.5 rounded-full bg-signal px-1.5 font-mono text-[11px] font-bold text-sheet">1</span>
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
                onSubmit={(e) => {
                  e.preventDefault();
                  if (query.trim()) setSent(query.trim());
                }}
                className="mt-4 flex items-center gap-2 rounded-lg border border-ink bg-paper px-3 py-2 shadow-hard-sm focus-within:shadow-hard"
              >
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSent(null);
                  }}
                  placeholder="nome.de.usuario"
                  className="flex-1 bg-transparent font-mono text-[15px] outline-none placeholder:text-faint"
                />
                <button
                  disabled={!query.trim()}
                  className="rounded-md bg-signal px-3 py-1.5 text-sm font-semibold text-sheet disabled:opacity-40"
                >
                  Enviar pedido
                </button>
              </form>
              {sent && (
                <p className="mt-2 text-sm text-online">
                  Pedido enviado pra <b>{sent}</b>.
                </p>
              )}
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

              {tab === "pending" && (
                <>
                  <Heading>Pendentes · {PENDING.length}</Heading>
                  {PENDING.map((p) => {
                    const u = USERS[p.userId];
                    return (
                      <Row key={p.userId} userId={p.userId} sub={p.kind === "in" ? "Quer ser seu amigo" : "Pedido enviado"}>
                        {p.kind === "in" && (
                          <RoundBtn label="Aceitar" tone="online">
                            <Check size={18} />
                          </RoundBtn>
                        )}
                        <RoundBtn label={p.kind === "in" ? "Recusar" : "Cancelar"} tone="dnd">
                          <X size={18} />
                        </RoundBtn>
                        <span className="sr-only">{u.name}</span>
                      </Row>
                    );
                  })}
                </>
              )}

              {tab === "blocked" && (
                <div className="flex flex-col items-center py-20 text-center">
                  <span className="font-serif text-5xl italic text-faint">Ninguém aqui.</span>
                  <p className="mt-2 text-sm text-muted">Você não bloqueou ninguém. Que bom.</p>
                </div>
              )}

              {(tab === "online" || tab === "all") && (
                <>
                  <Heading>
                    {tab === "online" ? "Online" : "Todos os amigos"} · {filtered.length}
                  </Heading>
                  {filtered.map((id) => (
                    <Row key={id} userId={id} sub={USERS[id].activity ?? statusLabel[USERS[id].status]} onClick={() => onDm(id)}>
                      <RoundBtn label="Mandar mensagem" onClick={() => onDm(id)}>
                        <MessageCircle size={18} />
                      </RoundBtn>
                      <RoundBtn label="Mais">
                        <EllipsisVertical size={18} />
                      </RoundBtn>
                    </Row>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* agora */}
      <aside className="hidden w-[340px] shrink-0 border-l border-ink/15 bg-paper px-4 pt-5 xl:block">
        <h3 className="font-display text-xl font-extrabold">Rolando agora</h3>
        <div className="mt-4 space-y-3">
          {["caio", "ana", "tom"].map((id) => {
            const u = USERS[id];
            return (
              <div key={id} className="rounded-lg border border-ink bg-sheet p-3 shadow-hard-sm">
                <div className="flex items-center gap-3">
                  <Avatar user={u} size={36} showStatus ring="border-sheet" />
                  <div className="min-w-0 leading-tight">
                    <p className="truncate text-sm font-semibold">{u.name}</p>
                    <p className="truncate text-xs text-muted">{u.activity}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-6 text-center text-xs text-faint">Quando seus amigos estiverem jogando ou ouvindo algo, aparece aqui.</p>
      </aside>
    </section>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 mt-5 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">{children}</h3>;
}

function Row({ userId, sub, children, onClick }: { userId: string; sub: string; children: React.ReactNode; onClick?: () => void }) {
  const u = USERS[userId];
  return (
    <div
      onClick={onClick}
      className="group -mx-2 flex cursor-pointer items-center gap-3 rounded-lg border-t border-ink/10 px-2 py-2.5 hover:border-transparent hover:bg-paper"
    >
      <Avatar user={u} size={34} showStatus ring="border-sheet" />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate font-semibold">
          {u.name} <span className="hidden font-mono text-xs font-normal text-muted group-hover:inline">@{u.handle}</span>
        </p>
        <p className="truncate text-xs text-muted">{sub}</p>
      </div>
      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function RoundBtn({
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
