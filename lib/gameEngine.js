/**
 * Regras puras do núcleo do Aetheria.
 * Não acessa React, navegador ou banco de dados: a mesma lógica pode ser testada isoladamente.
 */

/** @param {number} totalItemAttack */
export function calculatePlayerDamage(totalItemAttack) {
  return 25 + Math.floor(Math.max(0, totalItemAttack) / 2);
}

/** @param {number} level */
export function getXpToNextLevel(level) {
  return Math.max(1, Math.floor(level)) * 100;
}

/**
 * Aplica XP e processa todos os níveis alcançados, preservando XP excedente.
 * @param {{ level: number, exp: number, statPoints: number }} character
 * @param {number} xpGained
 * @param {number} [pointsPerLevel]
 */
export function applyExperience(character, xpGained, pointsPerLevel = 5) {
  let level = Math.max(1, Math.floor(character.level));
  let exp = Math.max(0, Math.floor(character.exp)) + Math.max(0, Math.floor(xpGained));
  let statPoints = Math.max(0, Math.floor(character.statPoints));
  let levelsGained = 0;

  while (exp >= getXpToNextLevel(level)) {
    exp -= getXpToNextLevel(level);
    level += 1;
    levelsGained += 1;
    statPoints += pointsPerLevel;
  }

  return { level, exp, statPoints, levelsGained };
}

/** @param {number} currentHp @param {number} damage */
export function resolveMonsterHit(currentHp, damage) {
  const hp = Math.max(0, Math.floor(currentHp));
  const dealt = Math.max(1, Math.floor(damage));
  const remainingHp = Math.max(0, hp - dealt);
  return {
    damage: dealt,
    remainingHp,
    defeated: hp > 0 && remainingHp === 0,
  };
}

/** @param {number} chance A probability from 0 to 1 @param {() => number} [random] */
export function rollChance(chance, random = Math.random) {
  const safeChance = Math.min(1, Math.max(0, chance));
  return random() < safeChance;
}
