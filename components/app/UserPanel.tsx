"use client";

import { useState } from "react";
import { Headphones, HeadphoneOff, Mic, MicOff, Settings } from "lucide-react";
import { ME } from "@/lib/data";
import { Avatar, statusLabel } from "./Avatar";

export function UserPanel() {
  const [muted, setMuted] = useState(false);
  const [deaf, setDeaf] = useState(false);

  const btn = "flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-paper-3 hover:text-ink";

  return (
    <div className="flex h-[58px] shrink-0 items-center gap-2 border-t border-ink/15 bg-paper-3/60 px-2">
      <button className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-paper-3">
        <Avatar user={ME} size={34} showStatus ring="border-paper-3" />
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold">{ME.name}</span>
          <span className="block truncate text-xs text-muted">{statusLabel[ME.status]}</span>
        </span>
      </button>
      <button className={btn} aria-label={muted ? "Ativar microfone" : "Silenciar"} onClick={() => setMuted((v) => !v)}>
        {muted ? <MicOff size={18} className="text-dnd" /> : <Mic size={18} />}
      </button>
      <button className={btn} aria-label={deaf ? "Voltar a ouvir" : "Ensurdecer"} onClick={() => setDeaf((v) => !v)}>
        {deaf ? <HeadphoneOff size={18} className="text-dnd" /> : <Headphones size={18} />}
      </button>
      <button className={btn} aria-label="Configurações">
        <Settings size={18} />
      </button>
    </div>
  );
}
