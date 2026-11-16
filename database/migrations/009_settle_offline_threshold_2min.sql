-- 009_settle_offline_threshold_2min.sql
-- Baixa a trave mínima de liquidação offline de 5min para 2min: navegadores
-- congelam abas ocultas por volta de 5min, então com a trave em 2min o
-- pulso em segundo plano consegue liquidar quase todo o tempo ausente.
-- Idempotente — apenas recria a função.

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
  new_level integer;
  new_exp integer;
  new_gold integer;
  new_sp integer;
  new_tp integer;
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

  -- Trave mínima: 2 minutos (aba escondida menos que isso não vale a RPC;
  -- também neutraliza relógio do cliente atrasado: elapsed negativo).
  if elapsed < interval '2 minutes' then
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
  where id = c.id
  returning level, exp, gold, stat_points, talent_points
  into new_level, new_exp, new_gold, new_sp, new_tp;

  return json_build_object(
    'settled', true,
    'seconds', extract(epoch from elapsed)::integer,
    'xp', xp_total,
    'gold', gold_total,
    'level_before', c.level,
    'level_after', new_level,
    'exp_after', new_exp,
    'gold_after', new_gold,
    'stat_points_after', new_sp,
    'talent_points_after', new_tp
  );
end;
$$;

grant execute on function public.settle_offline(uuid) to authenticated;
