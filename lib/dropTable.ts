/**
 * dropTable.ts — Sistema de drops estruturado com pity (P1 item 7).
 *
 * ADITIVO — não altera nenhuma função existente. Define tabelas de drop
 * por monstro e um mecanismo de "pity" (garantia de drop raro após N kills
 * sem drop). A integração com o inventário ocorre via ArenaClient.
 *
 * Uso:
 *   import { rollDrops, DropEntry } from '@/lib/dropTable';
 *   const drops = rollDrops(monsterId, floor, pityCounter);
 */

export interface DropEntry {
  itemId: string;
  /** Probabilidade de drop (0..1). */
  chance: number;
  /** Quantidade mínima. */
  minQty: number;
  /** Quantidade máxima. */
  maxQty: number;
  /** Se true, este drop pode ser afetado por pity. */
  pityEligible: boolean;
}

export interface DropResult {
  itemId: string;
  qty: number;
}

/** Contador de pity por item (quantas kills sem dropar). */
export type PityState = Record<string, number>;

/**
 * Tabela de drops por monstro.
 * Chave: ID do monstro (ou 'boss' para chefes, 'common' para genérico).
 */
const DROP_TABLES: Record<string, DropEntry[]> = {
  common: [
    { itemId: 'poção_de_hp', chance: 0.15, minQty: 1, maxQty: 2, pityEligible: false },
    { itemId: 'poção_de_mp', chance: 0.10, minQty: 1, maxQty: 1, pityEligible: false },
    { itemId: 'gold_coin', chance: 0.05, minQty: 1, maxQty: 5, pityEligible: false },
  ],
  boss: [
    { itemId: 'poção_de_hp', chance: 0.50, minQty: 2, maxQty: 4, pityEligible: false },
    { itemId: 'poção_de_mp', chance: 0.40, minQty: 2, maxQty: 3, pityEligible: false },
    { itemId: 'rare_weapon', chance: 0.08, minQty: 1, maxQty: 1, pityEligible: true },
    { itemId: 'rare_armor', chance: 0.06, minQty: 1, maxQty: 1, pityEligible: true },
    { itemId: 'boss_trophy', chance: 1.0, minQty: 1, maxQty: 1, pityEligible: false },
  ],
};

/**
 * Pity: após N kills sem dropar item elegível, garante o drop.
 * Padrão: 50 kills para itens raros.
 */
const PITY_THRESHOLD = 50;

/**
 * Resolve a tabela de drops para um monstro.
 * Retorna lista de drops com quantidades.
 */
export function rollDrops(
  monsterKind: 'monster' | 'boss',
  floor: number,
  pity: PityState,
): { drops: DropResult[]; newPity: PityState } {
  const tableKey = monsterKind === 'boss' ? 'boss' : 'common';
  const table = DROP_TABLES[tableKey] ?? DROP_TABLES.common;
  const newPity = { ...pity };
  const drops: DropResult[] = [];

  for (const entry of table) {
    // Pity: se elegível e contador >= threshold, garante drop.
    let effectiveChance = entry.chance;
    if (entry.pityEligible) {
      const counter = newPity[entry.itemId] ?? 0;
      if (counter >= PITY_THRESHOLD) {
        effectiveChance = 1.0;
      }
    }

    if (Math.random() < effectiveChance) {
      const qty =
        entry.minQty +
        Math.floor(Math.random() * (entry.maxQty - entry.minQty + 1));
      drops.push({ itemId: entry.itemId, qty });
      // Reset pity counter on drop.
      if (entry.pityEligible) {
        newPity[entry.itemId] = 0;
      }
    } else {
      // Increment pity counter on miss.
      if (entry.pityEligible) {
        newPity[entry.itemId] = (newPity[entry.itemId] ?? 0) + 1;
      }
    }
  }

  return { drops, newPity };
}

/**
 * Retorna a tabela de drops para um tipo de monstro (para exibição no HUD).
 */
export function getDropTable(monsterKind: 'monster' | 'boss'): DropEntry[] {
  const key = monsterKind === 'boss' ? 'boss' : 'common';
  return DROP_TABLES[key] ?? DROP_TABLES.common;
}
