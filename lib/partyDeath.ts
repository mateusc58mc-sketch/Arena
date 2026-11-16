/**
 * partyDeath.ts — Lógica de morte na party durante boss fight.
 * 
 * Este módulo é ADITIVO — não altera nenhuma função existente.
 * Regra: se o líder morre, o boss fight é encerrado e volta ao farm.
 * Se todos os membros morrem, mesmo resultado.
 * Membros individuais podem morrer e a luta continua (quando party for implementada).
 * 
 * Uso futuro:
 *   import { handlePartyDeath, shouldEndBossFight } from '@/lib/partyDeath';
 */

// ============================================================
// Tipos
// ============================================================

export interface PartyMemberState {
  id: string;
  name: string;
  isPlayer: boolean;          // true = líder
  isAlive: boolean;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  position: "front" | "mid" | "back";  // Posição na formação
  autoCast: boolean;          // Se skills devem ser lançadas automaticamente
  // [NOVO] Classe e skills do membro (bots IAs têm classe final)
  classId?: string;
  className?: string;
  skills?: string[];          // IDs das skills do membro
  level?: number;             // Nível do membro (bots = nível do líder)
  physicalAttack?: number;    // Ataque físico calculado
  magicAttack?: number;       // Ataque mágico calculado
}

export interface DeathResult {
  shouldEndBossFight: boolean;
  reason: "leader_died" | "all_died" | null;
  aliveMembers: number;
  totalMembers: number;
}

// ============================================================
// Lógica de morte
// ============================================================

/**
 * Verifica se o boss fight deve ser encerrado após uma morte na party.
 * 
 * Regras:
 * - Líder (jogador) morreu → encerra boss fight
 * - Todos os membros morreram → encerra boss fight
 * - Apenas membros IAs morreram → continua a luta
 */
export function shouldEndBossFight(party: PartyMemberState[]): DeathResult {
  const aliveMembers = party.filter((m) => m.isAlive).length;
  const totalMembers = party.length;
  const leader = party.find((m) => m.isPlayer);

  if (leader && !leader.isAlive) {
    return {
      shouldEndBossFight: true,
      reason: "leader_died",
      aliveMembers,
      totalMembers,
    };
  }

  if (aliveMembers === 0) {
    return {
      shouldEndBossFight: true,
      reason: "all_died",
      aliveMembers,
      totalMembers,
    };
  }

  return {
    shouldEndBossFight: false,
    reason: null,
    aliveMembers,
    totalMembers,
  };
}

/**
 * Cria um estado de party padrão para o sistema solo atual.
 * Quando o sistema de party for implementado, isso será substituído.
 */
export function createSoloParty(playerName: string, playerHp: number, playerMaxHp: number): PartyMemberState[] {
  return [
    {
      id: "player-1",
      name: playerName,
      isPlayer: true,
      isAlive: playerHp > 0,
      hp: playerHp,
      maxHp: playerMaxHp,
      mp: playerMaxHp,
      maxMp: playerMaxHp,
      position: "front",
      autoCast: true,
    },
  ];
}

/**
 * Retorna mensagem de log apropriada para a morte.
 */
export function getDeathLogMessage(result: DeathResult): string {
  switch (result.reason) {
    case "leader_died":
      return "💀 Você foi derrotado pelo chefe! Voltando ao farm.";
    case "all_died":
      return "💀 Party derrotada! Voltando ao farm para fortalecer.";
    default:
      return "";
  }
}

/**
 * Verifica se um membro específico morreu e retorna true se sim.
 */
export function isMemberDead(member: PartyMemberState): boolean {
  return !member.isAlive;
}

/**
 * Retorna a lista de membros vivos.
 */
export function getAliveMembers(party: PartyMemberState[]): PartyMemberState[] {
  return party.filter((m) => m.isAlive);
}
