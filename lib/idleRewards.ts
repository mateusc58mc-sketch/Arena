/**
 * idleRewards.ts — Sistema de recompensas idle/AFK.
 * 
 * Este módulo é ADITIVO — não altera nenhuma função existente.
 * Usa rollChance() de gameEngine.js para cálculo de drops.
 * 
 * Uso futuro:
 *   import { calculateOfflineReward, getIdleRates } from '@/lib/idleRewards';
 */

import { rollChance } from "./gameEngine.js";

// ============================================================
// Taxas de ganho por minuto
// ============================================================

export interface IdleRates {
  expPerMinute: number;
  goldPerMinute: number;
  dropsPerHour: number;
}

/**
 * Calcula as taxas de ganho por minuto baseado no andar de farm
 * e no poder da party.
 * 
 * @param floorId - Andar atual de farm (1+)
 * @param partyPower - Poder total da party
 * @param killsPerMinute - Estimativa de kills por minuto
 */
export function getIdleRates(
  floorId: number,
  partyPower: number,
  killsPerMinute: number = 6
): IdleRates {
  // Valores base do Andar 1 — [EXISTENTE] em TOWER_FLOORS_DB
  const baseExpPerMob = Math.floor(30 * Math.pow(1.08, floorId - 1));
  const baseGoldPerMob = Math.floor(20 * Math.pow(1.08, floorId - 1));

  // Escala kills/min baseado no poder da party (mais poder = mais kills)
  const powerMultiplier = Math.max(0.5, Math.min(3, partyPower / 500));
  const adjustedKills = Math.max(1, Math.floor(killsPerMinute * powerMultiplier));

  return {
    expPerMinute: Math.floor(baseExpPerMob * adjustedKills),
    goldPerMinute: Math.floor(baseGoldPerMob * adjustedKills),
    dropsPerHour: Math.floor(0.22 * adjustedKills * 60), // 0.22 = [EXISTENTE] drop chance
  };
}

// ============================================================
// Recompensa offline (AFK)
// ============================================================

export interface OfflineReward {
  exp: number;
  gold: number;
  itemDrops: string[];
  minutesAway: number;
  cappedAtMax: boolean;
}

const MAX_OFFLINE_MINUTES = 480; // 8 horas

/**
 * Calcula recompensas ganhas enquanto o jogador estava ausente.
 * 
 * @param floorId - Andar onde a party estava farmando
 * @param partyPower - Poder total da party
 * @param awayTimeMs - Tempo ausente em milissegundos
 * @param premiumMultiplier - Multiplicador premium (padrão 1.0)
 */
export function calculateOfflineReward(
  floorId: number,
  partyPower: number,
  awayTimeMs: number,
  premiumMultiplier: number = 1.0
): OfflineReward {
  const minutesAway = Math.min(awayTimeMs / 60000, MAX_OFFLINE_MINUTES);
  const cappedAtMax = awayTimeMs / 60000 > MAX_OFFLINE_MINUTES;

  const rates = getIdleRates(floorId, partyPower);

  const exp = Math.floor(rates.expPerMinute * minutesAway * premiumMultiplier);
  const gold = Math.floor(rates.goldPerMinute * minutesAway * premiumMultiplier);

  // Calcula drops usando rollChance — [EXISTENTE]
  const expectedDrops = Math.floor(rates.dropsPerHour * (minutesAway / 60));
  const itemDrops: string[] = [];
  for (let i = 0; i < expectedDrops; i++) {
    if (rollChance(0.22)) {
      itemDrops.push(`item_drop_${floorId}_${i}`);
    }
  }

  return {
    exp,
    gold,
    itemDrops,
    minutesAway: Math.floor(minutesAway),
    cappedAtMax,
  };
}

// ============================================================
// Formatação de tempo
// ============================================================

/**
 * Formata minutos em texto legível (ex: "3h 24min").
 */
export function formatAwayTime(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) {
    return `${hours}h ${mins}min`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days}d ${remainingHours}h`;
}
