# Much Chat — comentário vira conversa no direct

Cada usuário conecta a conta profissional do Instagram e cria automações. Quando alguém comenta uma palavra-chave num post:

1. a pessoa recebe a DM via **Private Reply** (1 por comentário, até 7 dias depois dele);
2. o fluxo continua com botões, verificação de seguidor e link, e o comentário é respondido em público.

Cada comentário tem estado próprio no Redis com trava contra concorrência → **nunca duplica**, mesmo se o webhook repetir ou a varredura passar de novo.
O nome do produto fica em `config/site.ts` (`PRODUCT`).

## Contas e isolamento

| Onde | O quê |
|---|---|
| Supabase Auth | Cadastro, login, confirmação de e-mail e redefinição de senha (`app/(conta)`, `app/auth/confirmar`) |
| `profiles` (Postgres) | Nome do usuário; RLS: cada um lê e edita só o próprio |
| `instagram_accounts` (Postgres) | Conta do Instagram de cada usuário (v1: uma por usuário) e o token da Meta **criptografado** (`lib/secret-box.ts`, `TOKEN_ENCRYPTION_KEY`). O navegador não tem acesso à coluna do token |
| `automations` (Postgres) | Automações da conta; RLS: só o dono da conta lê e altera |
| Redis `a:{accountId}:…` | Estado dos fluxos, travas, log, funil (`stats:{id}`) e pausa, sempre com o prefixo da conta |

Todo código que toca dados roda **dentro de uma conta** (`withAccount` em `lib/account-context.ts`): o Redis ganha o prefixo e o token vem dela.
Fora de uma conta, `getStore()` dá erro, então esquecer esse passo quebra em vez de misturar clientes.

- **Painel:** `lib/panel.ts` entra na conta do usuário logado; automações são lidas com o cliente do usuário (RLS).
- **Webhook:** cada evento traz a conta de destino (`entry.id`); eventos de contas desconhecidas são ignorados.
- **Varredura:** `/api/cron/sweep` percorre todas as contas conectadas e renova os tokens.

Migrações do banco em `supabase/migrations` (aplicar com `psql "$POSTGRES_URL_NON_POOLING" -f …`).
`scripts/migrate-to-accounts.mjs` levou a conta que existia antes das contas de usuário para o dono (roda uma vez).

## Ambiente local (Docker)

O desenvolvimento roda num ambiente separado da produção: Supabase local (Postgres, login e API) e Redis local com a API do Upstash, tudo no Docker (OrbStack).

```bash
npm run dev:db     # sobe o Supabase e o Redis locais e gera o .env.development.local
npm run db:seed    # copia os dados de produção para o local (só leitura em produção)
npm run dev        # app em http://localhost:3000, já no ambiente local
npm run dev:db:stop
```

- Login local: os mesmos e-mails de produção, todos com a senha `muchchat-dev`.
- `DRY_RUN=true` no local: nenhuma DM, resposta ou publicação sai no Instagram. O token do Instagram é trocado por um falso no seed.
- O seed (`supabase/seed.sql`) tem dados reais e não vai para o Git. `.env.seed` guarda o token somente leitura do Redis de produção.
- Studio (tabelas): http://127.0.0.1:54323. E-mails de teste: http://127.0.0.1:54324.
- Uma migração nova em `supabase/migrations` entra no local com `npm run db:seed` (recria o banco). Em produção, aplicar com `psql "$POSTGRES_URL_NON_POOLING" -f …` usando o `.env.local`.
- Sem o `.env.development.local`, o `localhost` volta a usar o banco de produção e o painel mostra um aviso vermelho.

## Estrutura

| Arquivo | O quê |
|---|---|
| `proxy.ts` | Renova a sessão do Supabase e manda para /entrar quem abre o painel sem login |
| `app/api/webhooks/instagram` | Webhook (verificação GET + POST com assinatura `X-Hub-Signature-256`) |
| `app/api/cron/sweep` | Varredura diária de todas as contas |
| `app/api/auth/instagram` | Conectar o Instagram (OAuth) na conta do usuário logado; já inscreve no webhook |
| `app/painel` | Painel: visão geral, automações (construtor em blocos), materiais, execuções, contatos, métricas e funil, configurações |
| `app/(publico)` | Página inicial, privacidade e exclusão de dados |

**Fluxo em blocos.** Cada automação é uma lista de blocos executados em ordem:
- **Responder comentário**: resposta pública (uma frase sorteada entre as cadastradas).
- **Enviar DM**: sem botão, com botão **Continuar o fluxo** (espera o clique) ou com botão **Abrir link**.
- **Verificar se segue**: se a pessoa segue o perfil, passa; senão pede para seguir e confere de novo a cada clique.

Regras do Instagram: a primeira DM é a Private Reply; as seguintes só depois de um clique (a conversa fica aberta por 24h).
Se o Instagram recusar o botão, o sistema manda o texto com “Responda “Me envie” aqui” e aceita a palavra digitada como clique.
Na DM, `{link}` vira o link e `{usuario}` vira o @ de quem comentou. A palavra-chave ignora maiúsculas e acentos, mas tem que vir inteira.

**Post que ainda não saiu.** No construtor (ou pelo MCP), a opção **Próxima publicação** grava o marcador `@next` e,
ao ativar, o momento em que foi armada (`armedAt`). No primeiro comentário num post publicado depois disso, o processador
(ou a varredura) pega o post mais antigo publicado após `armedAt`, troca o marcador pelo link dele e grava (`boundAt`).
Também dá para salvar a automação como rascunho sem post e associar depois.

**Agendamento de publicações.** Menu Publicações: post, carrossel (até 10) ou Story de imagem, legenda, data e hora, e a
automação do post junto (nova ou um rascunho sem post, com o marcador `@post:{id}`). As imagens vão do navegador direto para o
Vercel Blob **privado** (`/api/uploads`, só JPEG até 8 MB, dentro de `posts/{accountId}/`); a Meta recebe um link temporário assinado.
Cada agendamento inicia um processo do Vercel Workflow (`workflows/publish-post`): dorme até 10 min antes, prepara a mídia na Meta,
dorme até a hora, publica (sem nunca publicar duas vezes), liga e ativa a automação, e apaga a mídia 1 dia depois.
A "ficha" `schedule_token` faz reagendar/cancelar invalidar o processo anterior. Tabela `scheduled_posts` com RLS.
Requer a permissão `instagram_business_content_publish` (limite da Meta: 100 publicações pela API a cada 24h).

**MCP (conector do Claude).** `app/api/mcp` expõe as ferramentas de `lib/mcp.ts` (listar, criar, editar, associar post,
ativar, excluir, execuções, resumo, pausar tudo). Em Configurações → Acesso pelo Claude, o usuário gera um link
`https://SEU-DOMINIO/api/mcp/mc_…` e o adiciona no Claude em Configurações → Conectores → Adicionar conector personalizado
(web, desktop e celular). O token vai no caminho porque o conector não envia cabeçalhos; `/api/mcp` também aceita
`Authorization: Bearer mc_…` (Claude Code). O banco guarda só o SHA-256 (`api_tokens`), e tudo roda na conta do dono do token.

O funil vem de contadores diários (`stats:{id}`), não do log: cada comentário conta uma vez por etapa.

## Setup

1. **Vercel + Marketplace:** Upstash (Redis) e Supabase conectados ao projeto preenchem as variáveis. Veja `.env.example` para o resto
   (`IG_APP_ID`, `IG_APP_SECRET`, `IG_VERIFY_TOKEN`, `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`).
2. **Supabase → Authentication → URL Configuration:** Site URL = domínio de produção; Redirect URLs = `https://SEU-DOMINIO/**` e `http://localhost:3000/**`.
   Para outras pessoas se cadastrarem, configure um SMTP próprio (o envio embutido do Supabase tem limite baixo por hora).
3. **App na Meta** (Instagram API com Instagram Login): OAuth redirect URI `https://SEU-DOMINIO/api/auth/instagram/callback`;
   webhook `https://SEU-DOMINIO/api/webhooks/instagram` com o `IG_VERIFY_TOKEN`, campos `comments`, `messages` e `messaging_postbacks`;
   Privacy Policy URL e User data deletion em **App settings → Basic** (a do produto Instagram não conta).
4. **Modo Live:** em modo de desenvolvimento a Meta esconde os comentários de quem não é testador. Publicar o app resolve para as contas que você administra, sem App Review.
   Conectar contas de **outras pessoas** exige App Review (acesso avançado) e verificação do negócio; roteiro em `docs/APP_REVIEW.md`.

A varredura roda 1×/dia pelo `vercel.json` (limite do plano Hobby).

## Desenvolvimento
```bash
npm install
npm test        # fluxos, dedupe, concorrência, janela de 7 dias, funil, isolamento entre contas
npm run dev     # sem KV_REST_API_* usa memória no lugar do Redis
```
Não deixe as variáveis do Redis de produção no `.env.local`: o `vercel env pull` as traz, e o dev local passaria a mexer nos dados reais.
