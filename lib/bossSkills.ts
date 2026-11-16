/**
 * bossSkills.ts — Sistema de habilidades de Boss.
 * 
 * Este módulo é ADITIVO — não altera nenhuma função existente.
 * Define tipos e helpers para habilidades especiais de boss por andar.
 * 
 * Uso futuro:
 *   import { getBossSkills, resolveBossSkill } from '@/lib/bossSkills';
 */

import type { TowerThemeId } from "./floorScaling.js";

// ============================================================
// Tipos
// ============================================================

export interface BossSkill {
  skillId: string;
  skillName: string;
  triggerCondition: "hp_below_50" | "hp_below_25" | "timer_30s" | "random" | "always";
  effect: "aoe_damage" | "stun_party" | "heal_self" | "buff_attack" | "summon_minion";
  damageMultiplier: number;
  durationSec: number;
  cooldownSec: number;
  description: string;
}

// ============================================================
// Skills de Boss por tema de torre
// ============================================================

const RUINS_BOSS_SKILLS: BossSkill[] = [
  {
    skillId: "fire_trail",
    skillName: "Rastro de Fogo",
    triggerCondition: "hp_below_50",
    effect: "aoe_damage",
    damageMultiplier: 2.0,
    durationSec: 3,
    cooldownSec: 15,
    description: "Projeta uma onda de fogo que causa dano em área",
  },
  {
    skillId: "stone_guard",
    skillName: "Guardião de Pedra",
    triggerCondition: "random",
    effect: "buff_attack",
    damageMultiplier: 1.3,
    durationSec: 10,
    cooldownSec: 30,
    description: "Aumenta o ataque do boss em 30% por 10 segundos",
  },
];

const CRYSTAL_BOSS_SKILLS: BossSkill[] = [
  {
    skillId: "mana_burst",
    skillName: "Explosão de Mana",
    triggerCondition: "hp_below_50",
    effect: "aoe_damage",
    damageMultiplier: 2.5,
    durationSec: 2,
    cooldownSec: 12,
    description: "Explosão de energia mágica que atinge toda a party",
  },
  {
    skillId: "freeze",
    skillName: "Congelar",
    triggerCondition: "random",
    effect: "stun_party",
    damageMultiplier: 0,
    durationSec: 2,
    cooldownSec: 20,
    description: "Congela um membro da party por 2 segundos",
  },
];

const LAVA_BOSS_SKILLS: BossSkill[] = [
  {
    skillId: "lava_wave",
    skillName: "Onda de Lava",
    triggerCondition: "timer_30s",
    effect: "aoe_damage",
    damageMultiplier: 3.0,
    durationSec: 4,
    cooldownSec: 30,
    description: "Uma onda de lava que causa dano massivo em área",
  },
  {
    skillId: "iron_fortress",
    skillName: "Fortaleza de Ferro",
    triggerCondition: "hp_below_25",
    effect: "heal_self",
    damageMultiplier: 0,
    durationSec: 0,
    cooldownSec: 45,
    description: "O boss se cura ao atingir 25% de HP",
  },
];

const CELESTIAL_BOSS_SKILLS: BossSkill[] = [
  {
    skillId: "holy_light",
    skillName: "Luz Sagrada",
    triggerCondition: "always",
    effect: "aoe_damage",
    damageMultiplier: 1.8,
    durationSec: 1,
    cooldownSec: 18,
    description: "Ataque de luz que atinge todos os heróis",
  },
  {
    skillId: "summon_angel",
    skillName: "Invocar Anjo",
    triggerCondition: "hp_below_50",
    effect: "summon_minion",
    damageMultiplier: 0,
    durationSec: 0,
    cooldownSec: 40,
    description: "Invoca um anjo menor para ajudar na batalha",
  },
];

const VOID_BOSS_SKILLS: BossSkill[] = [
  {
    skillId: "void_drain",
    skillName: "Drenagem do Vazio",
    triggerCondition: "hp_below_50",
    effect: "heal_self",
    damageMultiplier: 0.5,
    durationSec: 5,
    cooldownSec: 20,
    description: "Drena vida dos heróis para curar o boss",
  },
  {
    skillId: "shadow_strike",
    skillName: "Golpe Sombrio",
    triggerCondition: "random",
    effect: "aoe_damage",
    damageMultiplier: 2.2,
    durationSec: 3,
    cooldownSec: 14,
    description: "Ataque sombrio que atravessa a armadura",
  },
];

// ============================================================
// API pública
// ============================================================

/**
 * Retorna as habilidades de boss para um determinado tema de torre.
 */
export function getBossSkills(themeId: TowerThemeId): BossSkill[] {
  switch (themeId) {
    case "cidade":
      return [];
    case "ruins":
      return RUINS_BOSS_SKILLS;
    case "crystal":
      return CRYSTAL_BOSS_SKILLS;
    case "lava":
      return LAVA_BOSS_SKILLS;
    case "celestial":
      return CELESTIAL_BOSS_SKILLS;
    case "void":
      return VOID_BOSS_SKILLS;
  }
}

/**
 * Retorna uma habilidade aleatória da lista (para skills de trigger "random").
 */
export function getRandomSkill(skills: BossSkill[]): BossSkill | null {
  if (skills.length === 0) return null;
  return skills[Math.floor(Math.random() * skills.length)];
}

/**
 * Verifica se uma habilidade deve ser ativada baseado no HP atual do boss.
 */
export function shouldTriggerSkill(
  skill: BossSkill,
  bossHpPercent: number
): boolean {
  switch (skill.triggerCondition) {
    case "always":
      return true;
    case "hp_below_50":
      return bossHpPercent <= 50;
    case "hp_below_25":
      return bossHpPercent <= 25;
    default:
      return false;
  }
}

/**
 * Calcula o dano de uma habilidade de boss.
 */
export function calculateBossSkillDamage(
  baseDamage: number,
  skill: BossSkill
): number {
  return Math.floor(baseDamage * skill.damageMultiplier);
}
