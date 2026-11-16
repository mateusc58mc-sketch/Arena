/**
 * partyEngine.ts — Sistema de Party (4 membros).
 * 
 * Este módulo é ADITIVO — não altera nenhuma função existente.
 * Tipos e helpers para o sistema de party do estilo Ulala.
 * 
 * Uso futuro:
 *   import { createParty, getPartyPower } from '@/lib/partyEngine';
 */

// ============================================================
// Tipos
// ============================================================

export type PartyRole = "tank" | "dps" | "healer" | "leader";

export interface PartyMember {
  id: string;
  name: string;
  role: PartyRole;
  isPlayer: boolean;
  level: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  skills: SkillSlot[];
  buffs: ActiveBuff[];
  isAlive: boolean;
}

export interface SkillSlot {
  slotIndex: number;
  skillId: string;
  cooldownMs: number;
  currentCooldownMs: number;
  isActive: boolean;
}

export interface ActiveBuff {
  buffId: string;
  name: string;
  effect: "attack_up" | "defense_up" | "exp_up" | "gold_up" | "regen";
  value: number;
  remainingMs: number;
}

// ============================================================
// Fábrica de Party
// ============================================================

/**
 * Cria uma party padrão com o jogador como líder e 3 IAs.
 */
export function createParty(playerName: string, playerLevel: number): PartyMember[] {
  return [
    {
      id: "player-1",
      name: playerName,
      role: "leader",
      isPlayer: true,
      level: playerLevel,
      hp: 890,
      maxHp: 890,
      attack: 135,
      defense: 50,
      skills: [],
      buffs: [],
      isAlive: true,
    },
    {
      id: "ai-tank",
      name: "Ragnar (IA)",
      role: "tank",
      isPlayer: false,
      level: playerLevel,
      hp: 2500,
      maxHp: 2500,
      attack: 60,
      defense: 120,
      skills: [],
      buffs: [],
      isAlive: true,
    },
    {
      id: "ai-dps",
      name: "Lyra (IA)",
      role: "dps",
      isPlayer: false,
      level: playerLevel,
      hp: 650,
      maxHp: 650,
      attack: 180,
      defense: 35,
      skills: [],
      buffs: [],
      isAlive: true,
    },
    {
      id: "ai-healer",
      name: "Sage (IA)",
      role: "healer",
      isPlayer: false,
      level: playerLevel,
      hp: 720,
      maxHp: 720,
      attack: 45,
      defense: 40,
      skills: [],
      buffs: [],
      isAlive: true,
    },
  ];
}

// ============================================================
// Cálculos de Party
// ============================================================

/**
 * Poder total da party (soma simplificada de ataque e HP).
 */
export function getPartyPower(party: PartyMember[]): number {
  return party.reduce((total, member) => {
    if (!member.isAlive) return total;
    return total + member.attack * 2 + member.maxHp * 0.1;
  }, 0);
}

/**
 * Verifica se a party está viva (pelo menos o líder vivo).
 */
export function isPartyAlive(party: PartyMember[]): boolean {
  return party.some((m) => m.isPlayer && m.isAlive);
}

/**
 * Calcula sinergia de party (bônus quando todos vivos).
 */
export function getSynergyBonus(party: PartyMember[]): { expMultiplier: number; goldMultiplier: number } {
  const allAlive = party.every((m) => m.isAlive);
  if (allAlive) {
    return { expMultiplier: 1.1, goldMultiplier: 1.1 };
  }
  return { expMultiplier: 1.0, goldMultiplier: 1.0 };
}

/**
 * Distribui buff para toda a party.
 */
export function applyPartyBuff(party: PartyMember[], buff: ActiveBuff): PartyMember[] {
  return party.map((m) => ({
    ...m,
    buffs: [...m.buffs.filter((b) => b.buffId !== buff.buffId), buff],
  }));
}

/**
 * Atualiza cooldowns de skills da party.
 */
export function updateSkillCooldowns(party: PartyMember[], deltaMs: number): PartyMember[] {
  return party.map((m) => ({
    ...m,
    skills: m.skills.map((s) => ({
      ...s,
      currentCooldownMs: Math.max(0, s.currentCooldownMs - deltaMs),
    })),
  }));
}
