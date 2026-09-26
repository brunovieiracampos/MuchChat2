---
name: arquitetura-autorizacao
description: Onde ficam as camadas de autorização do MuchChat2 multi-contas e falsos positivos já descartados (revisão 2026-09-25)
metadata:
  type: project
---

Camadas de isolamento (revisadas em 2026-09-25, commit 7946a0b + fase 2 não commitada):
- Sessão: lib/session.ts requireSession/getUser (auth.getUser no servidor). proxy.ts é só otimista.
- Conta: lib/panel.ts inAccount/scoped -> accountForUser(owner_id da sessão) -> withAccount (AsyncLocalStorage em lib/account-context.ts).
- Redis: getStore() = PrefixedStore com a:{igUserId}: (prefixo por IG, não por accountId: dados herdados se outro usuário conectar a mesma IG).
- Postgres: automations via cliente do usuário + RLS owns_account(); instagram_accounts só via chave de serviço (token cifrado, grants por coluna).
- Webhook/cron: chave de serviço, sempre filtrando pela conta.

Falsos positivos descartados: IDOR em server actions de automação (id é buscado na lista da conta); uso de createAdminClient em accountForUser (filtra por owner_id validado); React.cache em route handlers.

Achados recorrentes a revalidar: safeNext não bloqueia tab/newline (/%09/evil.com); origin() usa header Origin para links de e-mail; rate limit do Supabase vê IP do servidor.

**Why:** reduzir ruído nas próximas revisões desse repositório.
**How to apply:** partir dessas camadas ao revisar novas rotas/actions; conferir se continuam valendo no código atual.
