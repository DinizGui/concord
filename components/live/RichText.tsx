"use client";

import { Fragment } from "react";
import { displayName, useStore } from "@/lib/client/store";
import { EmojiGlyph } from "./Emoji";

// Renderiza emojis do servidor (<:nome:id>), menções (<@id>, <@&cargo>, <#canal>, @everyone/@here) e links.
const TOKEN = /(<a?:[A-Za-z0-9_]{2,32}:\d+>|<@!?\d+>|<@&\d+>|<#\d+>|@everyone|@here|https?:\/\/[^\s<]+)/g;

export function RichText({ text, guildId }: { text: string; guildId?: string }) {
  const { state } = useStore();
  const guild = guildId ? state.guilds[guildId] : undefined;
  const parts = text.split(TOKEN);

  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        let m: RegExpMatchArray | null;
        if ((m = part.match(/^<a?:([A-Za-z0-9_]{2,32}):(\d+)>$/))) {
          // mensagem só com emoji fica grande, como no Discord
          const big = text.trim() === part;
          return <EmojiGlyph key={i} value={`${m[1]}:${m[2]}`} size={big ? 44 : 22} />;
        }
        if ((m = part.match(/^<@!?(\d+)>$/))) {
          const u = state.users[m[1]];
          const self = m[1] === state.me?.id;
          return (
            <span key={i} className={`rounded px-1 font-semibold ${self ? "bg-mustard/30 text-ink" : "bg-signal/15 text-signal-ink"}`}>
              @{displayName(u)}
            </span>
          );
        }
        if ((m = part.match(/^<@&(\d+)>$/))) {
          const role = guild?.roles.find((r) => r.id === m![1]);
          return (
            <span key={i} className="rounded bg-lilac/25 px-1 font-semibold">
              @{role?.name ?? "cargo"}
            </span>
          );
        }
        if ((m = part.match(/^<#(\d+)>$/))) {
          const ch = guild?.channels.find((c) => c.id === m![1]);
          return (
            <span key={i} className="rounded bg-signal/15 px-1 font-semibold text-signal-ink">
              #{ch?.name ?? "canal"}
            </span>
          );
        }
        if (part === "@everyone" || part === "@here") {
          return (
            <span key={i} className="rounded bg-mustard/30 px-1 font-semibold">
              {part}
            </span>
          );
        }
        if (/^https?:\/\//.test(part)) {
          return (
            <a key={i} href={part} target="_blank" rel="noreferrer noopener" className="text-signal-ink underline underline-offset-2">
              {part}
            </a>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}
