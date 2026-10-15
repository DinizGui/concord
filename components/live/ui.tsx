"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect } from "react";
import type { ApiUser, Status } from "@/lib/client/types";

const PALETTE = [
  "var(--color-signal)",
  "var(--color-teal)",
  "var(--color-mustard)",
  "var(--color-lilac)",
  "var(--color-rose)",
  "var(--color-sky)",
  "var(--color-ink-3)",
];

export function colorFor(id: string | undefined) {
  if (!id) return PALETTE[6];
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0] ?? "").join("").toUpperCase() || "?";
}

const STATUS_BG: Record<Status, string> = {
  online: "bg-online",
  idle: "bg-idle",
  dnd: "bg-dnd",
  offline: "bg-faint",
  invisible: "bg-faint",
};

export const STATUS_PT: Record<Status, string> = {
  online: "Disponível",
  idle: "Ausente",
  dnd: "Não perturbe",
  offline: "Offline",
  invisible: "Invisível",
};

export function UserAvatar({
  user,
  size = 40,
  status,
  ring = "border-paper-2",
}: {
  user: ApiUser | undefined;
  size?: number;
  status?: Status;
  ring?: string;
}) {
  const name = user?.global_name || user?.username || "?";
  const dot = Math.max(10, Math.round(size * 0.32));
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {user?.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.avatar} alt="" className="h-full w-full rounded-full object-cover" />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center rounded-full font-display font-bold text-sheet"
          style={{ background: colorFor(user?.id), fontSize: size * 0.36 }}
        >
          {initialsOf(name)}
        </span>
      )}
      {status && (
        <span
          title={STATUS_PT[status]}
          className={`absolute -right-0.5 -bottom-0.5 rounded-full border-[3px] ${ring} ${STATUS_BG[status]}`}
          style={{ width: dot, height: dot }}
        />
      )}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/60 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal
            aria-label={title}
            initial={{ y: 16, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 16, scale: 0.98 }}
            className="scroll-thin max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-ink bg-sheet p-6 text-ink shadow-hard"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="font-display text-2xl font-extrabold">{title}</h2>
              <button aria-label="Fechar" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-paper-2 hover:text-ink">
                <X size={20} />
              </button>
            </div>
            <div className="mt-4">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Field({
  label,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <label className="block">
      <span className={`font-mono text-[11px] font-semibold uppercase tracking-wider ${error ? "text-dnd" : "text-muted"}`}>
        {label}
        {error && <span className="normal-case tracking-normal"> · {error}</span>}
      </span>
      <input
        {...props}
        className={`mt-1.5 w-full rounded-lg border bg-paper px-3 py-2.5 text-[15px] outline-none focus:shadow-hard-sm ${
          error ? "border-dnd" : "border-ink"
        }`}
      />
    </label>
  );
}

export function PrimaryButton({ busy, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      {...props}
      disabled={busy || props.disabled}
      className={`rounded-full border border-ink bg-signal px-5 py-2.5 font-semibold text-sheet shadow-hard-sm transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none disabled:opacity-50 ${
        props.className ?? ""
      }`}
    >
      {busy ? "Só um segundo…" : children}
    </button>
  );
}

export function GhostButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-full border border-ink/30 px-5 py-2.5 font-semibold text-ink-3 hover:border-ink hover:text-ink ${props.className ?? ""}`}
    />
  );
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function formatDay(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Hoje";
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
