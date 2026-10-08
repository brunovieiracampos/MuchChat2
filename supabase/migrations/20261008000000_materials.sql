-- Materiais do portal de uma conta do Instagram (CMS em blocos).
-- blocks: [{ "id": "ab12cd", "type": "text" | "prompt" | "file" | "links" | "image", ... }], em ordem (ver lib/material.ts).
-- cover_path e os caminhos dentro de blocks apontam para o Blob privado, em materials/{account_id}/.
create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.instagram_accounts (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  title text not null default '',
  description text not null default '',
  cover_path text,
  blocks jsonb not null default '[]'::jsonb,
  visibility text not null default 'public' check (visibility in ('public', 'exclusive')),
  status text not null default 'draft' check (status in ('draft', 'published')),
  cta_post text not null default '',
  cta_keyword text not null default '',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, slug)
);
create index if not exists materials_account on public.materials (account_id, created_at desc);

alter table public.materials enable row level security;

-- O navegador só lê os materiais da própria conta. Criar, alterar e excluir passam pelo servidor, que valida
-- os blocos e confere o dono de cada arquivo. O visitante do portal não lê o banco: as páginas públicas são
-- renderizadas no servidor (lib/portal.ts).
revoke all on public.materials from anon, authenticated;
grant select on public.materials to authenticated;

drop policy if exists "material: ver os da própria conta" on public.materials;
create policy "material: ver os da própria conta" on public.materials
  for select to authenticated using (public.owns_account(account_id));
