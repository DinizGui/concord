"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Trash2, Upload } from "lucide-react";
import { api } from "@/lib/client/api";
import { useStore } from "@/lib/client/store";
import { Perm, hasPerm, type ApiGuild } from "@/lib/client/types";
import { EmojiGlyph } from "./Emoji";
import { Field, GhostButton, PrimaryButton } from "./ui";

type Tab = "general" | "emojis" | "webhooks";

export function canOpenGuildSettings(g: ApiGuild) {
  return [Perm.MANAGE_GUILD, Perm.MANAGE_GUILD_EXPRESSIONS, Perm.MANAGE_WEBHOOKS].some((f) => hasPerm(g.permissions, f));
}

export function GuildSettingsTabs({ guild, onClose }: { guild: ApiGuild; onClose: () => void }) {
  const tabs = (
    [
      ["general", "Geral", Perm.MANAGE_GUILD],
      ["emojis", "Emojis", Perm.MANAGE_GUILD_EXPRESSIONS],
      ["webhooks", "Integrações", Perm.MANAGE_WEBHOOKS],
    ] as const
  ).filter(([, , flag]) => hasPerm(guild.permissions, flag));
  const [tab, setTab] = useState<Tab>(tabs[0]?.[0] ?? "general");

  return (
    <>
      <div className="mb-4 flex gap-1 rounded-full border border-ink p-1 text-sm font-semibold">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 rounded-full py-1.5 ${tab === id ? "bg-ink text-sheet" : "text-ink-3 hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "general" && <General guild={guild} onClose={onClose} />}
      {tab === "emojis" && <Emojis guild={guild} />}
      {tab === "webhooks" && <Webhooks guild={guild} />}
    </>
  );
}

function General({ guild, onClose }: { guild: ApiGuild; onClose: () => void }) {
  const [name, setName] = useState(guild.name);
  const [description, setDescription] = useState(guild.description ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/guilds/${guild.id}`, { method: "PATCH", body: { name: name.trim(), description: description.trim() || null } });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Nome" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
      <Field label="Descrição" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
      {error && <p className="text-sm text-dnd">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <GhostButton type="button" onClick={onClose}>
          Fechar
        </GhostButton>
        <PrimaryButton busy={busy} disabled={name.trim().length < 2}>
          Salvar
        </PrimaryButton>
      </div>
    </form>
  );
}

function Emojis({ guild }: { guild: ApiGuild }) {
  const { state } = useStore();
  const emojis = state.guilds[guild.id]?.emojis ?? [];
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    form.append("name", name.trim());
    form.append("image", file);
    try {
      await api(`/guilds/${guild.id}/emojis`, { body: form });
      setName("");
      setFile(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-sm text-ink-3">PNG, GIF, JPG ou WebP até 256 KB. Até 50 por servidor.</p>
      <form onSubmit={upload} className="mt-3 flex items-end gap-2">
        <div className="flex-1">
          <Field
            label="Nome"
            value={name}
            onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9_]/g, ""))}
            placeholder="festa"
            maxLength={32}
          />
        </div>
        <label className="flex h-[46px] cursor-pointer items-center gap-1.5 rounded-lg border border-ink bg-paper px-3 text-sm font-semibold hover:bg-paper-2">
          <Upload size={15} />
          {file ? "Trocar" : "Imagem"}
          <input
            type="file"
            accept="image/png,image/gif,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              if (f && !name) setName(f.name.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_]/g, "_").slice(0, 32));
            }}
          />
        </label>
        <PrimaryButton busy={busy} disabled={!file || name.trim().length < 2}>
          Subir
        </PrimaryButton>
      </form>
      {file && <p className="mt-1 truncate text-xs text-muted">{file.name}</p>}
      {error && <p className="mt-2 text-sm text-dnd">{error}</p>}

      <ul className="scroll-thin mt-4 max-h-64 space-y-1 overflow-y-auto">
        {emojis.map((e) => (
          <li key={e.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-paper">
            <EmojiGlyph value={`${e.name}:${e.id}`} size={28} />
            <span className="flex-1 font-mono text-sm">:{e.name}:</span>
            <button
              aria-label={`Apagar ${e.name}`}
              onClick={() => api(`/guilds/${guild.id}/emojis/${e.id}`, { method: "DELETE" }).catch((err) => setError(err.message))}
              className="rounded-md p-1.5 text-muted hover:bg-dnd/10 hover:text-dnd"
            >
              <Trash2 size={15} />
            </button>
          </li>
        ))}
        {!emojis.length && <li className="py-4 text-center text-sm text-faint">Nenhum emoji ainda.</li>}
      </ul>
    </div>
  );
}

type Hook = { id: string; channel_id: string; name: string; url?: string };

function Webhooks({ guild }: { guild: ApiGuild }) {
  const textChannels = guild.channels.filter((c) => c.type === 0);
  const [hooks, setHooks] = useState<Hook[] | null>(null);
  const [name, setName] = useState("Avisos do sistema");
  const [channelId, setChannelId] = useState(textChannels[0]?.id ?? "");
  const [fresh, setFresh] = useState<Hook | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Hook[]>(`/guilds/${guild.id}/webhooks`)
      .then(setHooks)
      .catch((e) => setError(e.message));
  }, [guild.id]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const hook = await api<Hook>(`/channels/${channelId}/webhooks`, { body: { name: name.trim() } });
      setFresh(hook);
      setHooks((h) => [...(h ?? []), hook]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await api(`/webhooks/${id}`, { method: "DELETE" }).catch((e) => setError(e.message));
    setHooks((h) => (h ?? []).filter((x) => x.id !== id));
    if (fresh?.id === id) setFresh(null);
  }

  return (
    <div>
      <p className="text-sm text-ink-3">Um webhook é um link secreto que posta mensagens num canal. Serve pra ligar outros sistemas.</p>
      <form onSubmit={create} className="mt-3 space-y-2">
        <Field label="Nome" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        <label className="block">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">Canal</span>
          <select
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-ink bg-paper px-3 py-2.5 text-[15px] outline-none"
          >
            {textChannels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex justify-end">
          <PrimaryButton busy={busy} disabled={!name.trim() || !channelId}>
            Criar webhook
          </PrimaryButton>
        </div>
      </form>

      {fresh?.url && (
        <div className="mt-3 rounded-lg border border-mustard bg-mustard/15 p-3">
          <p className="text-xs font-semibold">Copia agora: esse link não aparece de novo.</p>
          <div className="mt-2 flex items-center gap-2">
            <input readOnly value={fresh.url} className="min-w-0 flex-1 rounded border border-ink/20 bg-sheet px-2 py-1 font-mono text-xs" />
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(fresh.url!).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="flex items-center gap-1 rounded bg-ink px-2 py-1 text-xs font-semibold text-sheet"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-dnd">{error}</p>}

      <ul className="mt-4 space-y-1">
        {(hooks ?? []).map((h) => (
          <li key={h.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-paper">
            <span className="min-w-0 flex-1 leading-tight">
              <b className="block truncate text-sm">{h.name}</b>
              <span className="text-xs text-muted">#{guild.channels.find((c) => c.id === h.channel_id)?.name ?? "canal"}</span>
            </span>
            <button
              aria-label={`Apagar ${h.name}`}
              onClick={() => remove(h.id)}
              className="rounded-md p-1.5 text-muted hover:bg-dnd/10 hover:text-dnd"
            >
              <Trash2 size={15} />
            </button>
          </li>
        ))}
        {hooks && !hooks.length && <li className="py-4 text-center text-sm text-faint">Nenhum webhook ainda.</li>}
      </ul>
    </div>
  );
}
