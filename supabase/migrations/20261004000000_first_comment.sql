-- Primeiro comentário: texto que a própria conta comenta logo depois de o post sair (vazio = não comenta).
-- first_comment_id guarda o comentário publicado; com ele, o processo nunca comenta de novo.
alter table public.scheduled_posts add column if not exists first_comment text not null default '';
alter table public.scheduled_posts add column if not exists first_comment_id text;
