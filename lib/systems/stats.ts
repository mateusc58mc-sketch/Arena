// lib/systems/stats.ts
import type { Character, InventoryItem, DerivedStats } from '@/lib/types/core';
import type { ItemTemplate } from '@/lib/types/core';
import type { RaceId } from '@/lib/types/core';
import { getRace } from '@/lib/content/races';

export function itemByNameMap(items: ItemTemplate[]): Record<string, ItemTemplate> {
  return Object.fromEntries(items.map((i) => [i.name, i]));
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

// Aplica modificadores raciais percentuais sobre os stats base.
export function applyRaceModifiers(
  base: { str: number; agi: number; vit: number; int_stat: number; dex: number; luk: number },
  raceId?: RaceId
): { str: number; agi: number; vit: number; int_stat: number; dex: number; luk: number } {
  const race = raceId ? getRace(raceId) : null;
  const m = race?.modifiers ?? {};
  const out = { ...base };
  for (const key of ['str', 'agi', 'vit', 'int_stat', 'dex', 'luk'] as const) {
    const mod = m[key] ?? 0;
    out[key] = Math.floor(base[key] * (1 + mod));
  }
  return out;
}

export function computeDerivedStats(params: {
  character: Partial<Character> & { level: number };
  raceId?: RaceId;
  classId?: string;
  inventory: InventoryItem[];
  itemByName: Record<string, ItemTemplate>;
}): DerivedStats {
  const { character, raceId, inventory, itemByName } = params;

  const base = {
    str: character.str ?? 10,
    agi: character.agi ?? 10,
    vit: character.vit ?? 10,
    int_stat: character.int_stat ?? 10,
    dex: character.dex ?? 10,
    luk: character.luk ?? 10,
  };

  const raced = applyRaceModifiers(base, raceId);

  // Soma dos itens equipados.
  const equipped = inventory.filter((i) => i.is_equipped);
  let itemAttack = 0;
  let itemDefense = 0;
  const itemBonuses = { str: 0, agi: 0, vit: 0, int_stat: 0, dex: 0, luk: 0 };

  for (const item of equipped) {
    const tpl = itemByName[item.item_name];
    if (!tpl) continue;
    itemAttack += (tpl.attack || 0) + (item.refine_level || 0) * 3;
    itemDefense += (tpl.defense || 0) + (item.refine_level || 0) * 2;
    itemBonuses.str += tpl.str || 0;
    itemBonuses.agi += tpl.agi || 0;
    itemBonuses.vit += tpl.vit || 0;
    itemBonuses.int_stat += tpl.int_stat || 0;
    itemBonuses.dex += tpl.dex || 0;
    itemBonuses.luk += tpl.luk || 0;
  }

  const str = raced.str + itemBonuses.str;
  const agi = raced.agi + itemBonuses.agi;
  const vit = raced.vit + itemBonuses.vit;
  const int_stat = raced.int_stat + itemBonuses.int_stat;
  const dex = raced.dex + itemBonuses.dex;
  const luk = raced.luk + itemBonuses.luk;

  const level = Math.max(1, character.level ?? 1);

  // GDD: VIT +1% HP Máximo/ponto; INT +1% MP Máximo/ponto.
  const maxHp = 500 + level * 25 + Math.floor(Math.pow(level, 1.85) * 2 * (1 + vit * 0.015));
  const baseMp = 100 + level * 5;
  const maxMp = Math.floor(baseMp * (1 + int_stat * 0.01));
  const maxSd = 300 + level * 10;

  // Fórmulas GDD: FOR +2 ATK físico/ponto; SOR +1 ATK/MATK a cada 3 pontos.
  const physicalAttack = Math.floor(10 + level * 2 + str * 2 + Math.floor(luk / 3) + itemAttack);
  // INT +2 MATK mágico/ponto; SOR +1 MATK a cada 3 pontos.
  const magicAttack = Math.floor(10 + level * 2 + int_stat * 2 + Math.floor(luk / 3) + Math.floor(itemAttack * 0.4));
  // VIT +1 DEF física/ponto.
  const physicalDefense = Math.floor(vit * 1 + itemDefense);
  // MDEF baseada em INT.
  const magicDefense = Math.floor(int_stat * 1 + Math.floor(itemDefense * 0.6));

  const attackSpeed = clamp(1.0 + agi * 0.015, 0.5, 4.0);
  // SOR +0.3% CRIT/ponto.
  const critChance = clamp(0.05 + luk * 0.003 + itemBonuses.luk * 0.002, 0, 0.75);
  const critDamage = 1.5 + luk * 0.005;
  // AGI aumenta FLEE (esquiva).
  const dodge = clamp(0.03 + agi * 0.01, 0, 0.6);
  // DES +1 HIT (precisão).
  const accuracy = clamp(0.8 + dex * 0.005, 0.5, 0.99);
  // Lifesteal base para morto-vivo; outros 0 (extensível via equipamento/classes)
  const lifesteal = raceId === 'morto_vivo' ? 0.08 + itemBonuses.luk * 0.001 : 0;

  return {
    level,
    str, agi, vit, int_stat, dex, luk,
    maxHp, maxMp, maxSd,
    physicalAttack, magicAttack,
    physicalDefense, magicDefense,
    attackSpeed, critChance, critDamage, dodge, accuracy, lifesteal,
  };
}

// Fórmula de ASPD estilo Ragnarök/iRO (isolada — não substitui attackSpeed ainda).
// Intervalo entre ataques: (200 - ASPD) / 50 segundos.
export interface ASPDConfig {
  baseAspd: number; // Ex: 140 magos, 150 guerreiros, 156 assassinos
  agi: number;
  dex: number;
  aspdBonusPercent?: number; // Ex: +30% do Berserk
}

export function calculateRagnarokASPD(config: ASPDConfig): { aspd: number; attackIntervalSec: number } {
  const { baseAspd, agi, dex, aspdBonusPercent = 0 } = config;

  const statBonus = Math.sqrt(agi * 9.99 + dex * 0.11) * (1 - baseAspd / 200);

  let rawAspd = baseAspd + statBonus;

  if (aspdBonusPercent > 0) {
    rawAspd += (200 - rawAspd) * (aspdBonusPercent / 100);
  }

  const finalAspd = Math.min(193, Math.max(100, Math.floor(rawAspd)));
  const attackIntervalSec = Math.max(0.2, (200 - finalAspd) / 50);

  return { aspd: finalAspd, attackIntervalSec };
}
export function rollDamage(
  attacker: { physicalAttack: number; critChance: number; critDamage: number },
  defenderDefense: number,
  random: () => number = Math.random
): { damage: number; critical: boolean } {
  const base = Math.max(1, attacker.physicalAttack - Math.floor(defenderDefense / 2));
  const critical = random() < attacker.critChance;
  const damage = critical ? Math.floor(base * attacker.critDamage) : base;
  return { damage: Math.max(1, damage), critical };
}
