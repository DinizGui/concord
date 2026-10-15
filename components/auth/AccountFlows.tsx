"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { api, type ClientError } from "@/lib/client/api";

function Shell({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <div className="grain flex min-h-dvh flex-col bg-paper">
      <header className="mx-auto flex w-full max-w-6xl items-center px-4 py-5 sm:px-6">
        <Link href="/" aria-label="Concord, início">
          <Logo />
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md rounded-2xl border border-ink bg-sheet p-7 shadow-hard sm:p-9">
          <h1 className="font-display text-4xl font-extrabold tracking-tight">
            {title} <span className="font-serif font-normal italic text-signal">{accent}</span>
          </h1>
          {children}
        </div>
      </main>
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const { label, error, ...rest } = props;
  return (
    <label className="block">
      <span className={`font-mono text-[11px] font-semibold uppercase tracking-wider ${error ? "text-dnd" : "text-muted"}`}>
        {label}
        {error && <span className="normal-case tracking-normal"> · {error}</span>}
      </span>
      <input
        {...rest}
        className={`mt-1.5 w-full rounded-lg border bg-paper px-3 py-2.5 text-[15px] outline-none focus:shadow-hard-sm ${error ? "border-dnd" : "border-ink"}`}
      />
    </label>
  );
}

function Submit({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <button
      disabled={busy}
      className="group flex w-full items-center justify-center gap-2 rounded-full border border-ink bg-signal px-6 py-3.5 font-semibold text-sheet shadow-hard transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-hard-sm disabled:opacity-60"
    >
      {busy && <Loader2 size={18} className="animate-spin" />}
      {children}
      {!busy && <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />}
    </button>
  );
}

function tokenFromUrl() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("token") ?? "";
}

export function ForgotFlow() {
  const [login, setLogin] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/forgot", { body: { login: login.trim() } });
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="Esqueceu a" accent="senha?">
      {sent ? (
        <>
          <p className="mt-3 text-ink-3">
            Se existir conta com <b className="text-ink">{login}</b>, o link pra trocar a senha já está chegando. Olha também o spam.
          </p>
          <Link href="/login" className="mt-6 inline-block font-semibold underline-offset-2 hover:underline">
            Voltar pro login
          </Link>
        </>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <p className="text-ink-3">Fala teu e-mail ou usuário que a gente manda um link.</p>
          <Input label="E-mail ou usuário" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoFocus />
          {error && <p className="text-sm text-dnd">{error}</p>}
          <Submit busy={busy}>Mandar link</Submit>
          <Link href="/login" className="block text-center text-sm text-muted hover:text-ink">
            Lembrei, voltar
          </Link>
        </form>
      )}
    </Shell>
  );
}

export function ResetFlow() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setErrors({ confirm: "As senhas não batem." });
    setBusy(true);
    setErrors({});
    try {
      await api("/auth/reset", { body: { token: tokenFromUrl(), password } });
      setDone(true);
    } catch (err) {
      const e = err as ClientError;
      setErrors(Object.keys(e.fields ?? {}).length ? e.fields : { _: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="Senha" accent="nova.">
      {done ? (
        <>
          <p className="mt-3 text-ink-3">Pronto, senha trocada. Por segurança, saímos de todos os aparelhos.</p>
          <Link
            href="/login"
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-ink bg-signal px-6 py-3 font-semibold text-sheet shadow-hard-sm"
          >
            Entrar <ArrowRight size={18} />
          </Link>
        </>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Input label="Nova senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" error={errors.password} autoFocus />
          <Input label="Repete a senha" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" error={errors.confirm} />
          {(errors.token || errors._) && (
            <p className="rounded-lg border border-dnd bg-dnd/10 px-3 py-2 text-sm text-dnd">
              {errors.token ?? errors._}{" "}
              {errors.token && (
                <Link href="/forgot" className="font-semibold underline">
                  Pedir outro
                </Link>
              )}
            </p>
          )}
          <Submit busy={busy}>Salvar senha</Submit>
        </form>
      )}
    </Shell>
  );
}

export function VerifyFlow() {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    api("/auth/verify", { body: { token: tokenFromUrl() } })
      .then(() => setState("ok"))
      .catch(() => setState("error"));
  }, []);

  return (
    <Shell title={state === "error" ? "Link" : "E-mail"} accent={state === "error" ? "vencido." : state === "ok" ? "confirmado." : "…"}>
      {state === "loading" && <Loader2 className="mt-6 animate-spin text-muted" />}
      {state === "ok" && <p className="mt-3 text-ink-3">Valeu! Sua conta está confirmada.</p>}
      {state === "error" && <p className="mt-3 text-ink-3">Esse link já foi usado ou venceu. Pede outro dentro do app.</p>}
      {state !== "loading" && (
        <Link
          href="/app"
          className="mt-6 inline-flex items-center gap-2 rounded-full border border-ink bg-signal px-6 py-3 font-semibold text-sheet shadow-hard-sm"
        >
          Abrir o Concord <ArrowRight size={18} />
        </Link>
      )}
    </Shell>
  );
}
