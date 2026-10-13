import type { Status, User } from "@/lib/data";

const statusColor: Record<Status, string> = {
  online: "bg-online",
  idle: "bg-idle",
  dnd: "bg-dnd",
  offline: "bg-faint",
};

export const statusLabel: Record<Status, string> = {
  online: "Disponível",
  idle: "Ausente",
  dnd: "Não perturbe",
  offline: "Offline",
};

export function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

type Props = {
  user: User;
  size?: number;
  showStatus?: boolean;
  ring?: string;
};

export function Avatar({ user, size = 40, showStatus = false, ring = "border-paper-2" }: Props) {
  const dot = Math.max(10, Math.round(size * 0.32));
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span
        className="flex h-full w-full items-center justify-center rounded-full font-display font-bold text-sheet"
        style={{ background: user.color, fontSize: size * 0.36, opacity: user.status === "offline" && showStatus ? 0.55 : 1 }}
      >
        {initials(user.name)}
      </span>
      {showStatus && (
        <span
          title={statusLabel[user.status]}
          className={`absolute -right-0.5 -bottom-0.5 rounded-full border-[3px] ${ring} ${statusColor[user.status]}`}
          style={{ width: dot, height: dot }}
        />
      )}
    </span>
  );
}
