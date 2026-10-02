-- Entrega 2 do agendamento: Reels (vídeo no feed). Story de vídeo continua com kind = 'story'.
-- media ganha campos opcionais por item: "type" ("video"), "duration" (segundos) e "cover" (capa JPEG no Blob privado).
alter table public.scheduled_posts drop constraint if exists scheduled_posts_kind_check;
alter table public.scheduled_posts add constraint scheduled_posts_kind_check check (kind in ('image', 'carousel', 'story', 'reel'));
