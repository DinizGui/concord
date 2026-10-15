"use client";

import { useEffect } from "react";
import { Crown } from "lucide-react";
import { displayName, statusOf, useStore } from "@/lib/client/store";
import type { ApiGuild, ApiMember } from "@/lib/client/types";
import { UserAvatar } from "./ui";

export function Members({ guild, onDm }: { guild: ApiGuild; onDm: (userId: string) => void }) {
  const { state, loadMembers } = useStore();
  const members = state.members[guild.id];

  useEffect(() => {
    if (!members) loadMembers(guild.id).catch(() => {});
  }, [guild.id, members, loadMembers]);

  const list = Object.values(members ?? {});
  const hoisted = [...guild.roles].filter((r) => r.hoist && r.id !== guild.id).sort((a, b) => b.position - a.position);

  // separa por cargo em destaque (hoist); quem não tem vai pra Online/Offline
  const groups: { title: string; color?: string; items: ApiMember[] }[] = [];
  const used = new Set<string>();
  const online = (m: ApiMember) => statusOf(state, m.user!.id) !== "offline";
  for (const role of hoisted) {
    const items = list.filter((m) => !used.has(m.user!.id) && online(m) && m.roles.includes(role.id));
    items.forEach((m) => used.add(m.user!.id));
    if (items.length) groups.push({ title: role.name, items });
  }
  const rest = list.filter((m) => !used.has(m.user!.id));
  groups.push({ title: "Online", items: rest.filter(online) });
  groups.push({ title: "Offline", items: rest.filter((m) => !online(m)) });

  return (
    <aside className="scroll-thin hidden w-60 shrink-0 overflow-y-auto border-l border-ink/15 bg-paper-2 px-2 pb-4 lg:block">
      {!members && <p className="px-2 pt-5 text-sm text-muted">Carregando membros…</p>}
      {groups
        .filter((g) => g.items.length)
        .map((g) => (
          <div key={g.title}>
            <h3 className="px-2 pb-1 pt-5 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">
              {g.title} · {g.items.length}
            </h3>
            <ul>
              {g.items
                .sort((a, b) => displayName(state.users[a.user!.id]).localeCompare(displayName(state.users[b.user!.id])))
                .map((m) => {
                  const u = state.users[m.user!.id] ?? m.user!;
                  const st = statusOf(state, u.id);
                  const custom = state.presences[u.id]?.custom_status;
                  const top = guild.roles
                    .filter((r) => m.roles.includes(r.id) && r.color)
                    .sort((a, b) => b.position - a.position)[0];
                  return (
                    <li key={u.id}>
                      <button
                        onClick={() => u.id !== state.me?.id && onDm(u.id)}
                        className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-paper-3/60 ${st === "offline" ? "opacity-50" : ""}`}
                      >
                        <UserAvatar user={u} size={32} status={st} ring="border-paper-2" />
                        <span className="min-w-0 leading-tight">
                          <span className="flex items-center gap-1.5">
                            <span
                              className="truncate text-[15px] font-medium"
                              style={top ? { color: `#${top.color.toString(16).padStart(6, "0")}` } : undefined}
                            >
                              {m.nick || displayName(u)}
                            </span>
                            {guild.owner_id === u.id && <Crown size={13} className="shrink-0 text-mustard" aria-label="Dono" />}
                          </span>
                          {custom && st !== "offline" && <span className="block truncate text-xs text-muted">{custom}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
    </aside>
  );
}
