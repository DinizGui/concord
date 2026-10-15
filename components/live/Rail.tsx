"use client";

import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { isUnread, mentionCount, useStore } from "@/lib/client/store";
import { colorFor, initialsOf } from "./ui";

function Item({
  active,
  label,
  pill,
  badge,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  pill?: boolean;
  badge?: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="group relative flex w-full justify-center">
      <motion.span
        className="absolute left-0 top-1/2 w-1 -translate-y-1/2 rounded-r bg-sheet"
        initial={false}
        animate={{ height: active ? 36 : pill ? 8 : 0, opacity: active || pill ? 1 : 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
      />
      <button
        aria-label={label}
        onClick={onClick}
        className={`relative flex h-12 w-12 items-center justify-center transition-[border-radius] duration-200 ${
          active ? "rounded-[14px]" : "rounded-[24px] group-hover:rounded-[14px]"
        }`}
      >
        {children}
        {!!badge && (
          <span className="absolute -right-1 -bottom-1 flex h-5 min-w-5 items-center justify-center rounded-full border-[3px] border-ink bg-signal px-1 font-mono text-[10px] font-bold text-sheet">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </button>
      <span className="pointer-events-none absolute left-[68px] top-1/2 z-50 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-ink bg-sheet px-2.5 py-1.5 text-sm font-semibold text-ink shadow-hard-sm group-hover:block">
        {label}
      </span>
    </div>
  );
}

export function Rail({ active, onSelect, onAdd }: { active: string; onSelect: (id: string) => void; onAdd: () => void }) {
  const { state } = useStore();
  const dmMentions = Object.values(state.dms).reduce((n, c) => n + mentionCount(state, c.id), 0);

  return (
    <nav className="scroll-ink flex w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-ink py-3">
      <Item active={active === "home"} label="Mensagens diretas" onClick={() => onSelect("home")} badge={dmMentions}>
        <span
          className={`flex h-full w-full items-center justify-center rounded-[inherit] transition-colors ${
            active === "home" ? "bg-signal" : "bg-ink-2 hover:bg-signal"
          }`}
        >
          <LogoMark size={28} inverted />
        </span>
      </Item>

      <span className="my-1 h-0.5 w-8 rounded bg-ink-3" />

      {state.guildOrder.map((id) => {
        const g = state.guilds[id];
        if (!g) return null;
        const text = g.channels.filter((c) => c.type === 0);
        const unread = text.some((c) => isUnread(state, c));
        const mentions = text.reduce((n, c) => n + mentionCount(state, c.id), 0);
        const color = colorFor(g.id);
        const on = active === g.id;
        return (
          <Item key={id} active={on} label={g.name} pill={unread} badge={mentions} onClick={() => onSelect(g.id)}>
            {g.icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={g.icon} alt="" className="h-full w-full rounded-[inherit] object-cover" />
            ) : (
              <span
                className="flex h-full w-full items-center justify-center rounded-[inherit] font-display text-[15px] font-bold"
                style={{ background: on ? color : "var(--color-ink-2)", color: on ? "var(--color-sheet)" : color }}
              >
                {initialsOf(g.name)}
              </span>
            )}
          </Item>
        );
      })}

      <Item active={false} label="Criar ou entrar num servidor" onClick={onAdd}>
        <span className="flex h-full w-full items-center justify-center rounded-[inherit] bg-ink-2 text-online transition-colors hover:bg-online hover:text-sheet">
          <Plus size={22} />
        </span>
      </Item>
    </nav>
  );
}
