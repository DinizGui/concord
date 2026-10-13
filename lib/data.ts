export type Status = "online" | "idle" | "dnd" | "offline";

export type User = {
  id: string;
  name: string;
  handle: string;
  color: string;
  status: Status;
  activity?: string;
  role?: string;
};

export type Reaction = { emoji: string; count: number; mine?: boolean };

export type Message = {
  id: string;
  authorId: string;
  time: string;
  day?: string;
  text: string;
  reactions?: Reaction[];
  replyTo?: string;
  attachment?: { title: string; meta: string };
};

export type Channel = {
  id: string;
  name: string;
  kind: "text" | "voice" | "announce";
  topic?: string;
  unread?: boolean;
  mentions?: number;
  inVoice?: string[];
};

export type Category = { id: string; name: string; channels: Channel[] };

export type Server = {
  id: string;
  name: string;
  short: string;
  color: string;
  mentions?: number;
  unread?: boolean;
  categories: Category[];
  roles: { name: string; members: string[] }[];
};

export const ME: User = {
  id: "me",
  name: "Gui Diniz",
  handle: "gui.diniz",
  color: "var(--color-signal)",
  status: "online",
  activity: "Construindo o Concord",
};

export const USERS: Record<string, User> = {
  me: ME,
  ana: { id: "ana", name: "Ana Prado", handle: "anaprado", color: "var(--color-teal)", status: "online", activity: "Ouvindo Tim Maia" },
  leo: { id: "leo", name: "Leo Lima", handle: "leolima", color: "var(--color-mustard)", status: "idle", activity: "Ausente há 12 min" },
  bia: { id: "bia", name: "Bia Ramos", handle: "bia.r", color: "var(--color-lilac)", status: "dnd", activity: "Em reunião" },
  caio: { id: "caio", name: "Caio Mendes", handle: "caiom", color: "var(--color-sky)", status: "online", activity: "Jogando Rocket League" },
  duda: { id: "duda", name: "Duda Faria", handle: "dudaf", color: "var(--color-rose)", status: "online" },
  rafa: { id: "rafa", name: "Rafa Souza", handle: "rafasouza", color: "var(--color-ink-3)", status: "offline" },
  mari: { id: "mari", name: "Mari Costa", handle: "maricosta", color: "var(--color-teal)", status: "offline" },
  tom: { id: "tom", name: "Tom Alves", handle: "tom.alves", color: "var(--color-mustard)", status: "online", activity: "No canal Bate-papo" },
  bot: { id: "bot", name: "Maestro", handle: "maestro", color: "var(--color-ink)", status: "online", role: "bot" },
};

export const SERVERS: Server[] = [
  {
    id: "estudio",
    name: "Estúdio Solid",
    short: "ES",
    color: "var(--color-signal)",
    mentions: 3,
    categories: [
      {
        id: "info",
        name: "Informações",
        channels: [
          { id: "avisos", name: "avisos", kind: "announce", topic: "Só o que importa. Leia antes de perguntar." },
          { id: "regras", name: "regras", kind: "text", topic: "Combinados da casa." },
        ],
      },
      {
        id: "texto",
        name: "Canais de texto",
        channels: [
          { id: "geral", name: "geral", kind: "text", topic: "Papo do dia a dia do estúdio." },
          { id: "design", name: "design", kind: "text", topic: "Layouts, referências e críticas sinceras.", unread: true, mentions: 2 },
          { id: "dev", name: "dev", kind: "text", topic: "Deploy, bug e café.", unread: true },
          { id: "memes", name: "memes", kind: "text", topic: "Sem contexto mesmo." },
        ],
      },
      {
        id: "voz",
        name: "Canais de voz",
        channels: [
          { id: "sala", name: "Bate-papo", kind: "voice", inVoice: ["tom", "caio"] },
          { id: "foco", name: "Foco total", kind: "voice", inVoice: [] },
          { id: "call", name: "Call com cliente", kind: "voice", inVoice: ["bia"] },
        ],
      },
    ],
    roles: [
      { name: "Fundadores", members: ["me", "ana"] },
      { name: "Time", members: ["caio", "tom", "bia", "leo", "duda"] },
      { name: "Bots", members: ["bot"] },
      { name: "Offline", members: ["rafa", "mari"] },
    ],
  },
  {
    id: "rocket",
    name: "Liga das Quintas",
    short: "LQ",
    color: "var(--color-teal)",
    unread: true,
    categories: [
      {
        id: "texto",
        name: "Texto",
        channels: [
          { id: "geral", name: "geral", kind: "text", topic: "Quinta tem jogo. Sem desculpa." },
          { id: "clipes", name: "clipes", kind: "text", topic: "Só lance bonito.", unread: true },
        ],
      },
      {
        id: "voz",
        name: "Voz",
        channels: [
          { id: "time-a", name: "Time A", kind: "voice", inVoice: ["caio"] },
          { id: "time-b", name: "Time B", kind: "voice", inVoice: [] },
        ],
      },
    ],
    roles: [
      { name: "Capitães", members: ["caio"] },
      { name: "Jogadores", members: ["me", "leo", "tom", "duda"] },
    ],
  },
  {
    id: "leitura",
    name: "Clube do Livro",
    short: "CL",
    color: "var(--color-lilac)",
    categories: [
      {
        id: "texto",
        name: "Texto",
        channels: [
          { id: "geral", name: "geral", kind: "text", topic: "Livro do mês: Torto Arado." },
          { id: "spoilers", name: "spoilers", kind: "text", topic: "Entrou, aceitou." },
        ],
      },
      { id: "voz", name: "Voz", channels: [{ id: "encontro", name: "Encontro mensal", kind: "voice", inVoice: [] }] },
    ],
    roles: [{ name: "Leitores", members: ["me", "bia", "mari", "ana"] }],
  },
  {
    id: "familia",
    name: "Família",
    short: "F",
    color: "var(--color-mustard)",
    mentions: 1,
    categories: [
      { id: "texto", name: "Texto", channels: [{ id: "geral", name: "geral", kind: "text", topic: "Almoço de domingo?" }] },
    ],
    roles: [{ name: "Família", members: ["me", "duda", "rafa"] }],
  },
];

const base: Message[] = [
  { id: "m1", authorId: "ana", day: "Ontem", time: "18:02", text: "Subi a nova versão do hero. Alguém dá uma olhada antes de mandar pro cliente?" },
  { id: "m2", authorId: "ana", time: "18:02", text: "Link no Figma, página Landing v3." },
  { id: "m3", authorId: "caio", time: "18:20", text: "Olhei. A tipografia ficou muito melhor. Só achei o botão grande demais no mobile.", reactions: [{ emoji: "👍", count: 2 }] },
  { id: "m4", authorId: "me", time: "18:31", text: "Concordo com o Caio. Reduz uns 8px e manda.", replyTo: "m3" },
  { id: "m5", authorId: "bot", day: "Hoje", time: "09:00", text: "Bom dia. Daily em 30 minutos no canal Bate-papo." },
  {
    id: "m6",
    authorId: "tom",
    time: "09:14",
    text: "Pessoal, o build de ontem passou. Deixei o relatório aqui.",
    attachment: { title: "relatorio-build-1013.pdf", meta: "PDF · 248 KB" },
  },
  { id: "m7", authorId: "bia", time: "09:40", text: "Valeu, Tom! Vou estar em call com cliente até umas 11h.", reactions: [{ emoji: "☕", count: 3, mine: true }] },
  { id: "m8", authorId: "duda", time: "10:05", text: "Alguém sabe se a reunião de sexta continua de pé?" },
];

export function seedMessages(serverId: string, channelId: string): Message[] {
  if (serverId === "estudio" && channelId === "geral") return base;
  const ch = SERVERS.find((s) => s.id === serverId)?.categories.flatMap((c) => c.channels).find((c) => c.id === channelId);
  return [
    { id: `${channelId}-1`, authorId: "bot", day: "Hoje", time: "08:00", text: `Este é o começo do #${ch?.name ?? channelId}. ${ch?.topic ?? ""}` },
    { id: `${channelId}-2`, authorId: "caio", time: "08:45", text: "Bom dia, gente." },
    { id: `${channelId}-3`, authorId: "ana", time: "09:12", text: "Bom dia! Hoje vai.", reactions: [{ emoji: "🔥", count: 1 }] },
  ];
}

export const DMS: { userId: string; preview: string; unread?: number }[] = [
  { userId: "ana", preview: "Manda o link que eu vejo", unread: 2 },
  { userId: "caio", preview: "Bora quinta?" },
  { userId: "bia", preview: "Te ligo depois da call" },
  { userId: "leo", preview: "kkkkkkk" },
  { userId: "duda", preview: "Valeu!" },
];

export function seedDm(userId: string): Message[] {
  return [
    { id: `${userId}-1`, authorId: userId, day: "Hoje", time: "10:12", text: "Oi! Viu o que eu te mandei?" },
    { id: `${userId}-2`, authorId: "me", time: "10:15", text: "Vi sim, gostei muito. Só ajustaria a cor do botão." },
    { id: `${userId}-3`, authorId: userId, time: "10:16", text: "Fechado, ajusto e te mando de novo." },
  ];
}

export const FRIENDS = ["ana", "caio", "tom", "duda", "leo", "bia", "rafa", "mari"];
export const PENDING: { userId: string; kind: "in" | "out" }[] = [
  { userId: "mari", kind: "in" },
  { userId: "rafa", kind: "out" },
];
