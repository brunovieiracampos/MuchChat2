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

## Estrutura

| Arquivo | O quê |
|---|---|
| `proxy.ts` | Renova a sessão do Supabase e manda para /entrar quem abre o painel sem login |
| `app/api/webhooks/instagram` | Webhook (verificação GET + POST com assinatura `X-Hub-Signature-256`) |
| `app/api/cron/sweep` | Varredura diária de todas as contas |
| `app/api/auth/instagram` | Conectar o Instagram (OAuth) na conta do usuário logado; já inscreve no webhook |
| `app/painel` | Painel: visão geral, automações (construtor em blocos), execuções, contatos, métricas e funil, configurações |
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

**MCP (Claude Code).** `app/api/mcp` expõe as ferramentas de `lib/mcp.ts` (listar, criar, editar, associar post, ativar,
excluir, execuções, resumo, pausar tudo). A autenticação é por token pessoal gerado em Configurações → Acesso pelo Claude
(o banco guarda só o SHA-256, tabela `api_tokens`). Tudo roda dentro da conta do dono do token:
```bash
claude mcp add --transport http muchchat https://SEU-DOMINIO/api/mcp --header "Authorization: Bearer mc_…"
```

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
