// lib/content/monsters.ts
// Gerador procedural de andares "infinitos" inspirado nos monstros animais
// do Metin2 (https://pt-wiki.metin2.gameforge.com), adaptado ao Aetheria.
// A torre não tem limite fixo: getFloor(floor) gera o andar sob demanda.

export interface MonsterDefinition {
  id: string;
  name: string;
  floor: number;
  hp: number;
  attack: number;
  defense: number;
  exp: number;
  gold: number;
  boss: boolean;
  sprite?: string;
}

export interface FloorDefinition {
  floor: number;
  name: string;
  biome: string;
  unlockLevel: number;        // nível mínimo para desbloquear (alternativa ao boss)
  monsters: MonsterDefinition[]; // conjunto de monstros comuns do andar
  boss: MonsterDefinition;
}

// Famílias (animais/Metin) por bandas de 10 andares. Repetem em espiral
// (banda 0..N) com dificuldade crescente para permitir "torre infinita".
const FAMILIES = [
  { biome: 'Planície de Prontera', names: ['Cão Selvagem', 'Javali Selvagem', 'Lobo', 'Urso', 'Tigre'] },
  { biome: 'Floresta de Payon', names: ['Lobo Azul', 'Urso Cinza', 'Tigre Branco', 'Aranha', 'Aranha Vermelha'] },
  { biome: 'Mina Abandonada', names: ['Goblin Mineiro', 'Soldado Macaco', 'Lançador Macaco', 'Lutador Macaco'] },
  { biome: 'Ruínas de Glast Heim', names: ['Lobo Maldito', 'Urso Maldito', 'Aranha Rubi', 'Aranha Soldado'] },
  { biome: 'Deserto de Morroc', names: ['Gnoll Guerreiro', 'Gnoll Arqueiro', 'Mantícora', 'Executor Mantícora'] },
  { biome: 'Caverna do Tempo', names: ['Ogre Archie', 'Ogre Mago', 'Ogre Briguento', 'Rakshasa'] },
];

const BOSSES = [
  'Lobo Alfa Maldito', 'Aranha Coronel', 'General Macaco', 'Urso Cinza Maldito',
  'Lorde Gnoll', 'O Grande Ogre',
];

const VARIANT = ['', ' Feroz', ' Maldito'];

function scale(base: number, floor: number, mult: number): number {
  return Math.max(1, Math.floor(base * Math.pow(mult, floor - 1)));
}

function familyForFloor(floor: number) {
  const band = Math.floor((floor - 1) / 10) % FAMILIES.length;
  return FAMILIES[band];
}

function generateMonster(floor: number, name: string, index: number, isBoss: boolean): MonsterDefinition {
  const baseHp = isBoss ? 900 : 110;
  const baseAtk = isBoss ? 45 : 9;
  const baseDef = isBoss ? 20 : 4;
  const baseExp = isBoss ? 400 : 30;
  const baseGold = isBoss ? 250 : 20;

  const mult = isBoss ? 1.30 : 1.22;
  const nameVariant = isBoss ? '' : VARIANT[index % VARIANT.length];
  const full = `${name}${nameVariant}`.trim();

  return {
    id: `${full.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_f${floor}`,
    name: full,
    floor,
    hp: scale(baseHp, floor, mult) + index * 7,
    attack: scale(baseAtk, floor, mult),
    defense: scale(baseDef, floor, mult * 0.8),
    exp: scale(baseExp, floor, mult),
    gold: scale(baseGold, floor, mult),
    boss: isBoss,
    sprite: isBoss ? '👹' : '🐾',
  };
}

export function getFloorUnlockLevel(floor: number): number {
  // A cada 2 andares sobe 1 nível mínimo sugerido.
  return 1 + Math.floor((floor - 1) / 2);
}

export function getFloor(floor: number): FloorDefinition {
  const f = Math.max(1, Math.floor(floor));
  const fam = familyForFloor(f);
  // Conjunto de 3 monstros comuns, variando por andar.
  const commonCount = 3;
  const names: string[] = [];
  for (let i = 0; i < commonCount; i++) {
    names.push(fam.names[(f + i * 2) % fam.names.length]);
  }
  // dedup mantendo ordem
  const uniqueNames = [...new Set(names)];
  const monsters = uniqueNames.map((n, idx) => generateMonster(f, n, idx, false));

  const bossName = BOSSES[f % BOSSES.length];
  const boss = generateMonster(f, bossName, 0, true);

  return {
    floor: f,
    name: `Andar ${f}: ${fam.biome}`,
    biome: fam.biome,
    unlockLevel: getFloorUnlockLevel(f),
    monsters,
    boss,
  };
}

// Desbloqueio: nível mínimo OU chefe do andar anterior derrotado.
export function isFloorUnlocked(floor: number, playerLevel: number, highestCleared: number): boolean {
  if (floor <= 1) return true;
  if (highestCleared >= floor - 1) return true;
  if (playerLevel >= getFloorUnlockLevel(floor)) return true;
  return false;
}

// Lista compacta para compatibilidade com código legado (primeiros 24 andares).
export const TOWER_FLOORS_COMPAT = Array.from({ length: 24 }, (_, i) => {
  const fl = getFloor(i + 1);
  return {
    floor: fl.floor,
    name: fl.name,
    monster: fl.monsters[0].name,
    hp: fl.monsters[0].hp,
    maxHp: fl.monsters[0].hp,
    exp: fl.monsters[0].exp,
    gold: fl.monsters[0].gold,
    boss: fl.boss.name,
    bossHp: fl.boss.hp,
    unlockLevel: fl.unlockLevel,
  };
});
