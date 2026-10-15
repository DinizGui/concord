"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { api } from "@/lib/client/api";
import type { ApiInvite } from "@/lib/client/types";
import { colorFor, initialsOf } from "./ui";

export function InviteView() {
  const { code } = useParams<{ code: string }>();
  const [invite, setInvite] = useState<ApiInvite | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<ApiInvite>(`/invites/${encodeURIComponent(code)}?with_counts=true`)
      .then(setInvite)
      .catch((e) => setError(e.message));
  }, [code]);

  async function accept() {
    setBusy(true);
    setError("");
    try {
      const res = await api<ApiInvite>(`/invites/${encodeURIComponent(code)}`, { method: "POST" });
      window.location.assign(`/app?guild=${res.guild?.id ?? ""}`);
    } catch (e) {
      const err = e as { status?: number; message: string };
      if (err.status === 401) {
        window.location.assign(`/login?next=${encodeURIComponent(`/invite/${code}`)}`);
        return;
      }
      setError(err.message);
      setBusy(false);
    }
  }

  const g = invite?.guild;

  return (
    <div className="grain flex min-h-dvh flex-col bg-paper">
      <header className="mx-auto flex w-full max-w-6xl items-center px-4 py-5 sm:px-6">
        <Link href="/" aria-label="Concord, início">
          <Logo />
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md rounded-2xl border border-ink bg-sheet p-8 text-center shadow-hard">
          {!invite && !error && <Loader2 className="mx-auto animate-spin text-muted" />}
          {error && !invite && (
            <>
              <span className="font-serif text-5xl italic text-faint">Ih.</span>
              <h1 className="mt-2 font-display text-2xl font-extrabold">Esse convite não vale mais</h1>
              <p className="mt-1 text-muted">Pede um link novo pra quem te chamou.</p>
              <Link href="/app" className="mt-6 inline-block rounded-full border border-ink px-5 py-2.5 font-semibold">
                Ir pro Concord
              </Link>
            </>
          )}
          {invite && g && (
            <>
              <p className="text-sm text-muted">
                {invite.inviter ? (
                  <>
                    <b className="text-ink">{invite.inviter.global_name || invite.inviter.username}</b> te chamou pro
                  </>
                ) : (
                  "Você foi chamado pro"
                )}
              </p>
              <span
                className="mx-auto mt-4 flex h-20 w-20 items-center justify-center rounded-[22px] border border-ink font-display text-2xl font-extrabold text-sheet shadow-hard-sm"
                style={{ background: colorFor(g.id) }}
              >
                {initialsOf(g.name)}
              </span>
              <h1 className="mt-4 font-display text-3xl font-extrabold">{g.name}</h1>
              {g.description && <p className="mt-1 text-ink-3">{g.description}</p>}
              <p className="mt-3 flex items-center justify-center gap-4 font-mono text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-online" />
                  {invite.approximate_presence_count ?? 0} online
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-faint" />
                  {invite.approximate_member_count ?? 0} membros
                </span>
              </p>
              {error && <p className="mt-4 text-sm text-dnd">{error}</p>}
              <button
                onClick={accept}
                disabled={busy}
                className="mt-6 w-full rounded-full border border-ink bg-signal px-6 py-3.5 font-semibold text-sheet shadow-hard transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-hard-sm disabled:opacity-60"
              >
                {busy ? "Entrando…" : "Aceitar convite"}
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
