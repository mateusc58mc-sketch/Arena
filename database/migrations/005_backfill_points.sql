-- database/migrations/005_backfill_points.sql
-- Reconciliação histórica: 3 -> 5 pts/level em atributos + 3 pts/level em talentos.
-- Idempotente: aplica apenas uma vez por personagem via operation_keys.
alter table if exists characters
  add column if not exists talent_points integer not null default 0;

insert into operation_keys (idempotency_key, character_id, kind)
select 'backfill_points:' || id, id, 'reconcile'
from characters c
where not exists (select 1 from operation_keys ok where ok.idempotency_key = 'backfill_points:' || c.id)
on conflict (idempotency_key) do nothing;

update characters c
set
  stat_points = stat_points + (c.level * 2),
  talent_points = c.level * 3
from operation_keys ok
where ok.idempotency_key = 'backfill_points:' || c.id
  and ok.result_json is null;

update operation_keys ok
set result_json = jsonb_build_object('applied', true, 'kind', 'backfill_points')
where ok.idempotency_key like 'backfill_points:%'
  and ok.result_json is null;