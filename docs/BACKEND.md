# Concord: backend

Backend de chat no estilo Discord, feito em **Next.js 16 (route handlers) + Prisma 6 + MySQL**.
Os formatos seguem a API pública do Discord: ids snowflake em string, objetos em snake_case,
códigos de erro (`10003`, `50013`...) e opcodes do gateway (`HELLO`, `READY`, `RESUME`...).
Quem já conhece a API do Discord consegue usar sem ler muito.

Tudo do backend fica em:

```
prisma/schema.prisma      modelos
lib/server/*              regras (auth, permissões, eventos, gateway...)
app/api/v1/**/route.ts    rotas HTTP
```

## Como rodar

```bash
cp .env.example .env          # preencha DATABASE_URL (banco vazio já criado)
npm install                   # roda prisma generate no postinstall
npm run db:push               # cria as tabelas
npm run dev
```

Variáveis:

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | MySQL (`mysql://user:senha@host:3306/concord`) |
| `CRON_SECRET` | protege `/api/v1/internal/maintenance` (o `vercel.json` já agenda uma chamada diária) |
| `APP_URL` | endereço público, usado nos links de e-mail e de webhook (padrão: domínio da requisição) |
| `RESEND_API_KEY`, `MAIL_FROM` | e-mails de confirmação e troca de senha. Sem a chave, o link vai pro log |
| `BLOB_READ_WRITE_TOKEN` | anexos e emojis no Vercel Blob. Sem ele, ficam no MySQL |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | áudio e vídeo dos canais de voz |
| `REDIS_URL` | aviso de evento novo entre instâncias (opcional, para escala) |
| `GATEWAY_POLL_MS` | intervalo de leitura da fila sem Redis (padrão 1000) |
| `GATEWAY_POLL_WITH_BUS_MS` | intervalo de segurança com Redis ligado (padrão 5000) |
| `GATEWAY_MAX_LIFETIME_MS` | vida de uma conexão SSE antes do RECONNECT (padrão 240000) |

Tudo que não é `DATABASE_URL` é opcional: sem a variável, o recurso cai num modo simples e o resto funciona.

## Arquitetura

```
cliente ──REST──▶ route handler ──▶ Prisma/MySQL
                        │
                        └─▶ GatewayEvent (fila)  ◀── lê a cada 1s ── /gateway/connect (SSE) ──▶ cliente
```

- **Toda mudança gera um evento** na tabela `GatewayEvent` (`dispatch` / `dispatchToUsers` em `lib/server/events.ts`).
- **O gateway é SSE**, não WebSocket: a Vercel não mantém WebSocket aberto. Cada conexão lê a fila
  a partir do último `seq` e entrega só o que o usuário pode ver. Como a fila fica no banco, funciona
  com várias instâncias serverless ao mesmo tempo.
- **Cliente → servidor** (heartbeat, presença, voz) vai por `POST /api/v1/gateway`, com os mesmos opcodes.
- **Não existe processo de fundo.** A limpeza (presença vencida, voz, fila antiga, convites vencidos)
  roda dentro das conexões do gateway, a cada 30s, protegida por uma trava no banco (`SystemLock`).
  Dá para forçar com `GET /api/v1/internal/maintenance` + `Authorization: Bearer $CRON_SECRET`.

### Roteamento dos eventos

| Coluna preenchida | Quem recebe |
|---|---|
| `targetUserId` | só esse usuário |
| `guildId` | membros da guild; se tiver `channelId` e for evento de canal, só quem tem `VIEW_CHANNEL` |
| só `channelId` | destinatários da DM |

Quando chega `GUILD_CREATE`/`GUILD_DELETE`/`CHANNEL_CREATE`/`CHANNEL_DELETE` para o próprio usuário,
a conexão recarrega as guilds/DMs dele e continua do mesmo ponto. Mudanças de cargo, overwrite ou
canal limpam o cache de permissões da conexão.

## Autenticação

- `POST /api/v1/auth/register` `{ email, username, password, global_name? }` → `201 { token, user }`
- `POST /api/v1/auth/login` `{ login, password }` (login = e-mail ou username) → `{ token, user }`
- `POST /api/v1/auth/logout` → `204`
- `POST /api/v1/auth/forgot` `{ login }` → `204` sempre (não entrega se a conta existe). Manda link `/reset?token=` (vale 1h)
- `POST /api/v1/auth/reset` `{ token, password }` → `204`, troca a senha e derruba todas as sessões
- `POST /api/v1/auth/verify` `{ token }` → `204`, confirma o e-mail (link `/verify?token=`, vale 3 dias)
- `POST /api/v1/auth/verify/send` (logado) → reenvia a confirmação. O cadastro já manda uma

`user.verified` diz se o e-mail foi confirmado. Tokens de e-mail são de uso único e só o SHA-256 fica no banco.

O token vai no header `Authorization: <token>` (aceita também `Bearer <token>`) **ou** no cookie
httpOnly `concord_token`, que o login já seta. Com cookie, requisições que alteram estado precisam vir
da mesma origem (proteção CSRF). Senha com scrypt; no banco fica só o SHA-256 do token.

Para o front no navegador, o jeito mais simples é usar o cookie: `fetch` normal (same-origin) e
`new EventSource("/api/v1/gateway/connect")`.

## Gateway

Mensagens no formato do Discord: `{ op, d, s, t }`.

| op | Nome | Direção |
|---|---|---|
| 0 | DISPATCH | servidor → cliente (eventos, com `t` e `s`) |
| 1 | HEARTBEAT | cliente → servidor (`POST /gateway`) |
| 3 | PRESENCE_UPDATE | cliente → servidor `{ status: online\|idle\|dnd\|invisible, custom_status? }` |
| 4 | VOICE_STATE_UPDATE | cliente → servidor `{ guild_id, channel_id \| null, self_mute, self_deaf }` |
| 7 | RECONNECT | servidor → cliente: reconecte e retome |
| 9 | INVALID_SESSION | servidor → cliente: não dá para retomar, conecte do zero |
| 10 | HELLO | servidor → cliente, primeira mensagem |
| 11 | HEARTBEAT_ACK | resposta do op 1 |

Fluxo:

1. `GET /api/v1/gateway/connect` → `HELLO`, depois `READY` com: `user`, `guilds` (cargos, canais
   visíveis, contagem, estados de voz), `private_channels`, `relationships`, `read_state`, `presences`.
2. Eventos chegam como `op 0`. Cada um tem `s` (seq), também mandado como `id:` do SSE.
3. Depois de `GATEWAY_MAX_LIFETIME_MS` o servidor manda `RECONNECT` e fecha.
4. O cliente reconecta com `?seq=<último s>`. O `EventSource` faz isso sozinho, porque manda o
   `Last-Event-ID`. O servidor entrega o que ficou para trás e manda `RESUMED`, sem novo `READY`.
5. Se o seq for mais antigo que a fila (24h) ou inválido: `INVALID_SESSION`. Conecte sem seq.

Enquanto a conexão está aberta, o usuário fica online (o próprio SSE renova a presença a cada 30s).
Sem conexão por mais de 90s, ele fica offline e sai do canal de voz.

### Eventos

`READY`, `RESUMED`, `GUILD_CREATE`, `GUILD_UPDATE`, `GUILD_DELETE`, `GUILD_MEMBER_ADD`,
`GUILD_MEMBER_UPDATE`, `GUILD_MEMBER_REMOVE`, `GUILD_ROLE_CREATE`, `GUILD_ROLE_UPDATE`,
`GUILD_ROLE_DELETE`, `GUILD_BAN_ADD`, `GUILD_BAN_REMOVE`, `CHANNEL_CREATE`, `CHANNEL_UPDATE`,
`CHANNEL_DELETE`, `CHANNEL_PINS_UPDATE`, `CHANNEL_RECIPIENT_REMOVE`, `MESSAGE_CREATE`,
`MESSAGE_UPDATE`, `MESSAGE_DELETE`, `MESSAGE_DELETE_BULK`, `MESSAGE_REACTION_ADD`,
`MESSAGE_REACTION_REMOVE`, `MESSAGE_REACTION_REMOVE_ALL`, `MESSAGE_REACTION_REMOVE_EMOJI`,
`MESSAGE_ACK`, `TYPING_START`, `PRESENCE_UPDATE`, `VOICE_STATE_UPDATE`, `RELATIONSHIP_ADD`,
`RELATIONSHIP_REMOVE`, `USER_UPDATE`, `INVITE_CREATE`, `INVITE_DELETE`, `GUILD_EMOJIS_UPDATE`.

Threads usam `CHANNEL_CREATE`/`CHANNEL_UPDATE`/`CHANNEL_DELETE` com `type: 11`.

## REST (`/api/v1`)

### Usuários
| Método | Rota | Obs. |
|---|---|---|
| GET | `/users/@me` | com e-mail |
| PATCH | `/users/@me` | `username`, `global_name`, `avatar` (URL https), `bio`, `new_password`; trocar username/senha exige `password` |
| GET | `/users/{id}` | perfil público |
| GET | `/users/@me/guilds` | lista resumida + permissões |
| DELETE | `/users/@me/guilds/{guild}` | sair (dono não pode) |
| GET/POST | `/users/@me/channels` | DMs. POST `{ recipient_id }` (1:1, reaproveita) ou `{ recipients: [] }` (grupo, só amigos) |
| GET/POST | `/users/@me/relationships` | POST `{ username }` = pedido de amizade |
| PUT/DELETE | `/users/@me/relationships/{user}` | PUT `{}` pede/aceita, `{ type: 2 }` bloqueia. DELETE desfaz/recusa/desbloqueia |

### Guilds
| Método | Rota | Permissão |
|---|---|---|
| POST | `/guilds` `{ name }` | cria com @everyone, "geral" (texto) e "Geral" (voz) |
| GET | `/guilds/{id}?with_counts=true` | membro |
| PATCH | `/guilds/{id}` | MANAGE_GUILD (`owner_id` só o dono) |
| DELETE | `/guilds/{id}` | dono |
| GET/POST | `/guilds/{id}/channels` | POST: MANAGE_CHANNELS. Tipos 0, 2, 4; dentro de categoria herda as permissões dela |
| PATCH | `/guilds/{id}/channels` `[{ id, position, parent_id }]` | MANAGE_CHANNELS |
| GET | `/guilds/{id}/members?limit&after` | membro |
| GET/PATCH/DELETE | `/guilds/{id}/members/{user\|@me}` | `nick` (CHANGE/MANAGE_NICKNAMES), `roles` (MANAGE_ROLES), DELETE = expulsar (KICK_MEMBERS) |
| PUT/DELETE | `/guilds/{id}/members/{user}/roles/{role}` | MANAGE_ROLES |
| GET/POST/PATCH | `/guilds/{id}/roles` | MANAGE_ROLES (PATCH = reordenar) |
| PATCH/DELETE | `/guilds/{id}/roles/{role}` | MANAGE_ROLES |
| GET | `/guilds/{id}/bans` | BAN_MEMBERS |
| GET/PUT/DELETE | `/guilds/{id}/bans/{user}` | BAN_MEMBERS. PUT `{ reason?, delete_message_seconds? }` |
| GET | `/guilds/{id}/invites` | MANAGE_GUILD |
| GET/POST | `/guilds/{id}/emojis` | POST (multipart `name`, `image`): MANAGE_GUILD_EXPRESSIONS. PNG/JPG/GIF/WebP até 256 KB, 50 por servidor |
| PATCH/DELETE | `/guilds/{id}/emojis/{emoji}` | MANAGE_GUILD_EXPRESSIONS |
| GET | `/guilds/{id}/webhooks` | MANAGE_WEBHOOKS |

Expulsar, banir, mudar apelido e mexer em cargo seguem a **hierarquia**: só sobre quem está abaixo
do seu cargo mais alto (o dono pode tudo). Ninguém concede permissão que não tem.

### Canais e mensagens
| Método | Rota | Permissão |
|---|---|---|
| GET/PATCH/DELETE | `/channels/{id}` | PATCH/DELETE na guild: MANAGE_CHANNELS. Em grupo, DELETE = sair |
| PUT/DELETE | `/channels/{id}/permissions/{role\|user}` `{ type, allow, deny }` | MANAGE_ROLES |
| GET | `/channels/{id}/messages?limit&before&after&around` | READ_MESSAGE_HISTORY (mais nova primeiro) |
| POST | `/channels/{id}/attachments` (multipart `file`, até 4 MB) | SEND_MESSAGES + ATTACH_FILES. Devolve o anexo "solto" |
| POST | `/channels/{id}/messages` `{ content, nonce?, message_reference?, attachments?: [{ id }] }` | SEND_MESSAGES; respeita slowmode e bloqueio em DM. Só anexo (sem texto) vale |
| GET/PATCH/DELETE | `/channels/{id}/messages/{msg}` | PATCH só autor; DELETE autor ou MANAGE_MESSAGES |
| POST | `/channels/{id}/messages/bulk-delete` `{ messages: [] }` | MANAGE_MESSAGES |
| POST | `/channels/{id}/messages/{msg}/ack` | marca como lido, zera menções |
| PUT/DELETE | `/channels/{id}/messages/{msg}/reactions/{emoji}/@me` | ADD_REACTIONS (só para emoji novo na mensagem) |
| DELETE | `/channels/{id}/messages/{msg}/reactions/{emoji}/{user}` | MANAGE_MESSAGES |
| GET/DELETE | `/channels/{id}/messages/{msg}/reactions/{emoji}` | GET lista quem reagiu |
| DELETE | `/channels/{id}/messages/{msg}/reactions` | MANAGE_MESSAGES |
| POST | `/channels/{id}/typing` | SEND_MESSAGES |
| GET | `/channels/{id}/pins` | |
| PUT/DELETE | `/channels/{id}/pins/{msg}` | MANAGE_MESSAGES (em DM qualquer um) |
| GET/POST | `/channels/{id}/invites` `{ max_age, max_uses, temporary, unique }` | POST: CREATE_INSTANT_INVITE |
| POST | `/channels/{id}/threads` `{ name }` | SEND_MESSAGES no canal de texto |
| POST | `/channels/{id}/messages/{msg}/threads` `{ name }` | idem; o id da thread é o id da mensagem (uma por mensagem) |
| GET/POST | `/channels/{id}/webhooks` `{ name, avatar? }` | MANAGE_WEBHOOKS. A URL com o token só aparece na criação |

### Convites
| Método | Rota | Obs. |
|---|---|---|
| GET | `/invites/{code}?with_counts=true` | público (tela de convite) |
| POST | `/invites/{code}` | aceitar; banido → `40007` |
| DELETE | `/invites/{code}` | MANAGE_CHANNELS no canal ou MANAGE_GUILD |

Menções no conteúdo: `<@id>`, `<@&cargo>`, `@everyone`/`@here` (precisa de MENTION_EVERYONE).
Emoji do servidor no texto: `<:nome:id>`; na reação: `nome:id` (precisa existir).

### Anexos, emojis, webhooks e voz
| Método | Rota | Obs. |
|---|---|---|
| GET | `/attachments/{id}/{token}/{nome}` | público com o token aleatório do link. Imagem/vídeo abre no navegador, o resto baixa |
| GET | `/emojis/{id}.png` | imagem do emoji (pública) |
| PATCH/DELETE | `/webhooks/{id}` | MANAGE_WEBHOOKS |
| GET/POST/DELETE | `/webhooks/{id}/{token}` | sem login. POST `{ content, username?, avatar_url? }` posta no canal (`?wait=true` devolve a mensagem). Não menciona ninguém |
| POST | `/voice/token` | depois de entrar no canal de voz (op 4): `{ url, token }` da sala LiveKit. 503 sem LiveKit configurado |

Arquivos: com `BLOB_READ_WRITE_TOKEN` vão pro Vercel Blob (a URL do anexo aponta direto pra lá);
sem ele ficam no MySQL. Anexo que subiu e não foi em nenhuma mensagem some em 1h. Apagar a mensagem
apaga o arquivo.

Threads: canal `type: 11` com `parent_id` = canal de texto. Herdam as permissões do pai. Apagar o
canal pai apaga as threads. O dono da thread pode renomear, arquivar (`archived: true`) e apagar.

## Limite de requisições

Janela fixa guardada no MySQL (tabela `RateLimit`), vale com várias instâncias. Estourou: `429` com
`retry_after` (segundos) e cabeçalho `Retry-After`. Regras em `lib/server/ratelimit.ts`:

| Ação | Limite |
|---|---|
| cadastro | 5 por IP por hora |
| login | 20 por IP e 10 por conta a cada 10 min |
| esqueci a senha | 5 por IP e 3 por conta por hora |
| mensagem | 10 a cada 10 s por usuário |
| digitando / reação | 10 e 20 a cada 10 s |
| upload | 20 por minuto |
| pedido de amizade, convite, servidor, emoji, thread | ver arquivo |
| webhook | 30 por minuto por webhook |

## Escala (Redis opcional)

Com `REDIS_URL`, todo `dispatch` publica um aviso no canal `concord:events`. Cada instância assina uma
vez e acorda as conexões SSE na hora; a leitura do banco vira rede de segurança a cada 5 s. A fila
continua no MySQL (fonte da verdade, RESUME igual). Se o Redis não responder na subida, fica no modo de 1 s; se cair depois, os eventos seguem chegando pela leitura de segurança (até 5 s de atraso).

## Permissões

Bits e cálculo iguais aos do Discord (`lib/server/permissions.ts`):
base = @everyone + cargos (dono e ADMINISTRATOR = tudo); no canal aplica overwrite do @everyone,
depois a soma dos cargos, depois o do membro. Sem `VIEW_CHANNEL` o canal não existe para a pessoa.

## Testado

- Backend original: 106 verificações (auth, guild, convite, mensagens, permissões, gateway, RESUME...).
- Etapa 4: 32 verificações ponta a ponta contra MySQL local: cadastro manda confirmação, token de uso
  único, esqueci a senha (resposta igual pra conta inexistente, sessões antigas caem), limite de login
  (429 com retry_after), upload com dimensões lidas do arquivo, mensagem só com anexo, token errado no
  link dá 404, anexo não reaproveita, emoji criado/servido/usado em reação, emoji falso recusado,
  thread a partir de mensagem (uma só), contador de respostas, webhook posta com nome próprio e marca
  de bot, token errado recusado, lista sem token, voz sem LiveKit dá 503.
- Token do LiveKit: assinatura HS256 conferida. **Não testado com áudio real** (precisa de um servidor
  LiveKit) nem com **Redis real**.

## Front

`/` landing (com um app de demonstração embutido), `/login`, `/register`, `/forgot`, `/reset`,
`/verify`, `/invite/{code}` e `/app` (o app de verdade, ligado nesta API e no gateway). O estado
do app fica em `lib/client/store.tsx` (aplica os eventos do gateway); as telas em `components/live/`.

## O que falta

- Áudio/vídeo em DM (hoje só nos canais de voz dos servidores).
- Gerenciar cargos e permissões pela interface (a API já tem).
- Busca de mensagens, fixados pela interface, notificações do navegador.
