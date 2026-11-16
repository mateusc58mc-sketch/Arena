-- 007_fix_ownership_checks.sql
-- Correção da 006: a propriedade de personagem é characters.account_id ->
-- accounts.id, e a conta de auth é accounts.auth_user_id -> auth.uid().
-- A 006 comparava characters.account_id diretamente com auth.uid() (errado:
-- são UUIDs diferentes), o que bloqueava criar party e settle_offline.
-- Nada de dados é alterado — só funções e policies (idempotente).

-- Helper de propriedade: SECURITY DEFINER para contornar o RLS de
-- characters/accounts na avaliação das policies (padrão já usado no projeto).
create or replace function public.owns_character(p_character_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from characters c
    join accounts a on a.id = c.account_id
    where c.id = p_character_id
      and a.auth_user_id = auth.uid()
  );
$$;

grant execute on function public.owns_character(uuid) to authenticated;

-- ============================================================
-- settle_offline recriada com a verificação correta
-- ============================================================
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
  where id = p_character_id
    and exists (
      select 1 from accounts a
      where a.id = characters.account_id
        and a.auth_user_id = auth.uid()
    )
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
  -- Ritmo simulado de farm: ~6 mortes/min de comum + ~5% de boss/min.
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
-- Policies corrigidas (usam owns_character em vez de account_id = auth.uid())
-- ============================================================

drop policy if exists "parties_insert_own_character" on public.parties;
create policy "parties_insert_own_character" on public.parties
  for insert to authenticated
  with check (public.owns_character(leader_id));

drop policy if exists "parties_delete_leader" on public.parties;
create policy "parties_delete_leader" on public.parties
  for delete to authenticated
  using (public.owns_character(leader_id));

drop policy if exists "party_members_insert_own_character" on public.party_members;
create policy "party_members_insert_own_character" on public.party_members
  for insert to authenticated
  with check (public.owns_character(character_id));

drop policy if exists "party_members_delete_own" on public.party_members
;
create policy "party_members_delete_own" on public.party_members
  for delete to authenticated
  using (public.owns_character(character_id));
