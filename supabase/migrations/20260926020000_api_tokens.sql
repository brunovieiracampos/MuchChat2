-- Tokens pessoais para o MCP do Much Chat (Claude Code). O token só aparece uma vez, na criação;
-- aqui fica o SHA-256 dele. Cada usuário vê e revoga só os próprios.
create table if not exists public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  token_hash text not null unique,
  hint text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists api_tokens_owner on public.api_tokens (owner_id);

alter table public.api_tokens enable row level security;
revoke all on public.api_tokens from anon, authenticated;
grant select (id, owner_id, name, hint, created_at, last_used_at) on public.api_tokens to authenticated;
grant insert (owner_id, name, token_hash, hint) on public.api_tokens to authenticated;
grant delete on public.api_tokens to authenticated;

drop policy if exists "token: ver os próprios" on public.api_tokens;
create policy "token: ver os próprios" on public.api_tokens
  for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "token: criar para si" on public.api_tokens;
create policy "token: criar para si" on public.api_tokens
  for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists "token: revogar os próprios" on public.api_tokens;
create policy "token: revogar os próprios" on public.api_tokens
  for delete to authenticated using ((select auth.uid()) = owner_id);
