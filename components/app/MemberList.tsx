import { USERS, type Server } from "@/lib/data";
import { Avatar } from "./Avatar";

export function MemberList({ server }: { server: Server }) {
  return (
    <aside className="scroll-thin hidden w-60 shrink-0 overflow-y-auto border-l border-ink/15 bg-paper-2 px-2 pb-4 lg:block">
      {server.roles.map((role) => (
        <div key={role.name}>
          <h3 className="px-2 pb-1 pt-5 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">
            {role.name} · {role.members.length}
          </h3>
          <ul>
            {role.members.map((id) => {
              const u = USERS[id];
              const off = u.status === "offline";
              return (
                <li key={id}>
                  <button className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-paper-3/60 ${off ? "opacity-50" : ""}`}>
                    <Avatar user={u} size={32} showStatus ring="border-paper-2" />
                    <span className="min-w-0 leading-tight">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[15px] font-medium">{u.name}</span>
                        {u.role === "bot" && (
                          <span className="rounded border border-ink px-1 font-mono text-[9px] font-bold uppercase leading-4">bot</span>
                        )}
                      </span>
                      {u.activity && !off && <span className="block truncate text-xs text-muted">{u.activity}</span>}
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
