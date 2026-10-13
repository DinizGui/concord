"use client";

import { motion } from "framer-motion";
import { Compass, Plus } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import type { Server } from "@/lib/data";

type Props = {
  servers: Server[];
  active: string; // "home" ou id do servidor
  onSelect: (id: string) => void;
};

function RailButton({
  active,
  label,
  onClick,
  children,
  pill,
  badge,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  pill?: boolean;
  badge?: number;
}) {
  return (
    <div className="group relative flex w-full justify-center">
      {/* marcador lateral */}
      <motion.span
        className="absolute left-0 top-1/2 w-1 -translate-y-1/2 rounded-r bg-sheet"
        initial={false}
        animate={{ height: active ? 36 : pill ? 8 : 0, opacity: active || pill ? 1 : 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
      />
      <button
        aria-label={label}
        onClick={onClick}
        className={`relative flex h-12 w-12 items-center justify-center overflow-visible transition-[border-radius] duration-200 ${
          active ? "rounded-[14px]" : "rounded-[24px] group-hover:rounded-[14px]"
        }`}
      >
        {children}
        {!!badge && (
          <span className="absolute -right-1 -bottom-1 flex h-5 min-w-5 items-center justify-center rounded-full border-[3px] border-ink bg-signal px-1 font-mono text-[10px] font-bold text-sheet">
            {badge}
          </span>
        )}
      </button>
      <span className="pointer-events-none absolute left-[68px] top-1/2 z-50 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-ink bg-sheet px-2.5 py-1.5 text-sm font-semibold text-ink shadow-hard-sm group-hover:block">
        {label}
      </span>
    </div>
  );
}

export function ServerRail({ servers, active, onSelect }: Props) {
  return (
    <nav className="scroll-ink flex w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-ink py-3">
      <RailButton active={active === "home"} label="Mensagens diretas" onClick={() => onSelect("home")}>
        <span
          className={`flex h-full w-full items-center justify-center rounded-[inherit] transition-colors ${
            active === "home" ? "bg-signal" : "bg-ink-2 hover:bg-signal"
          }`}
        >
          <LogoMark size={28} inverted />
        </span>
      </RailButton>

      <span className="my-1 h-0.5 w-8 rounded bg-ink-3" />

      {servers.map((s) => (
        <RailButton
          key={s.id}
          active={active === s.id}
          label={s.name}
          onClick={() => onSelect(s.id)}
          pill={s.unread || !!s.mentions}
          badge={s.mentions}
        >
          <span
            className="flex h-full w-full items-center justify-center rounded-[inherit] font-display text-[15px] font-bold text-sheet"
            style={{ background: active === s.id ? s.color : "var(--color-ink-2)" }}
          >
            <span style={{ color: active === s.id ? "var(--color-sheet)" : s.color }}>{s.short}</span>
          </span>
        </RailButton>
      ))}

      <RailButton active={false} label="Criar servidor" onClick={() => {}}>
        <span className="flex h-full w-full items-center justify-center rounded-[inherit] bg-ink-2 text-online transition-colors hover:bg-online hover:text-sheet">
          <Plus size={22} />
        </span>
      </RailButton>
      <RailButton active={false} label="Explorar comunidades" onClick={() => {}}>
        <span className="flex h-full w-full items-center justify-center rounded-[inherit] bg-ink-2 text-online transition-colors hover:bg-online hover:text-sheet">
          <Compass size={22} />
        </span>
      </RailButton>
    </nav>
  );
}
