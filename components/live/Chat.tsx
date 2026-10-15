"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AtSign,
  CirclePlus,
  CornerUpLeft,
  Hash,
  Loader2,
  Menu,
  MessageSquarePlus,
  MessagesSquare,
  Pencil,
  RotateCcw,
  Smile,
  SmilePlus,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { api, encodeEmoji } from "@/lib/client/api";
import { displayName, dmName, statusOf, useStore } from "@/lib/client/store";
import { Perm, hasPerm, type ApiChannel, type ApiGuild, type ApiMessage } from "@/lib/client/types";
import { Attachments, useUploader, type Upload } from "./Attachments";
import { EmojiGlyph } from "./Emoji";
import { RichText } from "./RichText";
import { Field, GhostButton, Modal, PrimaryButton, UserAvatar, formatDay, formatTime } from "./ui";

const QUICK = ["👍", "❤️", "😂", "🔥", "👀", "🎉"];
const GROUP_MS = 7 * 60 * 1000;

export function Chat({
  channel,
  guild,
  membersOpen,
  onToggleMembers,
  onMenu,
  onInvite,
  onOpenChannel,
}: {
  channel: ApiChannel;
  guild?: ApiGuild;
  membersOpen?: boolean;
  onToggleMembers?: () => void;
  onMenu: () => void;
  onInvite?: () => void;
  onOpenChannel?: (id: string) => void;
}) {
  const { state, dispatch, loadMessages } = useStore();
  const list = state.messages[channel.id];
  const items = list?.items ?? [];
  const me = state.me!;
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ApiMessage | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [picker, setPicker] = useState<string | null>(null);
  const [threadFor, setThreadFor] = useState<ApiMessage | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);
  const prevHeight = useRef<number | null>(null);
  const lastTyping = useRef(0);
  const uploader = useUploader(channel.id);

  const canManage = !!guild && hasPerm(guild.permissions, Perm.MANAGE_MESSAGES);
  const isDm = !channel.guild_id;
  const other = isDm && channel.type === 1 ? channel.recipients?.[0] : undefined;
  const title = isDm ? dmName(state, channel) : (channel.name ?? "");

  // carrega o histórico na primeira vez
  useEffect(() => {
    if (!list?.loaded) loadMessages(channel.id).catch((e) => setError(e.message));
    inputRef.current?.focus({ preventScroll: true });
  }, [channel.id, list?.loaded, loadMessages]);

  // mantém a rolagem: no fim quando chega mensagem, ou no lugar quando carrega antigas
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (prevHeight.current != null) {
      el.scrollTop += el.scrollHeight - prevHeight.current;
      prevHeight.current = null;
    } else if (stick.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [items.length, channel.id]);

  // marca como lido a última mensagem enquanto o canal está aberto
  const last = [...items].reverse().find((m) => !m.pending && !m.failed);
  const readId = state.readState[channel.id]?.last_message_id;
  useEffect(() => {
    if (!last || last.id === readId || document.visibilityState !== "visible") return;
    const t = setTimeout(() => {
      api(`/channels/${channel.id}/messages/${last.id}/ack`, { method: "POST" }).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [last, readId, channel.id]);

  function onScroll() {
    const el = scrollRef.current!;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 120 && list?.hasMore) {
      prevHeight.current = el.scrollHeight;
      loadMessages(channel.id, true).catch(() => (prevHeight.current = null));
    }
  }

  async function send() {
    const content = draft.trim();
    const files = uploader.ready;
    if ((!content && !files.length) || uploader.busy) return;
    const nonce = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const ref = replyTo;
    setDraft("");
    setReplyTo(null);
    setError("");
    stick.current = true;
    dispatch({
      type: "PENDING",
      message: {
        id: `pending-${nonce}`,
        nonce,
        pending: true,
        channel_id: channel.id,
        author: me,
        content,
        timestamp: new Date().toISOString(),
        edited_timestamp: null,
        type: ref ? 19 : 0,
        pinned: false,
        mentions: [],
        mention_everyone: false,
        mention_roles: [],
        reactions: [],
        attachments: files.map((f) => f.attachment!),
        ...(ref ? { message_reference: { message_id: ref.id }, referenced_message: ref } : {}),
      },
    });
    uploader.clear();
    try {
      await api(`/channels/${channel.id}/messages`, {
        body: {
          content,
          nonce,
          ...(files.length ? { attachments: files.map((f) => f.attachment) } : {}),
          ...(ref ? { message_reference: { message_id: ref.id } } : {}),
        },
      });
    } catch (e) {
      dispatch({ type: "FAILED", channelId: channel.id, nonce });
      setError((e as Error).message);
    }
  }

  function onType(v: string) {
    setDraft(v);
    if (v && Date.now() - lastTyping.current > 8000) {
      lastTyping.current = Date.now();
      api(`/channels/${channel.id}/typing`, { method: "POST" }).catch(() => {});
    }
  }

  async function react(m: ApiMessage, emoji: string) {
    setPicker(null);
    const mine = m.reactions.find((r) => r.emoji.name === emoji)?.me;
    await api(`/channels/${channel.id}/messages/${m.id}/reactions/${encodeEmoji(emoji)}/@me`, {
      method: mine ? "DELETE" : "PUT",
    }).catch((e) => setError(e.message));
  }

  async function remove(m: ApiMessage) {
    if (m.failed) {
      dispatch({ type: "EVENT", t: "MESSAGE_DELETE", d: { id: m.id, channel_id: channel.id } });
      return;
    }
    await api(`/channels/${channel.id}/messages/${m.id}`, { method: "DELETE" }).catch((e) => setError(e.message));
  }

  async function retry(m: ApiMessage) {
    dispatch({ type: "EVENT", t: "MESSAGE_DELETE", d: { id: m.id, channel_id: channel.id } });
    setDraft(m.content);
    inputRef.current?.focus();
  }

  const typingIds = Object.keys(state.typing[channel.id] ?? {});
  const typingText =
    typingIds.length === 0
      ? ""
      : typingIds.length > 3
        ? "Várias pessoas estão digitando…"
        : `${typingIds.map((id) => displayName(state.users[id])).join(", ")} ${typingIds.length > 1 ? "estão" : "está"} digitando…`;

  const iconBtn = "flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-paper-2 hover:text-ink";
  const replying = replyTo;

  return (
    <section
      className="flex min-w-0 flex-1 flex-col bg-sheet"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) uploader.add(e.dataTransfer.files);
      }}
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-ink/15 px-3">
        <button className={`${iconBtn} md:hidden`} aria-label="Abrir menu" onClick={onMenu}>
          <Menu size={20} />
        </button>
        {other ? (
          <UserAvatar user={state.users[other.id] ?? other} size={24} status={statusOf(state, other.id)} ring="border-sheet" />
        ) : isDm ? (
          <Users size={20} className="text-muted" />
        ) : (
          channel.type === 11 ? <MessagesSquare size={20} className="text-muted" /> : <Hash size={20} className="text-muted" />
        )}
        <h1 className="truncate font-display text-[16px] font-bold">{title}</h1>
        {channel.type === 11 && channel.parent_id && guild && (
          <button
            onClick={() => onOpenChannel?.(channel.parent_id!)}
            className="hidden truncate text-sm text-muted hover:text-ink sm:block"
          >
            em #{guild.channels.find((c) => c.id === channel.parent_id)?.name}
          </button>
        )}
        {channel.topic && (
          <>
            <span className="mx-1 hidden h-5 w-px bg-ink/20 lg:block" />
            <p className="hidden truncate text-sm text-muted lg:block">{channel.topic}</p>
          </>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          {guild && onInvite && (
            <button className={`${iconBtn} hidden sm:flex`} aria-label="Convidar" onClick={onInvite}>
              <UserPlus size={19} />
            </button>
          )}
          {guild && (
            <button
              className={`${iconBtn} ${membersOpen ? "bg-paper-2 text-ink" : ""}`}
              aria-label="Lista de membros"
              onClick={onToggleMembers}
            >
              <Users size={19} />
            </button>
          )}
        </div>
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        // imagem que termina de carregar no fim da conversa não pode tirar a gente do fim
        onLoadCapture={() => {
          const el = scrollRef.current;
          if (el && stick.current) el.scrollTop = el.scrollHeight;
        }}
        className="scroll-thin flex-1 overflow-y-auto"
      >
        <div className="flex min-h-full flex-col justify-end pb-4">
          {list?.loaded && !list.hasMore && (
            <div className="px-4 pb-2 pt-10">
              {other ? (
                <>
                  <UserAvatar user={state.users[other.id] ?? other} size={80} />
                  <h2 className="mt-3 font-display text-3xl font-extrabold">{displayName(state.users[other.id] ?? other)}</h2>
                  <p className="font-mono text-sm text-muted">@{other.username}</p>
                  <p className="mt-3 text-sm text-muted">Aqui começa sua conversa com {displayName(other)}.</p>
                </>
              ) : (
                <>
                  <span className="flex h-16 w-16 items-center justify-center rounded-full border border-ink bg-paper-2 shadow-hard-sm">
                    {isDm ? <AtSign size={30} /> : <Hash size={34} />}
                  </span>
                  <h2 className="mt-3 font-display text-3xl font-extrabold">{isDm ? title : `Bem-vindo a #${title}`}</h2>
                  <p className="mt-1 text-sm text-muted">{channel.topic ?? "Começo do canal."}</p>
                </>
              )}
            </div>
          )}
          {!list?.loaded && (
            <div className="flex justify-center py-10 text-muted">
              <Loader2 className="animate-spin" />
            </div>
          )}
          {list?.loaded && list.hasMore && (
            <div className="flex justify-center py-4 text-muted">
              <Loader2 size={18} className="animate-spin" />
            </div>
          )}

          {items.map((m, i) => {
            const prev = items[i - 1];
            const newDay = !prev || new Date(prev.timestamp).toDateString() !== new Date(m.timestamp).toDateString();
            const grouped =
              !!prev &&
              !newDay &&
              prev.author.id === m.author.id &&
              m.type !== 19 &&
              m.type !== 7 &&
              prev.type !== 7 &&
              new Date(m.timestamp).getTime() - new Date(prev.timestamp).getTime() < GROUP_MS;
            return (
              <div key={m.id}>
                {newDay && (
                  <div className="my-4 flex items-center gap-3 px-4">
                    <span className="h-px flex-1 bg-ink/15" />
                    <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">{formatDay(m.timestamp)}</span>
                    <span className="h-px flex-1 bg-ink/15" />
                  </div>
                )}
                {m.type === 7 ? (
                  <div className="flex items-center gap-3 px-4 py-1.5 text-sm text-muted">
                    <span className="w-10 text-center text-online">→</span>
                    <span>
                      <b className="text-ink">{displayName(state.users[m.author.id] ?? m.author)}</b> chegou no servidor.
                    </span>
                    <span className="font-mono text-[11px] text-faint">{formatTime(m.timestamp)}</span>
                  </div>
                ) : (
                  <Row
                    m={m}
                    grouped={grouped}
                    guildId={guild?.id}
                    canDelete={m.author.id === me.id || canManage}
                    canEdit={m.author.id === me.id && !m.pending && !m.failed}
                    editing={editing === m.id}
                    picker={picker === m.id}
                    onPicker={() => setPicker((p) => (p === m.id ? null : m.id))}
                    onReply={() => {
                      setReplyTo(m);
                      inputRef.current?.focus();
                    }}
                    onEdit={() => setEditing(m.id)}
                    onEditDone={() => setEditing(null)}
                    onReact={(e) => react(m, e)}
                    onDelete={() => remove(m)}
                    onRetry={() => retry(m)}
                    onThread={guild && channel.type === 0 && !m.thread ? () => setThreadFor(m) : undefined}
                    onOpenChannel={onOpenChannel}
                    channelId={channel.id}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="shrink-0 px-4 pb-5">
        <AnimatePresence>
          {replying && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="flex items-center justify-between rounded-t-lg border border-b-0 border-ink/20 bg-paper-2 px-3 py-1.5 text-sm text-muted"
            >
              <span className="truncate">
                Respondendo a <b className="text-ink">{displayName(state.users[replying.author.id] ?? replying.author)}</b>
              </span>
              <button aria-label="Cancelar resposta" onClick={() => setReplyTo(null)} className="hover:text-ink">
                <X size={16} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <div className={`border border-ink bg-paper shadow-hard-sm ${replying ? "rounded-b-lg" : "rounded-lg"}`}>
          <UploadTray uploads={uploader.uploads} onRemove={uploader.remove} />
          <div className="flex items-end gap-1 px-2 py-1.5">
            <label className={`${iconBtn} cursor-pointer`} aria-label="Enviar arquivo">
              <CirclePlus size={21} />
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) uploader.add(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              maxLength={2000}
              onChange={(e) => onType(e.target.value)}
              onPaste={(e) => {
                if (e.clipboardData.files.length) {
                  e.preventDefault();
                  uploader.add(e.clipboardData.files);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
                if (e.key === "Escape") setReplyTo(null);
                if (e.key === "ArrowUp" && !draft) {
                  const mine = [...items].reverse().find((m) => m.author.id === me.id && !m.pending && !m.failed && m.type !== 7);
                  if (mine) {
                    e.preventDefault();
                    setEditing(mine.id);
                  }
                }
              }}
              placeholder={isDm ? `Conversar com ${title}` : `Conversar em #${title}`}
              className="max-h-40 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-[15px] outline-none placeholder:text-faint"
            />
            <div className="relative">
              <button className={iconBtn} aria-label="Emoji" onClick={() => setPicker((p) => (p === "composer" ? null : "composer"))}>
                <Smile size={20} />
              </button>
              {picker === "composer" && (
                <EmojiBar
                  guildId={guild?.id}
                  onPick={(e) => {
                    // emoji do servidor vai no texto como <:nome:id>
                    const custom = e.match(/^([A-Za-z0-9_]+):(\d+)$/);
                    setDraft((d) => d + (custom ? `<:${custom[1]}:${custom[2]}>` : e));
                    setPicker(null);
                    inputRef.current?.focus();
                  }}
                  className="bottom-10 right-0"
                />
              )}
            </div>
          </div>
        </div>
        <div className="flex h-5 items-center gap-2 pl-1 pt-1 text-xs">
          {error ? (
            <span className="text-dnd">{error}</span>
          ) : typingText ? (
            <span className="inline-flex items-center gap-1.5 text-muted">
              <TypingDots />
              {typingText}
            </span>
          ) : null}
        </div>
      </div>

      <Modal open={!!threadFor} onClose={() => setThreadFor(null)} title="Criar conversa">
        {threadFor && (
          <ThreadForm
            channelId={channel.id}
            message={threadFor}
            onClose={() => setThreadFor(null)}
            onCreated={(id) => {
              setThreadFor(null);
              onOpenChannel?.(id);
            }}
          />
        )}
      </Modal>
    </section>
  );
}

function ThreadForm({
  channelId,
  message,
  onClose,
  onCreated,
}: {
  channelId: string;
  message: ApiMessage;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { dispatch } = useStore();
  const [name, setName] = useState((message.content || "Conversa").replace(/<[^>]+>/g, "").trim().slice(0, 60) || "Conversa");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const thread = await api<ApiChannel>(`/channels/${channelId}/messages/${message.id}/threads`, { body: { name: name.trim() } });
      dispatch({ type: "EVENT", t: "CHANNEL_CREATE", d: thread as unknown as Record<string, unknown> });
      onCreated(thread.id);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-ink-3">Responde num cantinho separado, sem bagunçar o canal.</p>
      <Field label="Nome da conversa" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoFocus />
      {error && <p className="text-sm text-dnd">{error}</p>}
      <div className="flex justify-end gap-2">
        <GhostButton type="button" onClick={onClose}>
          Voltar
        </GhostButton>
        <PrimaryButton busy={busy} disabled={!name.trim()}>
          Criar
        </PrimaryButton>
      </div>
    </form>
  );
}

// onPick recebe o emoji unicode ou "nome:id" para os do servidor
function EmojiBar({ onPick, className, guildId }: { onPick: (e: string) => void; className?: string; guildId?: string }) {
  const { state } = useStore();
  const custom = guildId ? (state.guilds[guildId]?.emojis ?? []) : [];
  return (
    <div className={`absolute z-30 w-max max-w-[280px] rounded-lg border border-ink bg-sheet p-1 shadow-hard-sm ${className ?? ""}`}>
      <div className="flex">
        {QUICK.map((e) => (
          <button key={e} onClick={() => onPick(e)} className="flex h-8 w-8 items-center justify-center rounded hover:bg-paper-2">
            {e}
          </button>
        ))}
      </div>
      {!!custom.length && (
        <div className="mt-1 flex flex-wrap border-t border-ink/15 pt-1">
          {custom.map((e) => (
            <button
              key={e.id}
              title={`:${e.name}:`}
              onClick={() => onPick(`${e.name}:${e.id}`)}
              className="flex h-8 w-8 items-center justify-center rounded hover:bg-paper-2"
            >
              <EmojiGlyph value={`${e.name}:${e.id}`} size={22} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  m,
  grouped,
  guildId,
  canDelete,
  canEdit,
  editing,
  picker,
  onPicker,
  onReply,
  onEdit,
  onEditDone,
  onReact,
  onDelete,
  onRetry,
  onThread,
  onOpenChannel,
  channelId,
}: {
  m: ApiMessage;
  grouped: boolean;
  guildId?: string;
  canDelete: boolean;
  canEdit: boolean;
  editing: boolean;
  picker: boolean;
  onPicker: () => void;
  onReply: () => void;
  onEdit: () => void;
  onEditDone: () => void;
  onReact: (e: string) => void;
  onDelete: () => void;
  onRetry: () => void;
  onThread?: () => void;
  onOpenChannel?: (id: string) => void;
  channelId: string;
}) {
  const { state } = useStore();
  const author = state.users[m.author.id] ?? m.author;
  const ref = m.referenced_message;
  const me = state.me!;
  const mentionsMe = m.mention_everyone || m.mentions.some((u) => u.id === me.id) || (ref?.author.id === me.id && m.author.id !== me.id);

  return (
    <div
      className={`group relative px-4 hover:bg-paper/70 ${grouped ? "py-0.5" : "mt-3 pb-0.5 pt-1"} ${
        mentionsMe ? "border-l-2 border-mustard bg-mustard/10" : ""
      } ${m.pending ? "opacity-60" : ""}`}
    >
      {m.message_reference && (
        <div className="mb-1 flex items-center gap-1.5 pl-14 text-[13px] text-muted">
          {ref ? (
            <>
              <UserAvatar user={state.users[ref.author.id] ?? ref.author} size={16} />
              <b className="shrink-0 text-ink-3">{displayName(state.users[ref.author.id] ?? ref.author)}</b>
              <span className="truncate">{ref.content || "anexo"}</span>
            </>
          ) : (
            <i>Mensagem original apagada</i>
          )}
        </div>
      )}
      <div className="flex gap-4">
        <div className="w-10 shrink-0">
          {grouped ? (
            <span className="hidden pt-1 text-right font-mono text-[10px] text-faint group-hover:block">{formatTime(m.timestamp)}</span>
          ) : (
            <UserAvatar user={author} size={40} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          {!grouped && (
            <div className="flex items-baseline gap-2">
              <span className="font-semibold" style={{ color: author.id === me.id ? "var(--color-signal-ink)" : undefined }}>
                {displayName(author)}
              </span>
              {author.bot && (
                <span className="rounded border border-ink px-1 font-mono text-[10px] font-bold uppercase leading-4">bot</span>
              )}
              <span className="font-mono text-[11px] text-faint">{formatTime(m.timestamp)}</span>
            </div>
          )}
          {editing ? (
            <EditBox m={m} channelId={channelId} onDone={onEditDone} />
          ) : (
            m.content && (
              <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink-2">
                <RichText text={m.content} guildId={guildId} />
                {m.edited_timestamp && <span className="ml-1 text-[11px] text-faint">(editada)</span>}
              </p>
            )
          )}
          <Attachments items={m.attachments} />
          {m.thread && (
            <button
              onClick={() => onOpenChannel?.(m.thread!.id)}
              className="mt-1.5 flex w-fit items-center gap-2 rounded-lg border border-ink/20 bg-paper px-2.5 py-1.5 text-sm hover:border-ink"
            >
              <MessagesSquare size={15} className="text-signal" />
              <b>{m.thread.name}</b>
              <span className="text-muted">
                {m.thread.message_count === 0 ? "Abrir conversa" : `${m.thread.message_count} ${m.thread.message_count === 1 ? "resposta" : "respostas"}`}
              </span>
            </button>
          )}
          {m.failed && (
            <p className="mt-1 flex items-center gap-3 text-xs text-dnd">
              Não foi enviada.
              <button onClick={onRetry} className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline">
                <RotateCcw size={12} /> Tentar de novo
              </button>
              <button onClick={onDelete} className="font-semibold underline-offset-2 hover:underline">
                Descartar
              </button>
            </p>
          )}
          {!!m.reactions.length && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {m.reactions.map((r) => (
                <button
                  key={r.emoji.name}
                  onClick={() => onReact(r.emoji.name)}
                  className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-sm ${
                    r.me ? "border-signal bg-signal/10" : "border-ink/20 bg-paper hover:border-ink/50"
                  }`}
                >
                  <EmojiGlyph value={r.emoji.name} size={16} />
                  <span className="font-mono text-xs font-semibold">{r.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {!m.pending && !m.failed && !editing && (
        <div
          className={`absolute -top-4 right-4 items-center rounded-md border border-ink bg-sheet shadow-hard-sm ${
            picker ? "flex" : "hidden group-hover:flex"
          }`}
        >
          {QUICK.slice(0, 3).map((e) => (
            <button key={e} onClick={() => onReact(e)} className="flex h-8 w-8 items-center justify-center hover:bg-paper-2">
              {e}
            </button>
          ))}
          <span className="h-5 w-px bg-ink/20" />
          <div className="relative">
            <button aria-label="Reagir" onClick={onPicker} className="flex h-8 w-8 items-center justify-center text-ink-3 hover:bg-paper-2">
              <SmilePlus size={17} />
            </button>
            {picker && <EmojiBar onPick={onReact} guildId={guildId} className="right-0 top-9" />}
          </div>
          {onThread && (
            <button aria-label="Criar conversa" title="Criar conversa" onClick={onThread} className="flex h-8 w-8 items-center justify-center text-ink-3 hover:bg-paper-2">
              <MessageSquarePlus size={17} />
            </button>
          )}
          <button aria-label="Responder" onClick={onReply} className="flex h-8 w-8 items-center justify-center text-ink-3 hover:bg-paper-2">
            <CornerUpLeft size={17} />
          </button>
          {canEdit && (
            <button aria-label="Editar" onClick={onEdit} className="flex h-8 w-8 items-center justify-center text-ink-3 hover:bg-paper-2">
              <Pencil size={16} />
            </button>
          )}
          {canDelete && (
            <button aria-label="Apagar" onClick={onDelete} className="flex h-8 w-8 items-center justify-center text-ink-3 hover:bg-dnd/10 hover:text-dnd">
              <Trash2 size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function EditBox({ m, channelId, onDone }: { m: ApiMessage; channelId: string; onDone: () => void }) {
  const [value, setValue] = useState(m.content);
  const [busy, setBusy] = useState(false);
  async function save() {
    const content = value.trim();
    if (!content || content === m.content) return onDone();
    setBusy(true);
    await api(`/channels/${channelId}/messages/${m.id}`, { method: "PATCH", body: { content } }).catch(() => {});
    onDone();
  }
  return (
    <div className="mt-1">
      <textarea
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            save();
          }
          if (e.key === "Escape") onDone();
        }}
        className="w-full resize-none rounded-lg border border-ink bg-paper px-3 py-2 text-[15px] outline-none"
        rows={Math.min(6, value.split("\n").length)}
      />
      <p className="text-xs text-muted">
        {busy ? "Salvando…" : "Enter salva · Esc cancela"}
      </p>
    </div>
  );
}

function UploadTray({ uploads, onRemove }: { uploads: Upload[]; onRemove: (id: string) => void }) {
  if (!uploads.length) return null;
  return (
    <div className="flex gap-2 overflow-x-auto border-b border-ink/15 p-2">
      {uploads.map((u) => (
        <div key={u.id} className="relative flex w-36 shrink-0 flex-col rounded-lg border border-ink/20 bg-sheet p-2">
          {u.preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={u.preview} alt="" className="h-20 w-full rounded object-cover" />
          ) : (
            <span className="flex h-20 items-center justify-center rounded bg-paper-2 font-mono text-xs text-muted">
              {u.file.name.split(".").pop()?.toUpperCase()}
            </span>
          )}
          <span className="mt-1 truncate text-xs">{u.file.name}</span>
          <span className={`text-[11px] ${u.error ? "text-dnd" : "text-muted"}`}>
            {u.error ?? (u.attachment ? "Pronto" : "Enviando…")}
          </span>
          <button
            aria-label="Tirar arquivo"
            onClick={() => onRemove(u.id)}
            className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-ink bg-sheet hover:text-dnd"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
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
