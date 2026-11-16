// supabase/functions/resolve-battle/index.ts
// Server-authoritative combat tick. Deploy via: supabase functions deploy resolve-battle
// Requires SUPABASE_SERVICE_ROLE_KEY (auto-injected) and NEXT_PUBLIC_SUPABASE_URL.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// Combat logic (keep in sync with lib/gameEngine.js)
function calculatePlayerDamage(rawAttack: number, enemyDefense: number, isCritical = false): number {
  const atk = Math.max(1, rawAttack);
  const def = Math.max(0, enemyDefense);
  const base = (atk / 2) * (1 - Math.max(0, def - (atk / 2)) / (def + 1));
  const final = Math.max(1, Math.floor(base));
  if (isCritical) return Math.floor(final * 1.5);
  return final;
}
function resolveMonsterHit(monsterHp: number, damage: number) {
  const nextHp = Math.max(0, monsterHp - damage);
  return { defeated: nextHp === 0, remainingHp: nextHp };
}
function applyExperience(currentLevel: number, currentXp: number, gained: number) {
  let level = Math.max(1, currentLevel);
  let xp = Math.max(0, currentXp) + Math.max(0, gained);
  let levelsGained = 0;
  while (level < 9999 && xp >= levelRequirement(level)) {
    xp -= levelRequirement(level);
    level++;
    levelsGained++;
  }
  return { level, xp, levelsGained };
}
function levelRequirement(lvl: number): number {
  return Math.floor(18 + lvl * 2.25 + lvl * lvl * 0.005);
}
function rollChance(p: number): boolean {
  if (!(p >= 0)) p = 0;
  if (p > 1) p = 1;
  return Math.random() < p;
}

const SUPABASE_URL = Deno.env.get('NEXT_PUBLIC_SUPABASE_URL') || Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const corsHeaders = {
  'Access-control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), { status: 500, headers: corsHeaders });
  }

  // Resolve caller from JWT
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
  const userClient = createClient(SUPABASE_URL, Deno.env.get('NEXT_PUBLIC_SUPABASE_ANON_KEY') || '', {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }
  const userId = userData.user.id;

  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const idempotencyKey = (body?.idempotencyKey || '').trim();
  const characterId = (body?.characterId || '').trim();
  if (!idempotencyKey || !characterId) {
    return new Response(JSON.stringify({ error: 'Missing idempotencyKey or characterId' }), { status: 400, headers: corsHeaders });
  }

  // Idempotency: replay result if key already used
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: existing } = await admin
    .from('operation_keys')
    .select('result_json')
    .eq('idempotency_key', idempotencyKey)
    .single();
  if (existing?.result_json) {
    return new Response(JSON.stringify({ cached: true, result: existing.result_json }), { headers: corsHeaders });
  }

  // Load character + verify ownership
  const { data: char, error: charErr } = await admin
    .from('characters')
    .select('id, account_id, accounts!inner(auth_user_id), level, xp, stat_points, talent_points, hp_current, max_hp, attack, defense, gold, tower_floor, combat_monster_id, combat_monster_hp, inventory(*)')
    .eq('id', characterId)
    .single();
  if (charErr || !char || (char as any).accounts?.auth_user_id !== userId) {
    return new Response(JSON.stringify({ error: 'Character not found or not owned' }), { status: 403, headers: corsHeaders });
  }

  const accounts = (char as any).accounts;
  const c = char as any;
  const monsterId = c.combat_monster_id || `floor-${c.tower_floor ?? 1}-mob`;
  const monsterHp = typeof c.combat_monster_hp === 'number' ? c.combat_monster_hp : (c.max_hp ?? 50) * 0; // placeholder spawn

  // Resolver tick: if monster not spawned (hp 0 / null), spawn a fresh one
  let spawnMonsterHp = monsterHp;
  if (!spawnMonsterHp || spawnMonsterHp <= 0) {
    spawnMonsterHp = Math.max(1, (c.level ?? 1) * 20);
  }
  const enemyDef = (c as any).defense ?? 0;  // placeholder: could be monster defense
  const playerDamage = calculatePlayerDamage(c.attack ?? 1, enemyDef, false);
  const hit = resolveMonsterHit(spawnMonsterHp ?? 1, playerDamage);
  let newMonsterHp = hit.remainingHp;
  let xpGained = 0;
  let goldGained = 0;
  let killed = false;
  let newLevel = c.level ?? 1;
  let newXp = c.xp ?? 0;
  let newStatPoints = c.stat_points ?? 0;
  let newTalentPoints = (c.talent_points ?? 0);

  if (hit.defeated) {
    killed = true;
    xpGained = Math.max(5, (c.level ?? 1) * 3);
    goldGained = Math.max(5, (c.level ?? 1) * 2);
    const prog = applyExperience(newLevel, newXp, xpGained);
    const levelsGained = prog.levelsGained ?? 0;
    newLevel = prog.level;
    newXp = prog.xp;
    newStatPoints = newStatPoints + levelsGained * 5;
    newTalentPoints = newTalentPoints + levelsGained * 3;
    newMonsterHp = 0; // despawn -> respawn next tick
  }

  // Update character (idempotent re-insert ledger entry)
  // Build ledger idempotency for economy trace
  const newGold = (c.gold ?? 0) + goldGained;
  const { error: updErr } = await admin
    .from('characters')
    .update({
      level: newLevel,
      xp: newXp,
      stat_points: newStatPoints,
      talent_points: newTalentPoints,
      gold: newGold,
      combat_monster_id: monsterId,
      combat_monster_hp: newMonsterHp,
      last_combat_at: new Date().toISOString(),
    })
    .eq('id', characterId);
  if (updErr) {
    return new Response(JSON.stringify({ error: updErr.message }), { status: 500, headers: corsHeaders });
  }

  // Ledger trace
  await admin.from('economy_ledger').insert({
    idempotency_key: idempotencyKey + ':ledger',
    character_id: characterId,
    kind: 'hunt_reward',
    gold_delta: goldGained,
  }).then(() => {}, () => { /* ignore duplicate */ });

  // Store operation key (idempotent)
  await admin.from('operation_keys').insert({
    idempotency_key: idempotencyKey,
    character_id: characterId,
    kind: 'resolve_battle',
    result_json: { killed, goldGained, xpGained, monsterHpAfter: newMonsterHp, newLevel, newXp, newGold },
  }).then(() => {}, () => { /* ignore duplicate */ });

  const result = {
    cached: false,
    killed,
    goldGained,
    xpGained,
    monsterHpAfter: newMonsterHp,
    newLevel,
    newXp,
    newGold,
    playerDamage,
  };
  return new Response(JSON.stringify(result), { headers: corsHeaders });
});