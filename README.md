# dia-dm — comentário → DM para @d.ia.riamente

Quando alguém comenta uma palavra-chave (ex.: `CONTADOR`) num post:

1. envia a DM via **Private Reply** (`POST graph.instagram.com/{ig-user-id}/messages` com `recipient.comment_id`, 1 por comentário, até 7 dias);
2. responde o comentário publicamente com uma frase curta sorteada (só depois que a DM saiu, para não prometer algo que não chegou).

Cada comentário é registrado no Redis (`c:{comment_id}`) com lock contra concorrência → **nunca duplica**, mesmo se o webhook repetir ou a varredura passar de novo.

## Estrutura

| Arquivo | O quê |
|---|---|
| `config/rules.ts` | Regras iniciais (copiadas para o Redis na primeira vez; depois edite no painel) |
| `config/site.ts` | Nome/e-mail exibidos na política de privacidade |
| `app/api/webhooks/instagram` | Webhook (verificação GET + POST com assinatura `X-Hub-Signature-256`) |
| `app/api/cron/sweep` | Varredura: lê comentários dos posts dos últimos 7 dias e processa o que faltou; renova o token |
| `app/painel` | Painel (design em `reference/`): automações, execuções, contatos, métricas, configurações |
| `app/api/auth/instagram` | Login com Instagram (OAuth) → token de longa duração salvo no Redis |
| `app/api/admin/*` | `log` (GET log / POST `?action=retry-failed`), `media`, `subscribe` |
| `app/privacidade`, `app/exclusao-de-dados` | Páginas exigidas pela Meta |

## Painel

Abra `https://SEU-DOMINIO/painel` e entre com a senha `ADMIN_SECRET` (o link antigo `/admin?key=…` também abre a sessão).

| Tela | O quê |
|---|---|
| Visão geral | Comentários atendidos, DMs, falhas, gráfico de 7 dias e atividade recente |
| Automações | Lista, ativar/pausar, duplicar; **Construtor**: post(s) + palavra(s)-chave → DM + link + respostas públicas, com teste na tela |
| Execuções | Cada comentário processado, com etapas e erro da API; “Tentar de novo” para DMs recusadas |
| Contatos | Quem comentou, quantas vezes e em quais automações |
| Métricas | 7/30/90 dias, palavras-chave mais usadas, execuções por automação |
| Configurações / Conexão | Conta, token, webhook, varredura manual, pausa geral, checklist de setup |

**Fluxo em blocos.** Cada automação é uma lista de blocos executados em ordem para cada comentário:
- **Responder comentário**: resposta pública (uma frase sorteada entre as cadastradas).
- **Enviar DM**: sem botão, com botão **Continuar o fluxo** (para até a pessoa clicar) ou com botão **Abrir link**.
- **Verificar se segue**: se a pessoa segue o perfil, passa; senão pede para seguir e confere de novo a cada clique.

Regras do Instagram: a primeira DM é a Private Reply (uma por comentário, até 7 dias); as seguintes só depois de um clique
(a conversa fica aberta por 24h). Cliques chegam pelo webhook (`messages` e `messaging_postbacks`), então botões dependem
do webhook de mensagens (e do App Review para quem não é testador). Se o Instagram recusar o botão, o sistema manda o texto
com “Responda “Me envie” aqui” e aceita a palavra digitada como clique.

As automações ficam no Redis (`automations`). Na primeira vez, o painel copia as regras de `config/rules.ts`; depois disso, edite pelo painel.
Na mensagem da DM, `{link}` vira o link e `{usuario}` vira o @ de quem comentou.
A palavra-chave ignora maiúsculas e acentos, mas tem que vir inteira: `contador!` dispara, `contadores` não.

O design de referência está em `reference/DIAriamente Automations.html`. A “Caixa de entrada” aparece como “em breve”: responder DMs livres precisa do webhook de mensagens e do App Review.

## Setup (uma vez)

### 1. GitHub + Vercel
```bash
cd dia-dm
git init && git add . && git commit -m "dia-dm inicial"
gh repo create dia-dm --private --source=. --push
```
Na Vercel: **Add New → Project → importar `dia-dm`** → Deploy.
Depois, em **Storage → Create/Connect → Upstash (Redis)** → conecte ao projeto (cria `KV_REST_API_URL` e `KV_REST_API_TOKEN`).

### 2. App na Meta (Instagram API com Instagram Login)
Em developers.facebook.com → seu app:

1. **Add product → Instagram → "API setup with Instagram login"**.
2. A conta @d.ia.riamente precisa ser **profissional (Criador ou Empresa) e pública**.
3. Copie o **Instagram app ID** (`IG_APP_ID`) e o **Instagram app secret** (`IG_APP_SECRET`) na tela do produto Instagram. São diferentes do ID e do secret do app Meta.
4. Em **Set up Instagram business login → Business login settings → OAuth redirect URIs**, adicione `https://SEU-DOMINIO/api/auth/instagram/callback`.
   Depois do deploy, abra `/painel` → **Conexão** → **Conectar Instagram** → entre com @d.ia.riamente. O token de 60 dias e o ID da conta ficam salvos no Redis, e a varredura renova o token sozinha.
   *(Alternativa: em "Generate access tokens", adicione a conta e cole o token em `IG_ACCESS_TOKEN` e o ID em `IG_USER_ID`.)*
5. **App settings → Basic**: Privacy Policy URL = `https://SEU-DOMINIO/privacidade`; User data deletion = `https://SEU-DOMINIO/exclusao-de-dados`; ícone 1024×1024; categoria.

### 3. Variáveis na Vercel (Settings → Environment Variables)
Veja `.env.example`. Mínimo: `IG_APP_ID`, `IG_APP_SECRET`, `IG_VERIFY_TOKEN` (invente), `ADMIN_SECRET` (invente, longo), `CRON_SECRET` (invente), `DRY_RUN=true` no começo. Faça **Redeploy**.

### 4. Webhook
No produto Instagram → **Configure webhooks**:
- Callback URL: `https://SEU-DOMINIO/api/webhooks/instagram`
- Verify token: o mesmo `IG_VERIFY_TOKEN` → **Verify and save**
- Assine o campo **comments**.

Depois inscreva a conta:
```bash
curl -X POST "https://SEU-DOMINIO/api/admin/subscribe?key=ADMIN_SECRET"
```

### 5. Teste
- Abra `https://SEU-DOMINIO/painel/conexao`: o checklist mostra o que falta.
- Rode a varredura pelo botão **Rodar varredura** (ou `curl "https://SEU-DOMINIO/api/cron/sweep?key=ADMIN_SECRET"`). Com `DRY_RUN=true`, o log mostra o que **seria** enviado.
- Troque para `DRY_RUN=false`, redeploy, e comente `CONTADOR` com uma conta de teste (ver abaixo).

**Conta de teste em modo dev:** App roles → Roles → **Add Instagram Tester** (outra conta sua); aceite o convite no app do Instagram dessa conta (Configurações → Apps e sites → Convites de testador).

### 6. Frequência da varredura
O `vercel.json` roda a varredura 1×/dia (é o limite do plano Hobby). Se quiser uma rede de segurança para eventos que o webhook perder, crie um agendamento gratuito em cron-job.org chamando
`https://SEU-DOMINIO/api/cron/sweep?key=ADMIN_SECRET` a cada 5–10 min.

## Importante: modo desenvolvimento × App Review
- Em **modo de desenvolvimento** a Meta só mostra comentários de contas com papel no app (você e **Testadores do Instagram** que aceitaram o convite). Isso vale para o webhook **e** para a varredura: a API devolve a lista de comentários vazia para os demais (o `comments_count` do post continua contando). Para funcionar com qualquer seguidor é preciso **app em modo Live + Advanced Access** em `instagram_business_manage_comments` e `instagram_business_manage_messages` (App Review).
- A Private Reply para quem **não tem papel no app** provavelmente só funciona com Advanced Access em `instagram_business_manage_messages`. Se falhar, o log mostra `dm-failed` e **a resposta pública não é feita**.
- Quando o App Review sair: `curl -X POST "https://SEU-DOMINIO/api/admin/log?key=ADMIN_SECRET&action=retry-failed"` e depois rode a varredura. Todo comentário que ainda estiver dentro dos 7 dias recebe a DM.

Roteiro do pedido e do screencast: `docs/APP_REVIEW.md`.

## Desenvolvimento
```bash
npm install
npm test        # regras, dedupe, concorrência, janela de 7 dias, assinatura
npm run dev     # sem Redis usa memória
```
