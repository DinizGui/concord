"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { api } from "@/lib/client/api";
import { StoreProvider, useStore } from "@/lib/client/store";
import type { ApiChannel, ApiGuild } from "@/lib/client/types";
import { Chat } from "./Chat";
import { Friends } from "./Friends";
import { Members } from "./Members";
import {
  AddGuildModal,
  ConfirmModal,
  CreateChannelModal,
  GuildSettingsModal,
  InviteModal,
  NewDmModal,
  ProfileModal,
} from "./Modals";
import { Rail } from "./Rail";
import { GuildSidebar, HomeSidebar } from "./Sidebars";
import { UserBar } from "./UserBar";
import { VoicePanel } from "./Voice";

const NAV_KEY = "concord:nav";

type Nav = { place: string; channelByGuild: Record<string, string>; dm: string | null };

function loadNav(): Nav {
  try {
    const saved = JSON.parse(localStorage.getItem(NAV_KEY) ?? "null");
    if (saved && typeof saved.place === "string") return { channelByGuild: {}, dm: null, ...saved };
  } catch {}
  return { place: "home", channelByGuild: {}, dm: null };
}

export function LiveApp() {
  const goLogin = useCallback(() => {
    window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }, []);
  return (
    <StoreProvider onUnauthorized={goLogin}>
      <Shell />
    </StoreProvider>
  );
}

function Shell() {
  const { state, dispatch, gatewaySend } = useStore();
  // navegação lembrada entre visitas (e ?guild= vindo de um convite).
  // Lida já no estado inicial: o servidor só renderiza a tela de "Conectando", que não usa isso.
  const [nav, setNav] = useState<Nav>(() => {
    if (typeof window === "undefined") return { place: "home", channelByGuild: {}, dm: null };
    const saved = loadNav();
    const fromInvite = new URLSearchParams(window.location.search).get("guild");
    return fromInvite ? { ...saved, place: fromInvite } : saved;
  });
  const [drawer, setDrawer] = useState(false);
  const [membersOpen, setMembersOpen] = useState(true);
  const [addGuild, setAddGuild] = useState(false);
  const [newDm, setNewDm] = useState(false);
  const [profile, setProfile] = useState(false);
  const [invite, setInvite] = useState<ApiGuild | null>(null);
  const [settings, setSettings] = useState<ApiGuild | null>(null);
  const [leave, setLeave] = useState<ApiGuild | null>(null);
  const [createChannel, setCreateChannel] = useState<{ guild: ApiGuild; parentId: string | null; type: 0 | 2 | 4 } | null>(null);
  const [voiceSlot, setVoiceSlot] = useState<HTMLDivElement | null>(null);
  const [muted, setMuted] = useState(false);
  const [deaf, setDeaf] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("guild")) window.history.replaceState(null, "", "/app");
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(NAV_KEY, JSON.stringify(nav));
    } catch {}
  }, [nav]);

  const guild = nav.place !== "home" ? state.guilds[nav.place] : undefined;
  const textChannels = useMemo(
    () => (guild ? [...guild.channels].filter((c) => c.type === 0 || c.type === 5 || c.type === 11).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) : []),
    [guild],
  );
  const channel: ApiChannel | undefined = guild
    ? (textChannels.find((c) => c.id === nav.channelByGuild[guild.id]) ??
      textChannels.find((c) => c.id === guild.system_channel_id) ??
      textChannels.find((c) => c.type !== 11))
    : nav.dm
      ? state.dms[nav.dm]
      : undefined;

  // servidor sumiu (saiu, foi expulso, excluído): volta pra home
  useEffect(() => {
    if (state.conn === "ready" && nav.place !== "home" && !state.guilds[nav.place]) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reação a um evento do gateway
      setNav((n) => ({ ...n, place: "home" }));
    }
  }, [state.conn, state.guilds, nav.place]);

  const myVoice = useMemo(() => {
    for (const g of Object.values(state.guilds)) {
      const v = g.voice_states.find((x) => x.user_id === state.me?.id);
      if (v) return v;
    }
    return null;
  }, [state.guilds, state.me?.id]);

  const go = (patch: Partial<Nav>) => {
    setNav((n) => ({ ...n, ...patch }));
    setDrawer(false);
  };

  async function openDmWith(userId: string) {
    const existing = Object.values(state.dms).find((c) => c.type === 1 && c.recipients?.[0]?.id === userId);
    if (existing) return go({ place: "home", dm: existing.id });
    const c = await api<ApiChannel>("/users/@me/channels", { body: { recipient_id: userId } });
    dispatch({ type: "UPSERT_DM", channel: c });
    go({ place: "home", dm: c.id });
  }

  async function setVoice(channelId: string | null, opts: { mute?: boolean; deaf?: boolean } = {}) {
    const g = channelId ? Object.values(state.guilds).find((x) => x.channels.some((c) => c.id === channelId)) : undefined;
    await gatewaySend(4, {
      guild_id: g?.id ?? myVoice?.guild_id ?? null,
      channel_id: channelId,
      self_mute: opts.mute ?? muted,
      self_deaf: opts.deaf ?? deaf,
    }).catch(() => {});
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    if (!next && deaf) setDeaf(false);
    if (myVoice) setVoice(myVoice.channel_id, { mute: next, deaf: next ? deaf : false });
  }

  function toggleDeaf() {
    const next = !deaf;
    setDeaf(next);
    if (next) setMuted(true);
    if (myVoice) setVoice(myVoice.channel_id, { deaf: next, mute: next ? true : muted });
  }

  if (!state.me) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-ink text-sheet">
        <LogoMark size={56} inverted />
        <span className="flex items-center gap-2 font-mono text-sm text-faint">
          <Loader2 size={16} className="animate-spin" /> Conectando…
        </span>
      </div>
    );
  }

  const footer = (
    <>
      <div ref={setVoiceSlot} />
      <UserBar muted={muted} deaf={deaf} onMute={toggleMute} onDeaf={toggleDeaf} onSettings={() => setProfile(true)} />
    </>
  );

  const sidebar = guild ? (
    <GuildSidebar
      guild={guild}
      channelId={channel?.id ?? null}
      voiceChannelId={myVoice?.guild_id === guild.id ? myVoice.channel_id : null}
      onSelect={(id) => go({ channelByGuild: { ...nav.channelByGuild, [guild.id]: id } })}
      onVoice={(id) => setVoice(id === myVoice?.channel_id ? null : id)}
      onInvite={() => setInvite(guild)}
      onCreateChannel={(parentId, type) => setCreateChannel({ guild, parentId, type })}
      onLeave={() => setLeave(guild)}
      onSettings={() => setSettings(guild)}
      footer={footer}
    />
  ) : (
    <HomeSidebar
      view={nav.dm && state.dms[nav.dm] ? nav.dm : null}
      onFriends={() => go({ dm: null })}
      onDm={(id) => go({ dm: id })}
      onNewDm={() => setNewDm(true)}
      footer={footer}
    />
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-ink text-ink">
      <div
        className={`fixed inset-y-0 left-0 z-40 flex transition-transform duration-300 md:static md:translate-x-0 ${
          drawer ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Rail active={guild ? guild.id : "home"} onSelect={(id) => go({ place: id })} onAdd={() => setAddGuild(true)} />
        <div className="flex md:overflow-hidden md:rounded-tl-xl">{sidebar}</div>
      </div>
      {drawer && <button aria-label="Fechar menu" className="fixed inset-0 z-30 bg-ink/50 md:hidden" onClick={() => setDrawer(false)} />}

      <main className="flex min-w-0 flex-1 flex-col">
        {state.conn !== "ready" && (
          <div className="bg-mustard px-3 py-1 text-center text-xs font-semibold text-ink">Conexão caiu. Reconectando…</div>
        )}
        {state.me.verified === false && <VerifyBanner email={state.me.email} />}
        <div className="flex min-h-0 flex-1">
          {channel ? (
            <>
              <Chat
                key={channel.id}
                channel={channel}
                guild={guild}
                membersOpen={membersOpen}
                onToggleMembers={() => setMembersOpen((v) => !v)}
                onMenu={() => setDrawer(true)}
                onInvite={guild ? () => setInvite(guild) : undefined}
                onOpenChannel={(id) => guild && go({ channelByGuild: { ...nav.channelByGuild, [guild.id]: id } })}
              />
              {guild && membersOpen && <Members guild={guild} onDm={openDmWith} />}
            </>
          ) : guild ? (
            <EmptyGuild guild={guild} onCreate={() => setCreateChannel({ guild, parentId: null, type: 0 })} />
          ) : (
            <Friends onDm={openDmWith} onMenu={() => setDrawer(true)} />
          )}
        </div>
      </main>

      {/* fica fora das barras laterais pra chamada não cair ao trocar de tela */}
      <VoicePanel voice={myVoice} muted={muted} deaf={deaf} slot={voiceSlot} />

      <AddGuildModal open={addGuild} onClose={() => setAddGuild(false)} onDone={(id) => go({ place: id })} />
      <NewDmModal open={newDm} onClose={() => setNewDm(false)} onOpen={(id) => go({ place: "home", dm: id })} />
      <ProfileModal open={profile} onClose={() => setProfile(false)} />
      <InviteModal guild={invite} channelId={guild && channel?.guild_id === guild.id ? channel.id : null} onClose={() => setInvite(null)} />
      <GuildSettingsModal guild={settings} onClose={() => setSettings(null)} />
      <CreateChannelModal
        target={createChannel}
        onClose={() => setCreateChannel(null)}
        onCreated={(c) => c.type === 0 && c.guild_id && go({ channelByGuild: { ...nav.channelByGuild, [c.guild_id]: c.id } })}
      />
      <ConfirmModal
        open={!!leave}
        title={leave?.owner_id === state.me.id ? "Excluir servidor" : "Sair do servidor"}
        text={
          leave?.owner_id === state.me.id
            ? `Isso apaga o ${leave?.name} pra todo mundo, com canais e mensagens. Não tem volta.`
            : `Tem certeza que quer sair do ${leave?.name}? Pra voltar vai precisar de um convite.`
        }
        action={leave?.owner_id === state.me.id ? "Excluir" : "Sair"}
        onClose={() => setLeave(null)}
        onConfirm={async () => {
          if (!leave) return;
          await api(leave.owner_id === state.me!.id ? `/guilds/${leave.id}` : `/users/@me/guilds/${leave.id}`, { method: "DELETE" });
          dispatch({ type: "EVENT", t: "GUILD_DELETE", d: { id: leave.id } });
          go({ place: "home" });
        }}
      />
    </div>
  );
}

function VerifyBanner({ email }: { email?: string }) {
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className="flex items-center justify-center gap-3 border-b border-ink/15 bg-paper-2 px-3 py-1.5 text-xs text-ink-3">
      <span>
        Confirma teu e-mail{email ? <> (<b className="text-ink">{email}</b>)</> : null} pelo link que mandamos.
      </span>
      {status === "sent" ? (
        <span className="font-semibold text-online">Link reenviado.</span>
      ) : (
        <button
          className="font-semibold text-signal-ink underline-offset-2 hover:underline"
          onClick={() =>
            api("/auth/verify/send", { method: "POST" })
              .then(() => setStatus("sent"))
              .catch(() => setStatus("error"))
          }
        >
          {status === "error" ? "Tenta daqui a pouco" : "Reenviar"}
        </button>
      )}
      <button aria-label="Esconder aviso" className="text-faint hover:text-ink" onClick={() => setHidden(true)}>
        ×
      </button>
    </div>
  );
}

function EmptyGuild({ guild, onCreate }: { guild: ApiGuild; onCreate: () => void }) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center bg-sheet px-6 text-center">
      <span className="font-serif text-5xl italic text-faint">Silêncio por aqui.</span>
      <p className="mt-2 text-muted">O {guild.name} ainda não tem canal de texto que você consiga ver.</p>
      <button onClick={onCreate} className="mt-5 rounded-full border border-ink bg-signal px-5 py-2.5 font-semibold text-sheet shadow-hard-sm">
        Criar canal
      </button>
    </section>
  );
}
