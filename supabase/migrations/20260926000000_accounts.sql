-- Conta do Instagram conectada por um usuário. v1: um usuário tem no máximo uma conta,
-- e cada conta do Instagram pertence a um único usuário (unique em owner_id e ig_user_id).
-- Na v2 (várias contas por usuário) basta tirar o unique de owner_id.
create table if not exists public.instagram_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  ig_user_id text not null unique,
  username text not null default '',
  account_type text,
  -- Token da Meta criptografado (AES-256-GCM) pelo servidor; o banco nunca vê o token aberto.
  token_ciphertext text not null,
  token_refreshed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.instagram_accounts enable row level security;

-- O navegador nunca lê o token, nem criptografado: só as colunas abaixo ficam liberadas.
revoke all on public.instagram_accounts from anon, authenticated;
grant select (id, owner_id, ig_user_id, username, account_type, token_refreshed_at, created_at, updated_at)
  on public.instagram_accounts to authenticated;
grant delete on public.instagram_accounts to authenticated;

drop policy if exists "conta: ver a própria" on public.instagram_accounts;
create policy "conta: ver a própria" on public.instagram_accounts
  for select to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists "conta: desconectar a própria" on public.instagram_accounts;
create policy "conta: desconectar a própria" on public.instagram_accounts
  for delete to authenticated using ((select auth.uid()) = owner_id);
-- Conectar e renovar o token passam pelo servidor (chave de serviço), que criptografa o token.

-- Automações de uma conta do Instagram. A regra completa (blocos, posts, palavras) fica em `rule`.
create table if not exists public.automations (
  account_id uuid not null references public.instagram_accounts (id) on delete cascade,
  id text not null,
  name text not null default '',
  active boolean not null default false,
  rule jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, id)
);

alter table public.automations enable row level security;
revoke all on public.automations from anon;
grant select, insert, update, delete on public.automations to authenticated;

-- Só o dono da conta do Instagram mexe nas automações dela.
create or replace function public.owns_account(acc uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.instagram_accounts a where a.id = acc and a.owner_id = (select auth.uid()));
$$;
revoke all on function public.owns_account(uuid) from public, anon;
grant execute on function public.owns_account(uuid) to authenticated;

drop policy if exists "automação: dono da conta" on public.automations;
create policy "automação: dono da conta" on public.automations
  for all to authenticated
  using (public.owns_account(account_id))
  with check (public.owns_account(account_id));
