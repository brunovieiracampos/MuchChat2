-- Desconectar a conta passa a ser só pelo servidor, que também limpa os dados dela no Redis.
revoke delete on public.instagram_accounts from authenticated;
drop policy if exists "conta: desconectar a própria" on public.instagram_accounts;
