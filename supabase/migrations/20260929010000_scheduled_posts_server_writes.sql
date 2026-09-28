-- Publicações: o navegador só lê. Criar, alterar e excluir passam pelo servidor, que valida a mídia
-- (dono do arquivo, formato) e grava com a "ficha" do agendamento (evita publicar versão antiga).
revoke insert, update, delete on public.scheduled_posts from authenticated;
grant select on public.scheduled_posts to authenticated;
drop policy if exists "publicação: dono da conta" on public.scheduled_posts;
drop policy if exists "publicação: ver as da própria conta" on public.scheduled_posts;
create policy "publicação: ver as da própria conta" on public.scheduled_posts
  for select to authenticated using (public.owns_account(account_id));
