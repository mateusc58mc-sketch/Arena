import test from 'node:test';
import assert from 'node:assert/strict';
import { applyExperience, calculatePlayerDamage, getXpToNextLevel, resolveMonsterHit, rollChance } from '../lib/gameEngine.js';

test('player damage uses the existing prototype formula', () => {
  assert.equal(calculatePlayerDamage(0), 25);
  assert.equal(calculatePlayerDamage(15), 32);
});

test('monster is not defeated until HP reaches zero', () => {
  assert.deepEqual(resolveMonsterHit(120, 40), { damage: 40, remainingHp: 80, defeated: false });
  assert.deepEqual(resolveMonsterHit(20, 40), { damage: 40, remainingHp: 0, defeated: true });
});

test('XP preserves remainder and processes multiple levels', () => {
  assert.equal(getXpToNextLevel(1), 100);
  assert.deepEqual(applyExperience({ level: 1, exp: 90, statPoints: 0 }, 30), {
    level: 2, exp: 20, statPoints: 3, levelsGained: 1,
  });
  assert.deepEqual(applyExperience({ level: 1, exp: 0, statPoints: 0 }, 350), {
    level: 3, exp: 50, statPoints: 6, levelsGained: 2,
  });
});

test('drop probability is clamped and can be deterministic in tests', () => {
  assert.equal(rollChance(0.22, () => 0.21), true);
  assert.equal(rollChance(0.22, () => 0.22), false);
  assert.equal(rollChance(2, () => 0.99), true);
  assert.equal(rollChance(-1, () => 0), false);
});
