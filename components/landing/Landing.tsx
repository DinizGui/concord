"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { ArrowRight, Download, Hash, Headphones, Lock, Mic, MonitorUp, Shield, Volume2 } from "lucide-react";
import { Logo, LogoMark } from "@/components/Logo";
import { ConcordApp } from "@/components/app/ConcordApp";
import { Avatar } from "@/components/app/Avatar";
import { USERS } from "@/lib/data";
import { SmoothScroll } from "./SmoothScroll";

const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
};

export function Landing() {
  return (
    <div className="bg-paper text-ink">
      <SmoothScroll />
      <Nav />
      <Hero />
      <Strip />
      <Features />
      <ForWho />
      <Quote />
      <FinalCta />
      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-ink bg-paper/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="Concord, início">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-8 text-[15px] font-medium md:flex">
          <a href="#recursos" className="hover:text-signal">Recursos</a>
          <a href="#pra-quem" className="hover:text-signal">Pra quem é</a>
          <a href="#seguranca" className="hover:text-signal">Segurança</a>
        </nav>
        <Link
          href="/app"
          className="rounded-full border border-ink bg-ink px-4 py-2 text-sm font-semibold text-sheet transition-transform hover:-translate-y-0.5"
        >
          Entrar
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const rotate = useTransform(scrollYProgress, [0, 0.5], [4, 0]);
  const y = useTransform(scrollYProgress, [0, 0.5], [60, 0]);

  return (
    <section className="grain relative overflow-hidden border-b border-ink">
      <div className="mx-auto max-w-7xl px-4 pb-16 pt-14 sm:px-6 md:pt-20">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 rounded-full border border-ink bg-sheet px-3 py-1 font-mono text-xs"
        >
          <span className="h-2 w-2 rounded-full bg-online" />
          1.284 pessoas conversando agora
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 max-w-5xl font-display text-[clamp(3rem,9vw,7.5rem)] font-extrabold leading-[0.92] tracking-[-0.035em]"
        >
          Seu grupo,{" "}
          <span className="font-serif font-normal italic tracking-normal text-signal">num lugar</span> só.
        </motion.h1>

        <div className="mt-8 flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="max-w-xl text-lg leading-relaxed text-ink-3"
          >
            Servidores com canais de texto e voz, conversa direta e chamada de vídeo. Pra galera do jogo, do trabalho ou da família.
          </motion.p>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="flex flex-wrap gap-3"
          >
            <Link
              href="/app"
              className="group inline-flex items-center gap-2 rounded-full border border-ink bg-signal px-6 py-3.5 font-semibold text-sheet shadow-hard transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-hard-sm"
            >
              Abrir no navegador
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
            </Link>
            <a
              href="#baixar"
              className="inline-flex items-center gap-2 rounded-full border border-ink bg-sheet px-6 py-3.5 font-semibold transition-colors hover:bg-paper-2"
            >
              <Download size={18} />
              Baixar pra Windows
            </a>
          </motion.div>
        </div>

        {/* app de verdade, dá pra clicar */}
        <motion.div ref={ref} style={{ rotate, y }} className="mt-14 hidden md:block">
          <div className="overflow-hidden rounded-2xl border border-ink bg-ink shadow-[10px_10px_0_0_var(--color-ink)]">
            <div className="flex h-8 items-center gap-1.5 border-b border-ink-3 px-3">
              <span className="h-2.5 w-2.5 rounded-full bg-signal" />
              <span className="h-2.5 w-2.5 rounded-full bg-mustard" />
              <span className="h-2.5 w-2.5 rounded-full bg-online" />
              <span className="ml-3 font-mono text-[11px] text-faint">concord / Estúdio Solid / #geral</span>
              <span className="ml-auto font-mono text-[11px] text-faint">pode clicar, é o app mesmo</span>
            </div>
            <div className="h-[640px]">
              <ConcordApp embedded />
            </div>
          </div>
        </motion.div>

        <MobilePreview />
      </div>
    </section>
  );
}

function MobilePreview() {
  return (
    <div className="mt-12 rounded-2xl border border-ink bg-sheet p-4 shadow-hard md:hidden">
      <div className="flex items-center gap-2 border-b border-ink/15 pb-3 font-display font-bold">
        <Hash size={18} className="text-muted" /> geral
      </div>
      {[
        ["ana", "Subi a nova versão do hero."],
        ["caio", "Ficou bem melhor. Só o botão que tá grande."],
        ["me", "Reduz uns 8px e manda."],
      ].map(([id, text]) => (
        <div key={text} className="mt-3 flex gap-3">
          <Avatar user={USERS[id]} size={34} />
          <div className="leading-snug">
            <p className="text-sm font-semibold">{USERS[id].name}</p>
            <p className="text-sm text-ink-3">{text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function Strip() {
  const words = ["canais de texto", "voz sem atraso", "vídeo em grupo", "tela compartilhada", "cargos e permissões", "bots", "conversa direta", "reações"];
  const row = [...words, ...words];
  return (
    <div className="overflow-hidden border-b border-ink bg-ink py-4 text-sheet">
      <div className="marquee flex w-max gap-10 whitespace-nowrap">
        {row.map((w, i) => (
          <span key={i} className="flex items-center gap-10 font-display text-2xl font-bold">
            {w}
            <LogoMark size={22} inverted />
          </span>
        ))}
      </div>
    </div>
  );
}

function Features() {
  return (
    <section id="recursos" className="border-b border-ink">
      <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <motion.div {...reveal} className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <h2 className="max-w-2xl font-display text-5xl font-extrabold leading-[0.95] tracking-tight md:text-6xl">
            Tudo que a conversa <span className="font-serif font-normal italic">pede.</span>
          </h2>
          <p className="max-w-sm text-ink-3">Texto pra organizar, voz pra resolver rápido e vídeo quando precisa ver a cara da galera.</p>
        </motion.div>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          <FeatureCard n="01" title="Canais que organizam" text="Separe o papo por assunto. Avisos num canto, memes no outro.">
            <div className="space-y-1.5">
              {[
                { n: "avisos", on: false },
                { n: "geral", on: true },
                { n: "design", on: false, badge: 2 },
                { n: "memes", on: false },
              ].map((c) => (
                <div
                  key={c.n}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${c.on ? "bg-paper-3 font-semibold" : "text-muted"}`}
                >
                  <Hash size={15} /> {c.n}
                  {c.badge && <span className="ml-auto rounded-full bg-signal px-1.5 font-mono text-[10px] font-bold text-sheet">{c.badge}</span>}
                </div>
              ))}
            </div>
          </FeatureCard>

          <FeatureCard n="02" title="Voz sempre aberta" text="Entrou no canal, já está falando. Sem link, sem agendar.">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Volume2 size={16} /> Bate-papo
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              {["tom", "caio", "ana"].map((id, i) => (
                <span key={id} className="relative">
                  {i === 0 && (
                    <motion.span
                      className="absolute -inset-1 rounded-full border-2 border-online"
                      animate={{ opacity: [1, 0.2, 1] }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                    />
                  )}
                  <Avatar user={USERS[id]} size={44} />
                </span>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              {[Mic, Headphones, MonitorUp].map((I, i) => (
                <span key={i} className="flex h-9 w-9 items-center justify-center rounded-full border border-ink bg-sheet">
                  <I size={16} />
                </span>
              ))}
            </div>
          </FeatureCard>

          <FeatureCard n="03" title="Conversa direta" text="Fala só com quem você quer. Do lado dos seus servidores.">
            <div className="space-y-2">
              <div className="w-fit max-w-[85%] rounded-2xl rounded-bl-sm border border-ink bg-sheet px-3 py-2 text-sm">Bora quinta?</div>
              <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-ink px-3 py-2 text-sm text-sheet">Bora. Chamo o resto.</div>
              <div className="w-fit rounded-2xl rounded-bl-sm border border-ink bg-sheet px-3 py-2 text-sm">🔥</div>
            </div>
          </FeatureCard>
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ n, title, text, children }: { n: string; title: string; text: string; children: React.ReactNode }) {
  return (
    <motion.article
      {...reveal}
      className="flex flex-col rounded-2xl border border-ink bg-sheet p-6 shadow-hard transition-transform hover:-translate-y-1"
    >
      <span className="font-mono text-xs text-muted">{n}</span>
      <h3 className="mt-2 font-display text-2xl font-extrabold">{title}</h3>
      <p className="mt-1 text-ink-3">{text}</p>
      <div className="mt-6 flex-1 rounded-xl border border-ink/15 bg-paper-2 p-4">{children}</div>
    </motion.article>
  );
}

function ForWho() {
  const items = [
    { t: "Jogo", d: "Chama o time, entra na voz e partiu.", c: "var(--color-teal)" },
    { t: "Estudo", d: "Grupo da faculdade com canal por matéria.", c: "var(--color-lilac)" },
    { t: "Trabalho", d: "Time pequeno, sem cara de empresa chata.", c: "var(--color-signal)" },
    { t: "Família", d: "O almoço de domingo começa aqui.", c: "var(--color-mustard)" },
  ];
  return (
    <section id="pra-quem" className="border-b border-ink bg-paper-2">
      <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <motion.h2 {...reveal} className="font-display text-5xl font-extrabold tracking-tight md:text-6xl">
          Pra qualquer <span className="font-serif font-normal italic">turma.</span>
        </motion.h2>
        <div className="mt-12 grid border-l border-t border-ink sm:grid-cols-2 lg:grid-cols-4">
          {items.map((it, i) => (
            <motion.div
              key={it.t}
              {...reveal}
              transition={{ ...reveal.transition, delay: i * 0.07 }}
              className="group relative border-b border-r border-ink bg-paper p-6 transition-colors hover:bg-sheet"
            >
              <span className="font-serif text-6xl italic" style={{ color: it.c }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-8 font-display text-2xl font-extrabold">{it.t}</h3>
              <p className="mt-1 text-ink-3">{it.d}</p>
              <span className="absolute bottom-0 left-0 h-1 w-0 transition-all duration-300 group-hover:w-full" style={{ background: it.c }} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Quote() {
  return (
    <section id="seguranca" className="border-b border-ink">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-24 sm:px-6 md:grid-cols-[1.4fr_1fr]">
        <motion.blockquote {...reveal} className="font-serif text-4xl leading-tight md:text-5xl">
          “A gente saiu de quatro grupos de mensagem pra um servidor só. <span className="italic text-signal">Finalmente dá pra achar as coisas.</span>”
          <footer className="mt-6 flex items-center gap-3 font-sans text-base">
            <Avatar user={USERS.ana} size={40} />
            <span className="leading-tight">
              <b className="block">Ana Prado</b>
              <span className="text-sm text-muted">Estúdio Solid</span>
            </span>
          </footer>
        </motion.blockquote>
        <motion.ul {...reveal} className="space-y-4 self-end">
          {[
            { I: Lock, t: "Chamadas criptografadas", d: "Voz e vídeo protegidos de ponta a ponta." },
            { I: Shield, t: "Você manda no servidor", d: "Cargos, permissões e moderação do seu jeito." },
          ].map(({ I, t, d }) => (
            <li key={t} className="flex gap-4 rounded-xl border border-ink bg-sheet p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-sheet">
                <I size={18} />
              </span>
              <span>
                <b className="block">{t}</b>
                <span className="text-sm text-ink-3">{d}</span>
              </span>
            </li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section id="baixar" className="bg-ink text-sheet">
      <div className="mx-auto flex max-w-7xl flex-col items-start gap-10 px-4 py-24 sm:px-6 md:flex-row md:items-end md:justify-between">
        <motion.h2 {...reveal} className="max-w-3xl font-display text-5xl font-extrabold leading-[0.95] tracking-tight md:text-7xl">
          Chama a galera.
          <br />
          <span className="font-serif font-normal italic text-signal">O resto a gente cuida.</span>
        </motion.h2>
        <motion.div {...reveal} className="flex flex-col gap-3">
          <Link
            href="/app"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-signal px-7 py-4 font-semibold text-sheet transition-transform hover:-translate-y-0.5"
          >
            Abrir no navegador <ArrowRight size={18} />
          </Link>
          <span className="inline-flex items-center justify-center gap-2 rounded-full border border-sheet/30 px-7 py-4 font-semibold text-sheet/80">
            <Download size={18} /> Windows, Mac e Linux em breve
          </span>
        </motion.div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-ink text-sheet">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 border-t border-sheet/15 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
        <Logo inverted />
        <nav className="flex flex-wrap gap-6 text-sm text-sheet/70">
          <a href="#recursos" className="hover:text-sheet">Recursos</a>
          <a href="#pra-quem" className="hover:text-sheet">Pra quem é</a>
          <a href="#seguranca" className="hover:text-sheet">Segurança</a>
          <Link href="/app" className="hover:text-sheet">Entrar</Link>
        </nav>
        <p className="font-mono text-xs text-sheet/50">© 2026 Concord</p>
      </div>
    </footer>
  );
}
