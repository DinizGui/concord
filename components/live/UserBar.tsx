"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Headphones, HeadphoneOff, LogOut, Mic, MicOff, Settings } from "lucide-react";
import { api } from "@/lib/client/api";
import { displayName, statusOf, useStore } from "@/lib/client/store";
import type { Status } from "@/lib/client/types";
import { STATUS_PT, UserAvatar } from "./ui";

const CHOICES: Status[] = ["online", "idle", "dnd", "invisible"];

export function UserBar({
  muted,
  deaf,
  onMute,
  onDeaf,
  onSettings,
}: {
  muted: boolean;
  deaf: boolean;
  onMute: () => void;
  onDeaf: () => void;
  onSettings: () => void;
}) {
  const { state, dispatch, gatewaySend } = useStore();
  const [menu, setMenu] = useState(false);
  const me = state.me;
  const btn = "flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-paper-3 hover:text-ink";

  async function pick(status: Status) {
    setMenu(false);
    dispatch({ type: "MY_STATUS", status });
    await gatewaySend(3, { status }).catch(() => {});
  }

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    window.location.assign("/login");
  }

  return (
    <div className="relative flex h-[58px] shrink-0 items-center gap-1 border-t border-ink/15 bg-paper-3/60 px-2">
      <AnimatePresence>
        {menu && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="absolute bottom-[62px] left-2 z-50 w-56 rounded-xl border border-ink bg-sheet p-1.5 shadow-hard"
          >
            {CHOICES.map((s) => (
              <button
                key={s}
                onClick={() => pick(s)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-paper-2 ${
                  state.myStatus === s ? "font-semibold" : ""
                }`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${s === "online" ? "bg-online" : s === "idle" ? "bg-idle" : s === "dnd" ? "bg-dnd" : "bg-faint"}`} />
                {STATUS_PT[s]}
              </button>
            ))}
            <span className="my-1 block h-px bg-ink/15" />
            <button onClick={logout} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-dnd hover:bg-dnd/10">
              <LogOut size={15} /> Sair da conta
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <button onClick={() => setMenu((v) => !v)} className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-paper-3">
        <UserAvatar user={me ?? undefined} size={34} status={me ? statusOf(state, me.id) : undefined} ring="border-paper-3" />
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold">{displayName(me)}</span>
          <span className="block truncate text-xs text-muted">
            {state.conn === "ready" ? STATUS_PT[state.myStatus] : "Reconectando…"}
          </span>
        </span>
      </button>
      <button className={btn} aria-label={muted ? "Ativar microfone" : "Silenciar"} onClick={onMute}>
        {muted ? <MicOff size={18} className="text-dnd" /> : <Mic size={18} />}
      </button>
      <button className={btn} aria-label={deaf ? "Voltar a ouvir" : "Ensurdecer"} onClick={onDeaf}>
        {deaf ? <HeadphoneOff size={18} className="text-dnd" /> : <Headphones size={18} />}
      </button>
      <button className={btn} aria-label="Configurações" onClick={onSettings}>
        <Settings size={18} />
      </button>
    </div>
  );
}
