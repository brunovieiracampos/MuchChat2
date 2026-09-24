# App Review — Meta (Instagram API com Instagram Login)

Objetivo: **Advanced Access** para o app funcionar com qualquer seguidor. Sem isso, o webhook de comentários não chega e a DM só vai para contas com papel no app.

## 0. Pré-requisitos (antes de enviar)
- [ ] App publicado na Vercel com domínio fixo (ex.: `dia-dm.vercel.app`).
- [ ] **App settings → Basic** preenchido: ícone 1024×1024, categoria, Privacy Policy URL (`/privacidade`), User data deletion URL (`/exclusao-de-dados`), e-mail de contato.
- [ ] Conta @d.ia.riamente **profissional e pública**, conectada pelo botão **Conectar Instagram** em `/admin`.
- [ ] Cada permissão abaixo testada **com sucesso pelo menos 1 vez** nos últimos 30 dias, usando uma conta testadora (sem isso o botão "Request" fica bloqueado).
- [ ] **Verificação do negócio** (Business Verification): normalmente exigida para Advanced Access. Use um CNPJ que você controle e cujos documentos (cartão CNPJ, conta de consumo ou extrato no nome da empresa) batam com o nome e endereço cadastrados no Business Manager. Leva de alguns dias a ~2 semanas. **Comece em paralelo.**
- [ ] Depois da aprovação, colocar o app em **Live** (App Mode) e inscrever a conta no webhook (`POST /api/admin/subscribe`).

## 1. Permissões a pedir

| Permissão | Para quê |
|---|---|
| `instagram_business_basic` | Ler perfil e posts da própria conta (ID, username, lista de posts) |
| `instagram_business_manage_comments` | Receber webhook de comentários, ler comentários e responder publicamente |
| `instagram_business_manage_messages` | Enviar a Private Reply (DM) para quem comentou |

## 2. Textos para o formulário (em inglês — os revisores leem em inglês)

**App description / use case (geral)**
> This app is used exclusively by our own Instagram professional account (@d.ia.riamente), an educational account about applied AI. Our posts invite followers to comment a keyword (e.g., "CONTADOR") to receive a free complementary resource. When a follower comments the keyword on one of our posts, the app (1) sends that person a single private reply with the link to the resource, using the Private Replies API, and (2) replies publicly to the comment letting them know the message was sent. Each comment receives at most one message, only within 7 days, and only in response to the user's own comment. No data is sold or shared; records are kept only to prevent duplicate messages and are deleted after 90 days.

**instagram_business_basic**
> We use instagram_business_basic to identify our own connected Instagram professional account (user ID and username) and to list our own recent media, so the app can match incoming comments to the posts configured with a keyword. This data is shown only in our private admin panel.

**instagram_business_manage_comments**
> We use instagram_business_manage_comments to receive the "comments" webhook for our own posts, to read comments on our own media (as a fallback when a webhook is missed), and to post a short public reply to the comment of a user who asked for the resource (e.g., "Sent to your DMs!"). We only reply to comments that contain the keyword configured for that post.

**instagram_business_manage_messages**
> We use instagram_business_manage_messages to send one Private Reply (POST /{ig-user-id}/messages with recipient.comment_id) to a user who commented the keyword on our post, containing the link to the resource they requested. The message is sent only once per comment, within 7 days of the comment, and only because the user explicitly asked for it by commenting. We do not send unsolicited or promotional messages.

**Instruções de teste para o revisor (Testing instructions)**
> 1. Open https://SEU-DOMINIO/admin?key=REVIEW_KEY (temporary key for review).
> 2. The panel shows the connected account (@d.ia.riamente), the configured rules and recent posts.
> 3. Using any Instagram account, comment the word CONTADOR on the post listed under rule "contador-…" (link in the panel).
> 4. Within a few seconds the commenting account receives a direct message with the resource link, and the comment receives a public reply. The event appears in "Últimos eventos" in the panel.
> The screencast shows this full flow end to end.

*(Crie uma chave temporária só para o revisor: troque `ADMIN_SECRET` durante a revisão e depois troque de volta.)*

## 3. Roteiro do screencast (um vídeo cobrindo as 3 permissões, ~2–3 min)

Requisitos da Meta: mostrar **o fluxo completo de ponta a ponta**, incluindo o **login**, a **concessão das permissões** e o **uso de cada uma** no app. A interface deve estar **em inglês** ou ter **legendas/explicação em inglês**. Grave em 1080p, sem cortes nos momentos-chave, e com o mouse visível.

**Preparação:** navegador em janela limpa; celular (ou 2ª janela) logado numa **conta testadora**, não em @d.ia.riamente; `DRY_RUN=false`; ativar legendas em inglês na edição (Descript, por exemplo).

| # | Tela | Ação | Legenda sugerida |
|---|---|---|---|
| 1 | `/admin` (sem conexão) | Mostrar o painel e clicar **Conectar Instagram** | "The account owner connects the Instagram professional account." |
| 2 | Tela de login do Instagram | Entrar com @d.ia.riamente e mostrar a **tela de consentimento listando as 3 permissões** → Allow | "Granting instagram_business_basic, manage_comments and manage_messages." |
| 3 | `/admin` (conectado) | Mostrar "Conta conectada" (username/ID) e **Posts recentes** | "instagram_business_basic: we read our own profile and media list." |
| 4 | `/admin` → Regras | Mostrar a regra CONTADOR → link | "Rule: comment CONTADOR on this post to get the resource." |
| 5 | Instagram (conta testadora) | Abrir o post e **comentar CONTADOR** | "A follower comments the keyword on our post." |
| 6 | Instagram (conta testadora) → Direct | Mostrar a **DM recebida** com o link; abrir o link | "instagram_business_manage_messages: one private reply with the requested link." |
| 7 | Instagram (post) | Mostrar a **resposta pública** no comentário | "instagram_business_manage_comments: public reply to the comment." |
| 8 | `/admin` → Últimos eventos | Atualizar e mostrar `dm-sent` e `reply-sent` (origem `webhook`) | "Webhook received, one message per comment, logged to prevent duplicates." |
| 9 | Opcional | Comentar CONTADOR de novo com a mesma conta e mostrar que **não duplica** | "No duplicate messages." |

> **Detalhe:** em modo dev o passo 8 só aparece como `webhook` se a conta testadora tiver papel no app. Se o webhook não disparar, rode a varredura (`/api/cron/sweep?key=…`) antes de atualizar: o evento aparece com origem `sweep`. Vale gravar das duas formas.

## 4. Depois de aprovado
1. App Mode → **Live**.
2. `POST /api/admin/subscribe?key=…` (inscreve a conta em `comments`).
3. `POST /api/admin/log?key=…&action=retry-failed` e depois `GET /api/cron/sweep?key=…`. Assim quem comentou antes da aprovação, ainda dentro dos 7 dias, recebe a DM.
4. Troque o `ADMIN_SECRET` que foi passado ao revisor.

## 5. Motivos comuns de reprovação (evitar)
- Screencast sem a tela de **consentimento/login** ou sem mostrar o resultado (DM chegando).
- Permissão pedida mas **não aparece** no vídeo, ou foi pedida uma permissão desnecessária (não peça `instagram_business_content_publish` aqui).
- Política de privacidade inacessível ou genérica demais.
- Instruções de teste que o revisor não consegue seguir (painel com senha que não funciona, post removido).
