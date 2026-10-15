"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Maximize2,
  Minimize2,
  MonitorUp,
  Video,
  VideoOff,
  Wifi,
  WifiOff,
} from "lucide-react";
import type {
  Participant,
  RemoteTrack,
  Room,
  Track as TrackT,
  VideoTrack,
} from "livekit-client";
import { api } from "@/lib/client/api";
import { displayName, useStore } from "@/lib/client/store";
import type { ApiVoiceState } from "@/lib/client/types";
import { UserAvatar } from "./ui";

type Tile = {
  identity: string;
  local: boolean;
  video: VideoTrack | null;
  screen: boolean;
  speaking: boolean;
  micOn: boolean;
};

// Mídia de voz/vídeo via LiveKit. O estado "quem está em qual canal" continua no gateway;
// aqui só a parte de áudio/vídeo, numa sala por canal.
export function VoicePanel({
  voice,
  muted,
  deaf,
  slot,
}: {
  voice: ApiVoiceState | null;
  muted: boolean;
  deaf: boolean;
  slot: HTMLElement | null; // onde os botões aparecem (rodapé da barra lateral)
}) {
  const { state } = useStore();
  const [room, setRoom] = useState<Room | null>(null);
  const [status, setStatus] = useState<
    "idle" | "connecting" | "connected" | "unavailable" | "error"
  >("idle");
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [camera, setCamera] = useState(false);
  const [screen, setScreen] = useState(false);
  const [open, setOpen] = useState(false);
  const [micBlocked, setMicBlocked] = useState(false);
  const audioBox = useRef<HTMLDivElement>(null);
  const deafRef = useRef(deaf);
  const channelId = voice?.channel_id ?? null;

  // conecta/desconecta conforme o canal de voz atual
  useEffect(() => {
    if (!channelId) return;
    let cancelled = false;
    let current: Room | null = null;

    (async () => {
      setStatus("connecting");
      let creds: { url: string; token: string };
      try {
        creds = await api("/voice/token", { method: "POST" });
      } catch (err) {
        if (!cancelled)
          setStatus(
            (err as { status?: number }).status === 503
              ? "unavailable"
              : "error",
          );
        return;
      }
      const { Room, RoomEvent, Track } = await import("livekit-client");
      if (cancelled) return;
      const r = new Room({ adaptiveStream: true, dynacast: true });
      current = r;

      const refresh = () => {
        const speaking = new Set(r.activeSpeakers.map((p) => p.identity));
        const toTile = (p: Participant, local: boolean): Tile => {
          const screenPub = p.getTrackPublication(Track.Source.ScreenShare);
          const camPub = p.getTrackPublication(Track.Source.Camera);
          const pub = screenPub?.videoTrack ? screenPub : camPub;
          return {
            identity: p.identity,
            local,
            video: (pub?.videoTrack as VideoTrack | undefined) ?? null,
            screen: !!screenPub?.videoTrack,
            speaking: speaking.has(p.identity),
            micOn: p.isMicrophoneEnabled,
          };
        };
        setTiles([
          toTile(r.localParticipant, true),
          ...[...r.remoteParticipants.values()].map((p) => toTile(p, false)),
        ]);
      };

      r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach() as HTMLAudioElement;
          el.muted = deafRef.current;
          audioBox.current?.appendChild(el);
        }
        refresh();
      });
      r.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach().forEach((el) => el.remove());
        refresh();
      });
      for (const ev of [
        RoomEvent.ParticipantConnected,
        RoomEvent.ParticipantDisconnected,
        RoomEvent.ActiveSpeakersChanged,
        RoomEvent.LocalTrackPublished,
        RoomEvent.LocalTrackUnpublished,
        RoomEvent.TrackMuted,
        RoomEvent.TrackUnmuted,
      ]) {
        r.on(ev, refresh);
      }
      r.on(RoomEvent.Disconnected, () => !cancelled && setStatus("error"));
      r.on(RoomEvent.Reconnecting, () => setStatus("connecting"));
      r.on(RoomEvent.Reconnected, () => setStatus("connected"));

      try {
        await r.connect(creds.url, creds.token);
        if (cancelled) return r.disconnect();
        // o microfone liga no efeito abaixo; não espera o pedido de permissão do navegador
        setRoom(r);
        setStatus("connected");
        refresh();
      } catch (err) {
        console.error("[concord] voz não conectou", err);
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      current?.disconnect();
      setRoom(null);
      setTiles([]);
      setCamera(false);
      setScreen(false);
      setStatus("idle");
    };
    // muted entra só na conexão; depois quem manda é o efeito abaixo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  // microfone (o navegador pede permissão na primeira vez)
  useEffect(() => {
    if (!room) return;
    room.localParticipant.setMicrophoneEnabled(!muted).then(
      () => setMicBlocked(false),
      () => setMicBlocked(!muted),
    );
  }, [room, muted]);

  // fone: silencia o áudio de todo mundo
  useEffect(() => {
    deafRef.current = deaf;
    audioBox.current
      ?.querySelectorAll("audio")
      .forEach((el) => (el.muted = deaf));
  }, [deaf]);

  async function toggleCamera() {
    if (!room) return;
    const next = !camera;
    await room.localParticipant.setCameraEnabled(next).then(
      () => setCamera(next),
      () => setCamera(false),
    );
    if (next) setOpen(true);
  }

  async function toggleScreen() {
    if (!room) return;
    const next = !screen;
    await room.localParticipant
      .setScreenShareEnabled(next, { audio: true })
      .then(
        () => setScreen(next),
        () => setScreen(false),
      );
    if (next) setOpen(true);
  }

  if (!voice) return <div ref={audioBox} className="hidden" />;

  const btn = (on: boolean) =>
    `flex h-8 flex-1 items-center justify-center rounded-md border ${on ? "border-ink bg-ink text-sheet" : "border-ink/20 text-ink-3 hover:border-ink hover:text-ink"} disabled:opacity-40`;
  const live = status === "connected";
  const anyVideo = tiles.some((t) => t.video);

  return (
    <>
      <div ref={audioBox} className="hidden" />
      {slot &&
        createPortal(
          <div className="border-t border-ink/15 bg-paper-3/40 px-2 py-2">
            <p className="mb-1.5 flex items-center gap-1.5 px-1 text-xs">
              {live ? (
                <Wifi size={13} className="text-online" />
              ) : (
                <WifiOff size={13} className="text-muted" />
              )}
              <span
                className={live ? "font-semibold text-online" : "text-muted"}
              >
                {status === "connecting"
                  ? "Conectando o áudio…"
                  : status === "unavailable"
                    ? "Áudio não configurado no servidor"
                    : status === "error"
                      ? "Áudio caiu. Sai e entra de novo."
                      : live
                        ? micBlocked
                      ? "Sem acesso ao microfone. Libera no navegador."
                      : `Áudio ligado · ${tiles.length} na sala`
                        : ""}
              </span>
            </p>
            <div className="flex gap-1.5">
              <button
                className={btn(camera)}
                disabled={!live}
                onClick={toggleCamera}
                aria-label={camera ? "Desligar câmera" : "Ligar câmera"}
              >
                {camera ? <VideoOff size={16} /> : <Video size={16} />}
              </button>
              <button
                className={btn(screen)}
                disabled={!live}
                onClick={toggleScreen}
                aria-label={
                  screen ? "Parar de compartilhar" : "Compartilhar tela"
                }
              >
                <MonitorUp size={16} />
              </button>
              <button
                className={btn(open)}
                disabled={!live}
                onClick={() => setOpen((v) => !v)}
                aria-label={open ? "Esconder chamada" : "Ver chamada"}
              >
                {open ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
            </div>
          </div>,
          slot,
        )}

      <AnimatePresence>
        {live && (open || anyVideo) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-4 right-4 z-[60] w-[min(92vw,420px)] rounded-2xl border border-ink bg-ink p-2 shadow-hard"
          >
            <div
              className={`grid gap-2 ${tiles.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}
            >
              {tiles.map((t) => (
                <TileView
                  key={t.identity}
                  tile={t}
                  name={t.local ? "Você" : displayName(state.users[t.identity])}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function TileView({ tile, name }: { tile: Tile; name: string }) {
  const { state } = useStore();
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    const track = tile.video as unknown as TrackT | null;
    if (!el || !track) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [tile.video]);

  return (
    <div
      className={`relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-ink-2 ${
        tile.speaking ? "ring-2 ring-online" : "ring-1 ring-ink-3"
      }`}
    >
      {tile.video ? (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted={tile.local}
          className={`h-full w-full ${tile.screen ? "object-contain" : "object-cover"}`}
        />
      ) : (
        <UserAvatar user={state.users[tile.identity]} size={48} />
      )}
      <span className="absolute bottom-1.5 left-1.5 rounded bg-ink/80 px-1.5 py-0.5 text-[11px] font-semibold text-sheet">
        {name}
        {!tile.micOn && " · mudo"}
      </span>
    </div>
  );
}
