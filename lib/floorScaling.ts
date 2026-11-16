/**
 * floorScaling.ts — Fórmulas de escalonamento para a Torre Infinita.
 * 
 * Este módulo é ADITIVO — não altera nenhuma função existente.
 * As funções existentes em gameEngine.js e gameDatabase.ts permanecem intactas.
 * 
 * Uso futuro:
 *   import { getMobHp, getBossHp, getExpPerMob, getGoldPerMob } from '@/lib/floorScaling';
 */

// ============================================================
// Escalonamento exponencial de atributos por andar
// ============================================================

/**
 * HP de mob comum no andar N.
 * Andar 1 = 120 (base existente em TOWER_FLOORS_DB[0].hp).
 * Cresce 18% por andar.
 */
export function getMobHp(floorId: number): number {
  const baseHp = 120;
  return Math.floor(baseHp * Math.pow(1.18, floorId - 1));
}

/**
 * Ataque de mob comum no andar N.
 * Andar 1 = 10.
 * Cresce 12% por andar.
 */
export function getMobAttack(floorId: number): number {
  const baseAttack = 10;
  return Math.floor(baseAttack * Math.pow(1.12, floorId - 1));
}

/**
 * Defesa de mob comum no andar N.
 * Andar 1 = 5.
 * Cresce 10% por andar.
 */
export function getMobDefense(floorId: number): number {
  const baseDefense = 5;
  return Math.floor(baseDefense * Math.pow(1.1, floorId - 1));
}

/**
 * HP de boss no andar N.
 * Andar 1 = 600 (base existente em TOWER_FLOORS_DB[0].bossHp).
 * Cresce 22% por andar.
 */
export function getBossHp(floorId: number): number {
  const baseBossHp = 600;
  return Math.floor(baseBossHp * Math.pow(1.22, floorId - 1));
}

/**
 * Ataque de boss no andar N.
 */
export function getBossAttack(floorId: number): number {
  const baseBossAttack = 50;
  return Math.floor(baseBossAttack * Math.pow(1.15, floorId - 1));
}

// ============================================================
// Escalonamento de recompensas
// ============================================================

/**
 * EXP por mob no andar N.
 * Andar 1 = 30 (base existente).
 * Cresce 8% por andar.
 */
export function getExpPerMob(floorId: number): number {
  const baseExp = 30;
  return Math.floor(baseExp * Math.pow(1.08, floorId - 1));
}

/**
 * Ouro por mob no andar N.
 * Andar 1 = 20 (base existente).
 * Cresce 8% por andar.
 */
export function getGoldPerMob(floorId: number): number {
  const baseGold = 20;
  return Math.floor(baseGold * Math.pow(1.08, floorId - 1));
}

// ============================================================
// Marcos de dificuldade (Elite / Guardian)
// ============================================================

export interface MilestoneInfo {
  isElite: boolean;
  isGuardian: boolean;
  isMegaGuardian: boolean;
  hpMultiplier: number;
  attackMultiplier: number;
  rewardMultiplier: number;
}

export function getMilestoneInfo(floorId: number): MilestoneInfo {
  const isMegaGuardian = floorId % 100 === 0;
  const isGuardian = !isMegaGuardian && floorId % 50 === 0;
  const isElite = !isGuardian && !isMegaGuardian && floorId % 10 === 0;

  if (isMegaGuardian) {
    return { isElite, isGuardian, isMegaGuardian, hpMultiplier: 10, attackMultiplier: 3, rewardMultiplier: 5 };
  }
  if (isGuardian) {
    return { isElite, isGuardian, isMegaGuardian, hpMultiplier: 5, attackMultiplier: 2, rewardMultiplier: 3 };
  }
  if (isElite) {
    return { isElite, isGuardian, isMegaGuardian, hpMultiplier: 2, attackMultiplier: 1.5, rewardMultiplier: 1.5 };
  }
  return { isElite, isGuardian, isMegaGuardian, hpMultiplier: 1, attackMultiplier: 1, rewardMultiplier: 1 };
}

// ============================================================
// Temas da torre (a cada 10 andares)
// ============================================================

export type TowerThemeId = "cidade" | "ruins" | "crystal" | "lava" | "celestial" | "void";

export interface TowerTheme {
  id: TowerThemeId;
  name: string;
  floorRange: string;
  palette: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
  };
  description: string;
}

export function getTowerTheme(floorId: number): TowerTheme {
  // Andar 0 é a Cidade (mercado, forja e alquimista) — não tem chefe.
  if (floorId <= 0) {
    return {
      id: "cidade",
      name: "Cidade de Aetheria",
      floorRange: "Andar 0 (Cidade)",
      palette: {
        primary: "#e9c46a",
        secondary: "#3a3123",
        accent: "#ffd166",
        background: "#1a1409",
      },
      description: "Mercado, forja e alquimista",
    };
  }

  const cycle = (((Math.floor((floorId - 1) / 10) % 5) + 5) % 5);

  const themes: TowerTheme[] = [
    {
      id: "ruins",
      name: "Ruínas de Pedra",
      floorRange: "Andares 1-10, 51-60, 101-110...",
      palette: { primary: "#8B7355", secondary: "#4A4A4A", accent: "#FF8C00", background: "#1a1510" },
      description: "Tochas, musgo, estátuas quebradas",
    },
    {
      id: "crystal",
      name: "Cristal e Mana",
      floorRange: "Andares 11-20, 61-70, 111-120...",
      palette: { primary: "#4FC3F7", secondary: "#7C4DFF", accent: "#E1F5FE", background: "#0a0a1a" },
      description: "Cristais flutuantes, partículas de mana",
    },
    {
      id: "lava",
      name: "Lava e Ferro",
      floorRange: "Andares 21-30, 71-80, 121-130...",
      palette: { primary: "#D32F2F", secondary: "#212121", accent: "#FF5722", background: "#1a0a0a" },
      description: "Rios de lava, correntes, engrenagens",
    },
    {
      id: "celestial",
      name: "Celestial",
      floorRange: "Andares 31-40, 81-90, 131-140...",
      palette: { primary: "#FFD700", secondary: "#FFFFFF", accent: "#87CEEB", background: "#0a0a2a" },
      description: "Nuvens, colunas de luz, asas",
    },
    {
      id: "void",
      name: "Void / Abismo",
      floorRange: "Andares 41-50, 91-100, 141-150...",
      palette: { primary: "#4A148C", secondary: "#000000", accent: "#00E676", background: "#0a0014" },
      description: "Olhos sombrios, tentáculos, portal",
    },
  ];

  return themes[cycle];
}
