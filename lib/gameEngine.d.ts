export interface ExperienceState {
  level: number;
  exp: number;
  statPoints: number;
  levelsGained: number;
}

export function calculatePlayerDamage(totalItemAttack: number): number;
export function getXpToNextLevel(level: number): number;
export function applyExperience(
  character: { level: number; exp: number; statPoints: number },
  xpGained: number,
  pointsPerLevel?: number
): ExperienceState;
export function resolveMonsterHit(currentHp: number, damage: number): {
  damage: number;
  remainingHp: number;
  defeated: boolean;
};
export function rollChance(chance: number, random?: () => number): boolean;
