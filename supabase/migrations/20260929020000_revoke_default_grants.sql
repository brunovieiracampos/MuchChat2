-- O Supabase concede por padrão TRUNCATE/REFERENCES/TRIGGER aos papéis da API. TRUNCATE ignora o RLS.
-- A API REST não expõe esses comandos, mas nenhum cliente precisa deles.
revoke truncate, references, trigger on public.profiles, public.instagram_accounts, public.automations, public.scheduled_posts, public.api_tokens from anon, authenticated;
revoke all on public.profiles, public.scheduled_posts from anon;
