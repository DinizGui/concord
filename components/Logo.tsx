type Props = { size?: number; className?: string; inverted?: boolean };

// dois círculos que se encontram: o "acordo"
export function LogoMark({ size = 28, className, inverted }: Props) {
  const ink = inverted ? "var(--color-sheet)" : "var(--color-ink)";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="12" cy="16" r="9" fill="none" stroke={ink} strokeWidth="2.4" />
      <circle cx="20" cy="16" r="9" fill="none" stroke={ink} strokeWidth="2.4" />
      <path d="M16 8.6a9 9 0 0 1 0 14.8a9 9 0 0 1 0-14.8z" fill="var(--color-signal)" />
    </svg>
  );
}

export function Logo({ size = 28, className, inverted }: Props) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <LogoMark size={size} inverted={inverted} />
      <span className="font-display text-[1.35rem] font-extrabold tracking-tight">concord</span>
    </span>
  );
}
