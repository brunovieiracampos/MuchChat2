-- Publicações agendadas de uma conta do Instagram.
-- media: [{ "path": "<pathname no Blob privado>", "width": 1080, "height": 1350, "size": 123 }], em ordem.
-- schedule_token: "ficha" do agendamento atual; o processo de publicação só age se a ficha ainda for a dele
-- (reagendar ou cancelar troca a ficha e o processo antigo encerra sem publicar).
create table if not exists public.scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.instagram_accounts (id) on delete cascade,
  kind text not null check (kind in ('image', 'carousel', 'story')),
  caption text not null default '',
  media jsonb not null default '[]'::jsonb,
  scheduled_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'preparing', 'publishing', 'published', 'failed', 'canceled')),
  schedule_token uuid,
  run_id text,
  container_id text,
  ig_media_id text,
  permalink text,
  published_at timestamptz,
  automation_id text,
  attempts integer not null default 0,
  error text,
  media_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists scheduled_posts_account on public.scheduled_posts (account_id, scheduled_at);

alter table public.scheduled_posts enable row level security;
revoke all on public.scheduled_posts from anon;
grant select, insert, update, delete on public.scheduled_posts to authenticated;

-- Só o dono da conta do Instagram vê e mexe nas publicações dela (mesma regra das automações).
drop policy if exists "publicação: dono da conta" on public.scheduled_posts;
create policy "publicação: dono da conta" on public.scheduled_posts
  for all to authenticated
  using (public.owns_account(account_id))
  with check (public.owns_account(account_id));
