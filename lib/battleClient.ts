// lib/battleClient.ts
// Cliente do Edge Function "resolve-battle" (server-authoritative).
// Ligue via env: NEXT_PUBLIC_SERVER_BATTLE=true apos deploy do function.
import { supabase } from '@/lib/supabase';

export const SERVER_BATTLE_ENABLED =
  process.env.NEXT_PUBLIC_SERVER_BATTLE === 'true';

export interface ServerBattleResult {
  killed: boolean;
  goldGained: number;
  xpGained: number;
  monsterHpAfter: number | null;
  newLevel: number;
  newXp: number;
  newGold: number;
  playerDamage: number;
  cached?: boolean;
}

export async function resolveBattleTick(
  characterId: string,
  idempotencyKey: string,
): Promise<ServerBattleResult> {
  const { data, error } = await supabase.functions.invoke('resolve-battle', {
    body: { characterId, idempotencyKey },
  });
  if (error) throw error;
  const raw = data as unknown as { result?: ServerBattleResult } & ServerBattleResult;
  const payload: ServerBattleResult = (raw?.result ?? raw) as ServerBattleResult;
  return payload;
}