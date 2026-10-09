-- Número do material dentro da conta ("Material Nº 14"), mostrado no portal. É gravado uma vez, na criação,
-- e não muda quando outro material é despublicado ou excluído. O número do último material excluído pode ser
-- reaproveitado pelo próximo: a conta é sempre o maior número existente mais um.
alter table public.materials add column if not exists number integer;

-- Materiais que já existem: numerados pela ordem de criação, em cada conta.
with numbered as (
  select id, row_number() over (partition by account_id order by created_at, id) as n
  from public.materials where number is null
)
update public.materials m set number = numbered.n from numbered where m.id = numbered.id;

alter table public.materials alter column number set not null;
alter table public.materials drop constraint if exists materials_account_id_number_key;
alter table public.materials add constraint materials_account_id_number_key unique (account_id, number);

-- O servidor não manda o número: o banco escolhe na inserção. Dois materiais criados no mesmo instante
-- disputam o mesmo número e a restrição acima recusa o segundo, em vez de repetir.
create or replace function public.materials_set_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.number is null then
    select coalesce(max(m.number), 0) + 1 into new.number from public.materials m where m.account_id = new.account_id;
  end if;
  return new;
end;
$$;
revoke all on function public.materials_set_number() from public, anon, authenticated;

drop trigger if exists materials_number on public.materials;
create trigger materials_number before insert on public.materials
  for each row execute function public.materials_set_number();
