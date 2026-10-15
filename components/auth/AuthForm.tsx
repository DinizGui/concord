"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { api, ClientError } from "@/lib/client/api";

type Field = { name: string; label: string; type?: string; autoComplete?: string; hint?: string };

const LOGIN: Field[] = [
  { name: "login", label: "E-mail ou usuário", autoComplete: "username" },
  { name: "password", label: "Senha", type: "password", autoComplete: "current-password" },
];

const REGISTER: Field[] = [
  { name: "email", label: "E-mail", type: "email", autoComplete: "email" },
  { name: "global_name", label: "Nome que aparece", autoComplete: "nickname", hint: "Pode ter espaço e acento." },
  { name: "username", label: "Nome de usuário", autoComplete: "username", hint: "Letras minúsculas, números, ponto e _." },
  { name: "password", label: "Senha", type: "password", autoComplete: "new-password", hint: "Mínimo de 8 caracteres." },
];

export function nextUrl() {
  if (typeof window === "undefined") return "/app";
  const next = new URLSearchParams(window.location.search).get("next");
  // só caminhos internos
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/app";
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const fields = mode === "login" ? LOGIN : REGISTER;
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setGeneral("");
    try {
      const body = { ...values };
      if (mode === "register" && !body.global_name) delete body.global_name;
      await api(`/auth/${mode}`, { body });
      window.location.assign(nextUrl());
    } catch (err) {
      const e = err as ClientError;
      if (Object.keys(e.fields ?? {}).length) setErrors(e.fields);
      else setGeneral(e.message);
      setBusy(false);
    }
  }

  const alt = mode === "login" ? "/register" : "/login";

  return (
    <div className="grain flex min-h-dvh flex-col bg-paper">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" aria-label="Concord, início">
          <Logo />
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md rounded-2xl border border-ink bg-sheet p-7 shadow-hard sm:p-9">
          <h1 className="font-display text-4xl font-extrabold tracking-tight">
            {mode === "login" ? (
              <>
                Que bom te <span className="font-serif font-normal italic text-signal">ver.</span>
              </>
            ) : (
              <>
                Cria sua <span className="font-serif font-normal italic text-signal">conta.</span>
              </>
            )}
          </h1>
          <p className="mt-1 text-ink-3">{mode === "login" ? "Entra pra ver sua galera." : "Leva menos de um minuto."}</p>

          <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
            {fields.map((f) => (
              <label key={f.name} className="block">
                <span className={`font-mono text-[11px] font-semibold uppercase tracking-wider ${errors[f.name] ? "text-dnd" : "text-muted"}`}>
                  {f.label}
                  {errors[f.name] && <span className="normal-case tracking-normal"> · {errors[f.name]}</span>}
                </span>
                <input
                  name={f.name}
                  type={f.type ?? "text"}
                  autoComplete={f.autoComplete}
                  value={values[f.name] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  className={`mt-1.5 w-full rounded-lg border bg-paper px-3 py-2.5 text-[15px] outline-none transition-shadow focus:shadow-hard-sm ${
                    errors[f.name] ? "border-dnd" : "border-ink"
                  }`}
                />
                {f.hint && !errors[f.name] && <span className="mt-1 block text-xs text-faint">{f.hint}</span>}
              </label>
            ))}

            {mode === "login" && (
              <Link href="/forgot" className="block text-sm text-signal-ink underline-offset-2 hover:underline">
                Esqueceu a senha?
              </Link>
            )}

            {general && <p className="rounded-lg border border-dnd bg-dnd/10 px-3 py-2 text-sm text-dnd">{general}</p>}

            <button
              disabled={busy}
              className="group flex w-full items-center justify-center gap-2 rounded-full border border-ink bg-signal px-6 py-3.5 font-semibold text-sheet shadow-hard transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-hard-sm disabled:opacity-60"
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : null}
              {mode === "login" ? "Entrar" : "Criar conta"}
              {!busy && <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            {mode === "login" ? "Ainda não tem conta? " : "Já tem conta? "}
            <a
              href={alt}
              onClick={(e) => {
                // leva o ?next= junto
                e.preventDefault();
                window.location.assign(`${alt}${window.location.search}`);
              }}
              className="font-semibold text-ink underline-offset-2 hover:underline"
            >
              {mode === "login" ? "Criar agora" : "Entrar"}
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
