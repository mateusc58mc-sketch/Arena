-- 011_party_max_floor_min.sql
-- Limite de andar da party = MENOR tower_floor entre membros REAIS
-- (o membro mais fraco trava a party inteira; era MAX antes).
-- Bots nunca estão em party_members, então nunca entram na conta.
-- Idempotente — apenas recria a função.

create or replace function public.recompute_party_max_floor(p_party uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update parties
  set max_floor = coalesce((
    select min(c.tower_floor)
    from party_members pm
    join characters c on c.id = pm.character_id
    where pm.party_id = p_party
  ), 1)
  where id = p_party;
end;
$$;

-- Recalcula o max_floor atual de todas as parties (backfill do valor legado
-- que ficou com MAX da migration 006).
update parties p
set max_floor = coalesce((
  select min(c.tower_floor)
  from party_members pm
  join characters c on c.id = pm.character_id
  where pm.party_id = p.id
), 1);
