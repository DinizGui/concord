"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AtSign,
  Bell,
  CirclePlus,
  CornerUpLeft,
  EllipsisVertical,
  FileText,
  Gift,
  Hash,
  Inbox,
  Megaphone,
  Menu,
  MessageSquareText,
  Phone,
  Pin,
  Search,
  Smile,
  SmilePlus,
  Sticker,
  Users,
  Video,
  X,
} from "lucide-react";
import { USERS, type Message } from "@/lib/data";
import { Avatar } from "./Avatar";

type Props = {
  kind: "channel" | "dm";
  title: string;
  topic?: string;
  channelKind?: "text" | "announce";
  dmUserId?: string;
  messages: Message[];
  typing: string | null;
  membersOpen?: boolean;
  onToggleMembers?: () => void;
  onSend: (text: string, replyTo?: string) => void;
  onReact: (messageId: string, emoji: string) => void;
  onMenu: () => void;
};

const QUICK = ["👍", "❤️", "😂", "🔥", "👀"];

export function ChatView(p: Props) {
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [p.messages.length, p.typing, p.title]);

  // o pai troca a key a cada conversa, então rascunho e resposta já nascem limpos
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  function send() {
    const text = draft.trim();
    if (!text) return;
    p.onSend(text, replyTo ?? undefined);
    setDraft("");
    setReplyTo(null);
  }

  const HeaderIcon = p.kind === "dm" ? AtSign : p.channelKind === "announce" ? Megaphone : Hash;
  const placeholder = p.kind === "dm" ? `Conversar com @${p.title}` : `Conversar em #${p.title}`;
  const iconBtn = "flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-paper-2 hover:text-ink";
  const dmUser = p.dmUserId ? USERS[p.dmUserId] : null;

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-sheet">
      {/* topo */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-ink/15 px-3">
        <button className={`${iconBtn} md:hidden`} aria-label="Abrir menu" onClick={p.onMenu}>
          <Menu size={20} />
        </button>
        {dmUser ? <Avatar user={dmUser} size={24} showStatus ring="border-sheet" /> : <HeaderIcon size={20} className="text-muted" />}
        <h1 className="truncate font-display text-[16px] font-bold">{p.title}</h1>
        {p.topic && (
          <>
            <span className="mx-1 hidden h-5 w-px bg-ink/20 lg:block" />
            <p className="hidden truncate text-sm text-muted lg:block">{p.topic}</p>
          </>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          {p.kind === "dm" ? (
            <>
              <button className={iconBtn} aria-label="Ligar"><Phone size={19} /></button>
              <button className={iconBtn} aria-label="Chamada de vídeo"><Video size={19} /></button>
              <button className={iconBtn} aria-label="Mensagens fixadas"><Pin size={19} /></button>
            </>
          ) : (
            <>
              <button className={`${iconBtn} hidden sm:flex`} aria-label="Conversas"><MessageSquareText size={19} /></button>
              <button className={`${iconBtn} hidden sm:flex`} aria-label="Notificações"><Bell size={19} /></button>
              <button className={`${iconBtn} hidden sm:flex`} aria-label="Mensagens fixadas"><Pin size={19} /></button>
              <button
                className={`${iconBtn} ${p.membersOpen ? "bg-paper-2 text-ink" : ""}`}
                aria-label="Lista de membros"
                onClick={p.onToggleMembers}
              >
                <Users size={19} />
              </button>
            </>
          )}
          <label className="ml-1 hidden items-center gap-1 rounded-md bg-paper-2 px-2 py-1 text-sm text-muted md:flex">
            <input placeholder="Buscar" className="w-28 bg-transparent outline-none placeholder:text-muted focus:w-44 transition-[width]" />
            <Search size={14} />
          </label>
          <button className={`${iconBtn} hidden md:flex`} aria-label="Caixa de entrada"><Inbox size={19} /></button>
        </div>
      </header>

      {/* mensagens */}
      <div ref={scrollRef} className="scroll-thin flex-1 overflow-y-auto">
        <div className="flex min-h-full flex-col justify-end pb-4">
          <Intro {...p} />
          {p.messages.map((m, i) => {
            const prev = p.messages[i - 1];
            const grouped = !!prev && prev.authorId === m.authorId && !m.day && !m.replyTo;
            return (
              <div key={m.id}>
                {m.day && (
                  <div className="my-4 flex items-center gap-3 px-4">
                    <span className="h-px flex-1 bg-ink/15" />
                    <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">{m.day}</span>
                    <span className="h-px flex-1 bg-ink/15" />
                  </div>
                )}
                <MessageRow
                  m={m}
                  grouped={grouped}
                  all={p.messages}
                  onReply={() => {
                    setReplyTo(m.id);
                    inputRef.current?.focus({ preventScroll: true });
                  }}
                  onReact={(e) => p.onReact(m.id, e)}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* compositor */}
      <div className="shrink-0 px-4 pb-5">
        <AnimatePresence>
          {replyTo && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="flex items-center justify-between rounded-t-lg border border-b-0 border-ink/20 bg-paper-2 px-3 py-1.5 text-sm text-muted"
            >
              <span>
                Respondendo a{" "}
                <b className="text-ink">{USERS[p.messages.find((m) => m.id === replyTo)?.authorId ?? "me"].name}</b>
              </span>
              <button aria-label="Cancelar resposta" onClick={() => setReplyTo(null)} className="hover:text-ink">
                <X size={16} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <div
          className={`flex items-end gap-1 border border-ink bg-paper px-2 py-1.5 shadow-hard-sm ${
            replyTo ? "rounded-b-lg" : "rounded-lg"
          }`}
        >
          <button className={iconBtn} aria-label="Enviar arquivo"><CirclePlus size={21} /></button>
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={placeholder}
            className="max-h-40 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-[15px] outline-none placeholder:text-faint"
          />
          <button className={`${iconBtn} hidden sm:flex`} aria-label="Presente"><Gift size={20} /></button>
          <button className={`${iconBtn} hidden sm:flex`} aria-label="Figurinhas"><Sticker size={20} /></button>
          <button className={iconBtn} aria-label="Emoji" onClick={() => setDraft((d) => d + "🙂")}><Smile size={20} /></button>
        </div>
        <div className="h-5 pl-1 pt-1 text-xs text-muted">
          {p.typing && (
            <span className="inline-flex items-center gap-1.5">
              <TypingDots />
              <b className="text-ink">{USERS[p.typing].name}</b> está digitando…
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function Intro(p: Props) {
  if (p.kind === "dm" && p.dmUserId) {
    const u = USERS[p.dmUserId];
    return (
      <div className="px-4 pb-2 pt-10">
        <Avatar user={u} size={80} />
        <h2 className="mt-3 font-display text-3xl font-extrabold">{u.name}</h2>
        <p className="font-mono text-sm text-muted">@{u.handle}</p>
        <p className="mt-3 text-sm text-muted">
          Aqui começa sua conversa com <b className="text-ink">{u.name}</b>.
        </p>
      </div>
    );
  }
  return (
    <div className="px-4 pb-2 pt-10">
      <span className="flex h-16 w-16 items-center justify-center rounded-full border border-ink bg-paper-2 shadow-hard-sm">
        <Hash size={34} />
      </span>
      <h2 className="mt-3 font-display text-3xl font-extrabold">Bem-vindo a #{p.title}</h2>
      <p className="mt-1 text-sm text-muted">{p.topic ?? "Começo do canal."}</p>
    </div>
  );
}

function MessageRow({
  m,
  grouped,
  all,
  onReply,
  onReact,
}: {
  m: Message;
  grouped: boolean;
  all: Message[];
  onReply: () => void;
  onReact: (emoji: string) => void;
}) {
  const u = USERS[m.authorId];
  const replied = m.replyTo ? all.find((x) => x.id === m.replyTo) : undefined;
  const mentionsMe = /@gui/i.test(m.text);

  return (
    <motion.div
      layout="position"
      initial={m.id.startsWith("new-") ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      className={`group relative px-4 hover:bg-paper/70 ${grouped ? "py-0.5" : "mt-3 pt-1 pb-0.5"} ${
        mentionsMe ? "border-l-2 border-mustard bg-mustard/10" : ""
      }`}
    >
      {replied && (
        <div className="mb-1 ml-5 flex items-center gap-1.5 pl-9 text-[13px] text-muted">
          <span className="absolute left-[34px] top-[13px] h-3 w-6 rounded-tl-md border-l-2 border-t-2 border-ink/25" />
          <Avatar user={USERS[replied.authorId]} size={16} />
          <b className="text-ink-3">{USERS[replied.authorId].name}</b>
          <span className="truncate">{replied.text}</span>
        </div>
      )}
      <div className="flex gap-4">
        <div className="w-10 shrink-0">
          {grouped ? (
            <span className="hidden pt-1 text-right font-mono text-[10px] text-faint group-hover:block">{m.time}</span>
          ) : (
            <Avatar user={u} size={40} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          {!grouped && (
            <div className="flex items-baseline gap-2">
              <span className="font-semibold" style={{ color: u.id === "me" ? "var(--color-signal-ink)" : undefined }}>
                {u.name}
              </span>
              {u.role === "bot" && (
                <span className="rounded border border-ink px-1 font-mono text-[10px] font-bold uppercase leading-4">bot</span>
              )}
              <span className="font-mono text-[11px] text-faint">{m.time}</span>
            </div>
          )}
          <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink-2">{m.text}</p>
          {m.attachment && (
            <div className="mt-2 flex max-w-sm items-center gap-3 rounded-lg border border-ink bg-paper px-3 py-2.5 shadow-hard-sm">
              <FileText size={28} className="text-signal" />
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-sm font-semibold underline-offset-2 hover:underline">{m.attachment.title}</span>
                <span className="block font-mono text-[11px] text-muted">{m.attachment.meta}</span>
              </span>
            </div>
          )}
          {!!m.reactions?.length && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {m.reactions.map((r) => (
                <button
                  key={r.emoji}
                  onClick={() => onReact(r.emoji)}
                  className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-sm ${
                    r.mine ? "border-signal bg-signal/10" : "border-ink/20 bg-paper hover:border-ink/50"
                  }`}
                >
                  <span>{r.emoji}</span>
                  <span className="font-mono text-xs font-semibold">{r.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ações ao passar o mouse */}
      <div className="absolute -top-4 right-4 hidden items-center rounded-md border border-ink bg-sheet shadow-hard-sm group-hover:flex">
        {QUICK.slice(0, 3).map((e) => (
          <button key={e} onClick={() => onReact(e)} className="flex h-8 w-8 items-center justify-center hover:bg-paper-2">
            {e}
          </button>
        ))}
        <span className="h-5 w-px bg-ink/20" />
        <button aria-label="Reagir" onClick={() => onReact("👀")} className="flex h-8 w-8 items-center justify-center text-ink-3 hover:bg-paper-2">
          <SmilePlus size={17} />
        </button>
        <button aria-label="Responder" onClick={onReply} className="flex h-8 w-8 items-center justify-center text-ink-3 hover:bg-paper-2">
          <CornerUpLeft size={17} />
        </button>
        <button aria-label="Mais" className="flex h-8 w-8 items-center justify-center text-ink-3 hover:bg-paper-2">
          <EllipsisVertical size={17} />
        </button>
      </div>
    </motion.div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-ink"
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </span>
  );
}
