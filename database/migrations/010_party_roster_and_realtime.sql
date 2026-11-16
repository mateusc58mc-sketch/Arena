-- 010_party_roster_and_realtime.sql
-- 1) RPC party_roster: devolve o roster completo da party do personagem
--    (nível, andar, stats, é-líder). SECURITY DEFINER porque o RLS de
--    characters filtra linhas de OUTROS jogadores (era a causa do "?"
--    Nv.1 Andar 1 na lista da party).
-- 2) Realtime: tabela party_members na publicação supabase_realtime para
--    os painéis das duas telas recarregarem quando alguém entra/sai.

create or replace function public.party_roster(p_character_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_party parties%rowtype;
begin
  if not public.owns_character(p_character_id) then
    raise exception 'character not owned by authenticated account';
  end if;

  select p.* into v_party
  from parties p
  join party_members m on m.party_id = p.id
  where m.character_id = p_character_id;

  if not found then
    return json_build_object('party', null, 'members', '[]'::json);
  end if;

  return json_build_object(
    'party', json_build_object(
      'id', v_party.id,
      'invite_code', v_party.invite_code,
      'leader_id', v_party.leader_id,
      'max_floor', v_party.max_floor
    ),
    'members', coalesce((
      select json_agg(json_build_object(
        'character_id', m.character_id,
        'name', c.name,
        'class_name', c.class_name,
        'race', c.race,
        'level', c.level,
        'tower_floor', c.tower_floor,
        'str', c.str,
        'agi', c.agi,
        'vit', c.vit,
        'int_stat', c.int_stat,
        'dex', c.dex,
        'luk', c.luk,
        'gold', c.gold,
        'is_leader', (m.character_id = v_party.leader_id),
        'joined_at', m.joined_at
      ) order by m.joined_at)
      from party_members m
      join characters c on c.id = m.character_id
      where m.party_id = v_party.id
    ), '[]'::json)
  );
end;
$$;

grant execute on function public.party_roster(uuid) to authenticated;

-- ============================================================
-- Realtime: membership changes propagam para os painéis abertos.
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'party_members'
  ) then
    alter publication supabase_realtime add table public.party_members;
  end if;
end $$;
