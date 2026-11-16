-- 006_offline_and_parties.sql
-- ADITIVO — não altera nenhuma coluna/linha existente.
-- 1) Ganho offline: coluna last_settled_at + função settle_offline (cap 12h/24h premium)
-- 2) Party: tabelas parties/party_members + max_floor automático (jogadores reais, exclui bots)

-- ============================================================
-- 1) GANHO OFFLINE
-- ============================================================

-- Marca a última liquidação de progresso offline.
-- DEFAULT now() no backfill: ninguém recebe XP retroativo de contas antigas.
alter table public.characters
  add column if not exists last_settled_at timestamptz not null default now();

-- Premium assinatura (24h de cap enquanto ativo; null/expirado = 12h).
alter table public.characters
  add column if not exists premium_until timestamptz;

-- Liquida o progresso offline de um personagem do usuário autenticado.
-- Atômica (row lock) e idempotente: o relógio do servidor é a fonte de verdade.
create or replace function public.settle_offline(p_character_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  elapsed interval;
  cap interval;
  xp_total integer;
  gold_total integer;
  lvl integer;
  xp integer;
  sp integer;
  tp integer;
  floor_i integer;
  xp_rate double precision;
  gold_rate double precision;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into c
  from characters
  where id = p_character_id and account_id = auth.uid()
  for update;

  if not found then
    raise exception 'character not owned by authenticated account';
  end if;

  -- Cap: 24h para premium ativo, 12h para o resto.
  if c.premium_until is not null and c.premium_until > now() then
    cap := interval '24 hours';
  else
    cap := interval '12 hours';
  end if;

  elapsed := now() - c.last_settled_at;
  if elapsed > cap then
    elapsed := cap;
  end if;

  -- Abaixo de 5 minutos não vale o custo de um carregamento de tela
  -- (isso também neutraliza relógio do cliente atrasado: elapsed negativo).
  if elapsed < interval '5 minutes' then
    return json_build_object('settled', false);
  end if;

  floor_i := greatest(1, coalesce(c.tower_floor, 1));

  -- Taxas por minuto, calibradas nas tabelas de monstro do jogo:
  --   comum: exp 30 x 1.22^(f-1), gold 20 x 1.22^(f-1)
  --   boss:  exp 400 x 1.30^(f-1), gold 250 x 1.30^(f-1)
  -- Ritmo simulado de farm: ~6 mortes/min de comum + ~3% de boss/min.
  xp_rate :=
    6 * round(30  * pow(1.22, floor_i - 1))
    + 0.05 * round(400 * pow(1.30, floor_i - 1));
  gold_rate :=
    6 * round(20  * pow(1.22, floor_i - 1))
    + 0.05 * round(250 * pow(1.30, floor_i - 1));

  xp_total := floor(xp_rate  * (extract(epoch from elapsed) / 60.0))::integer;
  gold_total := floor(gold_rate * (extract(epoch from elapsed) / 60.0))::integer;

  if xp_total <= 0 and gold_total <= 0 then
    return json_build_object('settled', false);
  end if;

  -- Régua de XP idêntica ao applyExperience do client:
  -- próximo nível = nível x 100; +5 stat points e +3 talent points por nível.
  lvl := c.level;
  xp := coalesce(c.exp, 0) + xp_total;
  sp := coalesce(c.stat_points, 0);
  tp := coalesce(c.talent_points, 0);

  while lvl < 10000 and xp >= lvl * 100 loop
    xp := xp - lvl * 100;
    lvl := lvl + 1;
    sp := sp + 5;
    tp := tp + 3;
  end loop;

  update characters
  set level = lvl,
      exp = xp,
      gold = coalesce(c.gold, 0) + gold_total,
      stat_points = sp,
      talent_points = tp,
      last_settled_at = now()
  where id = c.id;

  return json_build_object(
    'settled', true,
    'seconds', extract(epoch from elapsed)::integer,
    'xp', xp_total,
    'gold', gold_total,
    'level_before', c.level,
    'level_after', lvl
  );
end;
$$;

grant execute on function public.settle_offline(uuid) to authenticated;

-- ============================================================
-- 2) PARTY
-- ============================================================

create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  invite_code text unique not null,
  leader_id uuid not null references public.characters(id) on delete cascade,
  max_floor integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.party_members (
  party_id uuid not null references public.parties(id) on delete cascade,
  character_id uuid primary key references public.characters(id) on delete cascade,
  joined_at timestamptz not null default now()
);

alter table public.parties enable row level security;
alter table public.party_members enable row level security;

-- Leitura: qualquer autenticado precisa buscar a party pelo código de convite.
drop policy if exists "parties_read_authenticated" on public.parties;
create policy "parties_read_authenticated" on public.parties
  for select to authenticated using (true);

drop policy if exists "parties_insert_own_character" on public.parties;
create policy "parties_insert_own_character" on public.parties
  for insert to authenticated with check (
    exists (
      select 1 from public.characters c
      where c.id = leader_id and c.account_id = auth.uid()
    )
  );

drop policy if exists "parties_delete_leader" on public.parties;
create policy "parties_delete_leader" on public.parties
  for delete to authenticated using (
    exists (
      select 1 from public.characters c
      where c.id = leader_id and c.account_id = auth.uid()
    )
  );

drop policy if exists "party_members_read_authenticated" on public.party_members;
create policy "party_members_read_authenticated" on public.party_members
  for select to authenticated using (true);

drop policy if exists "party_members_insert_own_character" on public.party_members;
create policy "party_members_insert_own_character" on public.party_members
  for insert to authenticated with check (
    exists (
      select 1 from public.characters c
      where c.id = character_id and c.account_id = auth.uid()
    )
  );

drop policy if exists "party_members_delete_own" on public.party_members;
create policy "party_members_delete_own" on public.party_members
  for delete to authenticated using (
    exists (
      select 1 from public.characters c
      where c.id = character_id and c.account_id = auth.uid()
    )
  );

-- ============================================================
-- max_floor da party = maior tower_floor entre membros REAIS.
-- (bots nunca estão em party_members, então nunca entram na conta.)
-- ============================================================

create or replace function public.recompute_party_max_floor(p_party uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update parties
  set max_floor = coalesce((
    select max(c.tower_floor)
    from party_members pm
    join characters c on c.id = pm.character_id
    where pm.party_id = p_party
  ), 1)
  where id = p_party;
end;
$$;

-- Ao subir de andar, a(s) party(s) do personagem atualiza o max_floor.
create or replace function public.on_character_floor_change()
returns trigger
language plpgsql
as $$
declare
  p uuid;
begin
  if old.tower_floor is distinct from new.tower_floor then
    select party_id into p from party_members where character_id = new.id;
    if p is not null then
      perform recompute_party_max_floor(p);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists characters_floor_sync on public.characters;
create trigger characters_floor_sync
after update of tower_floor on public.characters
for each row
execute function public.on_character_floor_change();

-- Ao entrar/sair, recalcula o max_floor.
create or replace function public.on_party_members_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    perform recompute_party_max_floor(new.party_id);
  elsif tg_op = 'DELETE' then
    perform recompute_party_max_floor(old.party_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists party_members_recalc on public.party_members;
create trigger party_members_recalc
after insert or delete on public.party_members
for each row
execute function public.on_party_members_change();
