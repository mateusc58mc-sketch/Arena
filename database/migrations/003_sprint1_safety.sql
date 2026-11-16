-- database/migrations/003_sprint1_safety.sql
-- Sprint 1 — Seguranca & Integridade.
-- Idempotente: seguro para reexecucao.
-- NAO destritivo: adiciona colunas/tabelas, policies e funcao de combate.

-- ============================================================
-- 1) Colunas de estado de combate no personagem
-- ============================================================
alter table if exists characters
  add column if not exists combat_monster_id text,
  add column if not exists combat_monster_hp  integer,
  add column if not exists last_combat_at      timestamptz;

-- ============================================================
-- 2) Tabela de idempotencia (operation-level)
-- ============================================================
create table if not exists operation_keys (
  id                bigserial primary key,
  idempotency_key   text not null unique,
  character_id      uuid not null references characters(id) on delete cascade,
  kind              text not null,           -- 'resolve_battle','save_character','add_item',...
  result_json       jsonb,                   -- resultado cacheado para replay
  created_at        timestamptz not null default now()
);
create index if not exists idx_operation_keys_char on operation_keys (character_id, created_at desc);

alter table if exists operation_keys enable row level security;

drop policy if exists operation_keys_owner on operation_keys;
create policy operation_keys_owner on operation_keys
  for all using (
    exists (select 1 from characters c join accounts a on a.id = c.account_id
            where c.id = operation_keys.character_id and a.auth_user_id = auth.uid())
  ) with check (
    exists (select 1 from characters c join accounts a on a.id = c.account_id
            where c.id = operation_keys.character_id and a.auth_user_id = auth.uid())
  );

-- ============================================================
-- 3) RLS: forcar owner-only (garantir policies nao duplicadas)
-- ============================================================
-- (seriamente recomendar: manter RLS ativa em prod; service role ignora)
alter table if exists characters  enable row level security;
alter table if exists inventory   enable row level security;

-- ============================================================
-- 4) RPC transacional: resolve_combat_tick (fallback server-side rapido)
--    Usa service role internamente dentro da Edge Function, nao por RPC direta.
-- ============================================================
-- A implementacao real fica na Edge Function (resolve-battle). Aqui apenas
-- guardamos helpers de leitura do combate atual para o cliente.
create or replace view public.v_combat_state as
select c.id, c.tower_floor, c.combat_monster_id, c.combat_monster_hp
from characters c;

-- ============================================================
-- 5) RPC: idempotent save helper usado direto no cliente antes da migrate.
--    Aplica um patch de character só se a key ainda nao foi usada.
-- ============================================================
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
  -- lock key to avoid race
  insert into operation_keys (idempotency_key, character_id, kind)
  values (p_key, p_character_id, 'save_character')
  on conflict (idempotency_key) do nothing;

  select result_json into v_existing
  from operation_keys
  where idempotency_key = p_key;

  if v_existing is not null then
    return jsonb_build_object('cached', true, 'result', v_existing);
  end if;

  -- apply allowed keys from the patch (whitelist body columns)
  update characters
  set gold = coalesce((p_patch->>'gold')::bigint, gold),
      level = coalesce((p_patch->>'level')::integer, level),
      xp = coalesce((p_patch->>'xp')::bigint, xp),
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

-- grant execute on public role? Edge function uses service role; keep definer.
revoke all on function public.apply_character_patch_idempotent(text, uuid, jsonb) from public;
grant execute on function public.apply_character_patch_idempotent(text, uuid, jsonb) to authenticated;