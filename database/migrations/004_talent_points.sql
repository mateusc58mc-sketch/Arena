-- database/migrations/004_talent_points.sql
-- Sprint 1.x — Reserva 3 pontos por nivel para o sistema de talentos.
-- Idempotente.

alter table if exists characters
  add column if not exists talent_points integer not null default 0;

create index if not exists idx_characters_talent_points on characters(talent_points);

-- Extender RPC whitelist para patches de talent_points/stat_points.
create or replace function public.apply_character_patch_idempotent(
  p_key           text,
  p_character_id  uuid,
  p_patch         jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing jsonb;
  v_result   jsonb;
begin
  insert into operation_keys (idempotency_key, character_id, kind)
  values (p_key, p_character_id, 'save_character')
  on conflict (idempotency_key) do nothing;

  select result_json into v_existing
  from operation_keys
  where idempotency_key = p_key;

  if v_existing is not null then
    return jsonb_build_object('cached', true, 'result', v_existing);
  end if;

  update characters
  set gold = coalesce((p_patch->>'gold')::bigint, gold),
      level = coalesce((p_patch->>'level')::integer, level),
      xp = coalesce((p_patch->>'xp')::bigint, xp),
      stat_points = coalesce((p_patch->>'stat_points')::integer, stat_points),
      talent_points = coalesce((p_patch->>'talent_points')::integer, talent_points),
      hp_current = coalesce((p_patch->>'hp_current')::bigint, hp_current),
      mp_current = coalesce((p_patch->>'mp_current')::bigint, mp_current),
      tower_floor = coalesce((p_patch->>'tower_floor')::integer, tower_floor),
      combat_monster_id = coalesce(p_patch->>'combat_monster_id', combat_monster_id),
      combat_monster_hp = coalesce((p_patch->>'combat_monster_hp')::integer, combat_monster_hp),
      last_combat_at = now()
  where id = p_character_id;

  v_result := jsonb_build_object('applied', true, 'character_id', p_character_id);
  update operation_keys
  set result_json = v_result
  where idempotency_key = p_key;
  return v_result;
end;
$$;

revoke all on function public.apply_character_patch_idempotent(text, uuid, jsonb) from public;
grant execute on function public.apply_character_patch_idempotent(text, uuid, jsonb) to authenticated;