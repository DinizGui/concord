"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Hash, Volume2, FolderClosed } from "lucide-react";
import { api, type ClientError } from "@/lib/client/api";
import { displayName, useStore } from "@/lib/client/store";
import { Rel, type ApiChannel, type ApiGuild, type ApiInvite, type ApiUser } from "@/lib/client/types";
import { GuildSettingsTabs } from "./GuildSettings";
import { Field, GhostButton, Modal, PrimaryButton, UserAvatar } from "./ui";

export function parseInviteCode(input: string) {
  const v = input.trim();
  const m = v.match(/invite\/([A-Za-z0-9-]+)/);
  return m ? m[1] : v.replace(/[^A-Za-z0-9-]/g, "");
}

type AddGuildProps = { open: boolean; onClose: () => void; onDone: (guildId: string) => void };

// O conteúdo de cada modal só monta quando ele abre, então o estado já nasce limpo.
export function AddGuildModal(props: AddGuildProps) {
  return (
    <Modal open={props.open} onClose={props.onClose} title="Criar ou entrar num servidor">
      <AddGuildBody {...props} />
    </Modal>
  );
}

function AddGuildBody({ onClose, onDone }: AddGuildProps) {
  const { state, dispatch } = useStore();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [name, setName] = useState(state.me ? `Servidor de ${displayName(state.me)}` : "");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "create") {
        const guild = await api<ApiGuild>("/guilds", { body: { name: name.trim() } });
        dispatch({ type: "UPSERT_GUILD", guild });
        onDone(guild.id);
      } else {
        const res = await api<ApiInvite & { guild_payload?: ApiGuild }>(`/invites/${parseInviteCode(code)}`, { method: "POST" });
        if (res.guild_payload) dispatch({ type: "UPSERT_GUILD", guild: res.guild_payload });
        if (res.guild) onDone(res.guild.id);
      }
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-2 rounded-full border border-ink p-1 text-sm font-semibold">
        {(["create", "join"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-full py-1.5 ${mode === m ? "bg-ink text-sheet" : "text-ink-3"}`}
          >
            {m === "create" ? "Criar" : "Tenho convite"}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-4">
        {mode === "create" ? (
          <Field label="Nome do servidor" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoFocus />
        ) : (
          <Field label="Link ou código do convite" placeholder="https://.../invite/abc123" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
        )}
        {error && <p className="text-sm text-dnd">{error}</p>}
        <div className="flex justify-end gap-2">
          <GhostButton type="button" onClick={onClose}>
            Voltar
          </GhostButton>
          <PrimaryButton busy={busy} disabled={mode === "create" ? name.trim().length < 2 : !code.trim()}>
            {mode === "create" ? "Criar" : "Entrar"}
          </PrimaryButton>
        </div>
      </form>
    </>
  );
}

export function InviteModal({ guild, channelId, onClose }: { guild: ApiGuild | null; channelId: string | null; onClose: () => void }) {
  return (
    <Modal open={!!guild} onClose={onClose} title={`Chamar pro ${guild?.name ?? ""}`}>
      {guild && <InviteBody guild={guild} channelId={channelId} />}
    </Modal>
  );
}

function InviteBody({ guild, channelId }: { guild: ApiGuild; channelId: string | null }) {
  const target = channelId ?? guild.channels.find((c) => c.type === 0)?.id;
  const [link, setLink] = useState("");
  const [error, setError] = useState(target ? "" : "Crie um canal de texto antes de convidar.");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!target) return;
    api<ApiInvite>(`/channels/${target}/invites`, { body: { max_age: 604800 } })
      .then((inv) => setLink(`${window.location.origin}/invite/${inv.code}`))
      .catch((e) => setError(e.message));
  }, [target]);

  async function copy() {
    await navigator.clipboard.writeText(link).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <>
      <p className="text-sm text-ink-3">Manda esse link pra quem você quer no servidor. Vale por 7 dias.</p>
      <div className="mt-4 flex items-center gap-2 rounded-lg border border-ink bg-paper p-1.5 pl-3">
        <input readOnly value={link || (error ? "" : "Gerando link…")} className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none" />
        <button
          disabled={!link}
          onClick={copy}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold text-sheet ${copied ? "bg-online" : "bg-signal"} disabled:opacity-40`}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-dnd">{error}</p>}
    </>
  );
}

export function CreateChannelModal({
  target,
  onClose,
  onCreated,
}: {
  target: { guild: ApiGuild; parentId: string | null; type: 0 | 2 | 4 } | null;
  onClose: () => void;
  onCreated: (c: ApiChannel) => void;
}) {
  return (
    <Modal open={!!target} onClose={onClose} title={target?.type === 4 ? "Criar categoria" : "Criar canal"}>
      {target && <CreateChannelBody target={target} onClose={onClose} onCreated={onCreated} />}
    </Modal>
  );
}

function CreateChannelBody({
  target,
  onClose,
  onCreated,
}: {
  target: { guild: ApiGuild; parentId: string | null; type: 0 | 2 | 4 };
  onClose: () => void;
  onCreated: (c: ApiChannel) => void;
}) {
  const { dispatch } = useStore();
  const [type, setType] = useState<0 | 2 | 4>(target.type);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const clean = type === 0 ? name.trim().toLowerCase().replace(/\s+/g, "-") : name.trim();
      const channel = await api<ApiChannel>(`/guilds/${target.guild.id}/channels`, {
        body: { name: clean, type, ...(target.parentId && type !== 4 ? { parent_id: target.parentId } : {}) },
      });
      dispatch({ type: "EVENT", t: "CHANNEL_CREATE", d: channel as unknown as Record<string, unknown> });
      onCreated(channel);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const options = [
    { t: 0 as const, label: "Texto", hint: "Mensagens, fotos e opiniões.", Icon: Hash },
    { t: 2 as const, label: "Voz", hint: "Entra e fala, sem marcar horário.", Icon: Volume2 },
    { t: 4 as const, label: "Categoria", hint: "Agrupa canais.", Icon: FolderClosed },
  ];

  return (
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          {options.map(({ t, label, hint, Icon }) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left ${
                type === t ? "border-ink bg-paper shadow-hard-sm" : "border-ink/20 hover:border-ink/50"
              }`}
            >
              <Icon size={20} className="text-muted" />
              <span className="leading-tight">
                <b className="block">{label}</b>
                <span className="text-xs text-muted">{hint}</span>
              </span>
            </button>
          ))}
        </div>
        <Field
          label="Nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={type === 0 ? "novo-canal" : type === 2 ? "Bate-papo" : "Assuntos"}
          maxLength={100}
          autoFocus
        />
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

type NewDmProps = { open: boolean; onClose: () => void; onOpen: (channelId: string) => void };

export function NewDmModal(props: NewDmProps) {
  return (
    <Modal open={props.open} onClose={props.onClose} title="Nova conversa">
      <NewDmBody {...props} />
    </Modal>
  );
}

function NewDmBody({ onClose, onOpen }: NewDmProps) {
  const { state, dispatch } = useStore();
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const friends = Object.values(state.relationships).filter((r) => r.type === Rel.FRIEND);

  async function submit() {
    setBusy(true);
    try {
      const body = picked.length === 1 ? { recipient_id: picked[0] } : { recipients: picked };
      const channel = await api<ApiChannel>("/users/@me/channels", { body });
      dispatch({ type: "UPSERT_DM", channel });
      onOpen(channel.id);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="text-sm text-ink-3">Escolhe um amigo, ou vários pra criar um grupo.</p>
      <ul className="scroll-thin mt-3 max-h-72 space-y-1 overflow-y-auto">
        {friends.map((r) => {
          const u = state.users[r.id] ?? r.user;
          const on = picked.includes(r.id);
          return (
            <li key={r.id}>
              <button
                onClick={() => setPicked((p) => (on ? p.filter((x) => x !== r.id) : [...p, r.id].slice(0, 9)))}
                className={`flex w-full items-center gap-3 rounded-lg border px-2 py-2 text-left ${on ? "border-ink bg-paper" : "border-transparent hover:bg-paper"}`}
              >
                <UserAvatar user={u} size={32} />
                <span className="flex-1 truncate font-medium">{displayName(u)}</span>
                <span className={`flex h-5 w-5 items-center justify-center rounded border border-ink ${on ? "bg-signal text-sheet" : ""}`}>
                  {on && <Check size={13} />}
                </span>
              </button>
            </li>
          );
        })}
        {!friends.length && <li className="py-6 text-center text-sm text-muted">Você ainda não tem amigos adicionados.</li>}
      </ul>
      {error && <p className="mt-2 text-sm text-dnd">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <GhostButton onClick={onClose}>Voltar</GhostButton>
        <PrimaryButton busy={busy} disabled={!picked.length} onClick={submit}>
          {picked.length > 1 ? "Criar grupo" : "Abrir conversa"}
        </PrimaryButton>
      </div>
    </>
  );
}

export function ProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Seu perfil">
      <ProfileBody onClose={onClose} />
    </Modal>
  );
}

function ProfileBody({ onClose }: { onClose: () => void }) {
  const { state } = useStore();
  const me = state.me;
  const [values, setValues] = useState({
    global_name: me?.global_name ?? "",
    bio: me?.bio ?? "",
    avatar: me?.avatar ?? "",
    password: "",
    new_password: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const body: Record<string, unknown> = {};
    if (values.global_name.trim() !== (me?.global_name ?? "")) body.global_name = values.global_name.trim() || null;
    if (values.bio !== (me?.bio ?? "")) body.bio = values.bio;
    if (values.avatar.trim() !== (me?.avatar ?? "")) body.avatar = values.avatar.trim() || null;
    if (values.new_password) {
      body.new_password = values.new_password;
      body.password = values.password;
    }
    try {
      if (Object.keys(body).length) await api("/users/@me", { method: "PATCH", body });
      setDone(true);
      setTimeout(onClose, 700);
    } catch (err) {
      const e = err as ClientError;
      setErrors(Object.keys(e.fields ?? {}).length ? e.fields : { _: e.message });
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [k]: e.target.value }));

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <UserAvatar user={{ ...(me as ApiUser), avatar: values.avatar || null, global_name: values.global_name || null }} size={56} />
        <span className="leading-tight">
          <b className="block text-lg">{values.global_name || me?.username}</b>
          <span className="font-mono text-sm text-muted">@{me?.username}</span>
        </span>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Nome que aparece" value={values.global_name} onChange={set("global_name")} maxLength={32} error={errors.global_name} />
        <Field label="Sobre você" value={values.bio} onChange={set("bio")} maxLength={190} error={errors.bio} />
        <Field label="Foto (link https)" value={values.avatar} onChange={set("avatar")} placeholder="https://" error={errors.avatar} />
        <details className="rounded-lg border border-ink/20 px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold">Trocar senha</summary>
          <div className="mt-3 space-y-3">
            <Field label="Senha atual" type="password" value={values.password} onChange={set("password")} error={errors.password} autoComplete="current-password" />
            <Field label="Nova senha" type="password" value={values.new_password} onChange={set("new_password")} error={errors.new_password} autoComplete="new-password" />
          </div>
        </details>
        {errors._ && <p className="text-sm text-dnd">{errors._}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <GhostButton type="button" onClick={onClose}>
            Fechar
          </GhostButton>
          <PrimaryButton busy={busy}>{done ? "Salvo!" : "Salvar"}</PrimaryButton>
        </div>
      </form>
    </>
  );
}

export function GuildSettingsModal({ guild, onClose }: { guild: ApiGuild | null; onClose: () => void }) {
  return (
    <Modal open={!!guild} onClose={onClose} title="Configurações do servidor">
      {guild && <GuildSettingsTabs guild={guild} onClose={onClose} />}
    </Modal>
  );
}

export function ConfirmModal({
  open,
  title,
  text,
  action,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  text: string;
  action: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-ink-3">{text}</p>
      {error && <p className="mt-2 text-sm text-dnd">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <GhostButton onClick={onClose}>Voltar</GhostButton>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await onConfirm();
              onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
          className="rounded-full border border-ink bg-dnd px-5 py-2.5 font-semibold text-sheet shadow-hard-sm disabled:opacity-50"
        >
          {busy ? "Só um segundo…" : action}
        </button>
      </div>
    </Modal>
  );
}
