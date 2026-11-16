/**
 * arenaData.ts — Ponte entre os dados reais do Aetheria e a arena 3D.
 *
 * Módulo puro (sem React/navegador) para que as mesmas regras possam ser
 * testadas isoladamente. NÃO altera nenhuma função existente do jogo.
 *
 * - Heróis: personagem real da conta + 3 bots IAs (Paladino, Atirador, Sacerdote)
 * - Waves: 10 por andar, sendo a 10ª o chefe do andar (getFloor)
 * - Stats: computeDerivedStats / rollDamage (lib/systems/stats)
 */

import type { Character, RaceId, InventoryItem } from '@/lib/types/core';
import { computeDerivedStats } from '@/lib/systems/stats';
import { getFloor, type MonsterDefinition } from '@/lib/content/monsters';
import {
  createBotMember,
  getBotTemplates,
  type BotTemplate,
} from '@/lib/aiSquad';
import { getSkill, getSkillsForClass, getPassiveBonus, type SkillDefinition } from '@/lib/content/skills';
import { ITEM_DATABASE } from '@/lib/gameDatabase';

// ============================================================
// Tipos expostos para os componentes 3D
// ============================================================

export type HeroId = 'knight' | 'barbarian' | 'rogue' | 'mage';

export type HeroDef = {
  id: HeroId;
  name: string;
  className: string;
  level: number;
  model: string;
  position: [number, number, number];
  attackClip: string;
  idleClip: string;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  atk: number;
  defense: number;
  critChance: number;
  critDamage: number;
  cooldown: number;
  /** AGI/DEX para cálculo de ASPD estilo Ragnarök (P1). */
  agi?: number;
  dex?: number;
  /** ASPD calculado em tempo real ou pré-calculado. */
  aspd?: number;
  color: string;
  skill: string;
  skillPower: number;
  role: string;
  isPlayer: boolean;
  positionRole: 'front' | 'mid' | 'back';
  skills: string[];
  isHealer: boolean;
  alive: boolean;
  /** Poder de combate (mesma base do jogo: nível*100 + FOR*15 + ATK itens*10). */
  cp: number;
  /** Escudo (SD) — absorve dano antes do HP. */
  sd: number;
  sdMax: number;
  /** Auto-cast ligado/desligado. */
  autoCast: boolean;
  /** Classe do bot (apenas IAs) — permite trocar no painel. */
  classId?: string;
  /** Raça do personagem (usada para o avatar 3D no combate). */
  race?: string;
};

export type EnemyKind = 'monster' | 'boss';

export type EnemyDef = {
  id: string;
  kind: EnemyKind;
  name: string;
  model: string;
  position: [number, number, number];
  maxHp: number;
  atk: number;
  defense: number;
  exp: number;
  gold: number;
  scale: number;
  cooldown: number;
  barHeight: number;
};

export type WaveDef = {
  index: number;
  title: string;
  subtitle: string;
  enemies: EnemyDef[];
};

export const PORTAL_POSITION: [number, number, number] = [0, 0, -11.4];

export type Position = 'front' | 'mid' | 'back';

/** Formato do `characters.party_config` (idêntico ao usado pelo jogo principal). */
export type PartyConfig = Record<
  string,
  { position: Position; autoCast: boolean; classId?: string }
>;

/**
 * Mapeia o slot da arena para a chave usada no `party_config` do jogo
 * principal — assim as duas telas leem/gravam exatamente o mesmo registro.
 */
export const PARTY_CONFIG_KEYS: Record<HeroId, string> = {
  knight: 'player',
  barbarian: 'tank',
  rogue: 'dps',
  mage: 'healer',
};

/** Posição no campo 3D conforme a formação (front/mid/back). */
export function fieldPosition(x: number, position: Position): [number, number, number] {
  const z = position === 'front' ? 1.2 : position === 'mid' ? 0.2 : 2.6;
  return [x, 0, z];
}

export type DamageLabel = {
  id: string;
  position: [number, number, number];
  amount: number;
  tone: 'enemy' | 'hero' | 'heal';
};

export type BoltData = {
  id: string;
  from: [number, number, number];
  to: [number, number, number];
};

/** Estatísticas individuais do Damage Meter. */
export type SkillStat = {
  name: string;
  total: number;
  hits: number;
  crits: number;
};

export type MemberMeter = {
  damage: number;
  taken: number;
  takenHits: number;
  healed: number;
  healHits: number;
  autoHits: number;
  autoCrits: number;
  autoDamage: number;
  skills: Record<string, SkillStat>;
};

// ============================================================
// Constantes visuais (arquétipos do PoC)
// ============================================================

const MODELS = {
  knight: '/models/aincrad/Knight.glb',
  barbarian: '/models/aincrad/Barbarian.glb',
  rogue: '/models/aincrad/Rogue.glb',
  mage: '/models/aincrad/Mage.glb',
} as const;

const WOLF_MODEL = '/models/aincrad/gloam_wolf.glb';
const BOSS_MODEL = '/models/aincrad/gloam_alpha.glb';
/** Pack "demon drakon" (FBX Maya convertido no Blender): chefe das bandas 0–1. */
export const DEMON_MODEL = '/models/dungeon/demon_dragon.glb';

function bossModelFor(floor: number): string {
  return Math.floor((floor - 1) / 10) < 2 ? DEMON_MODEL : BOSS_MODEL;
}

/**
 * Pack de teste "Bestiary — Dungeon Monsters Kit" (GLB estático, sem clips).
 * As bandas 0–1 do desfiladeiro (andares 1–20) usam esses monstros; da banda 2
 * em diante segue o lobo padrão. O Enemy.tsx preenche idle/ataque/morte de
 * forma procedural enquanto esses modelos não tiverem animações.
 */
const DUNGEON_MODELS = ['/models/dungeon/Imp.glb', '/models/dungeon/Puglin.glb'];

function dungeonModelFor(monster: MonsterDefinition): string | null {
  const band = Math.floor((monster.floor - 1) / 10);
  if (band > 1) return null;

  // Alternância estável por id: Imp e Puglin convivem no mesmo andar
  let hash = 0;
  for (const ch of monster.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return DUNGEON_MODELS[hash % DUNGEON_MODELS.length];
}

const POSITIONS: Record<HeroId, [number, number, number]> = {
  knight: [0, 0, 0.2],
  barbarian: [-2.4, 0, 1.0],
  rogue: [2.4, 0, 1.0],
  mage: [4.0, 0, 3.0],
};

const ARCHETYPES: Record<
  HeroId,
  {
    attackClip: string;
    idleClip: string;
    color: string;
    cooldown: number;
    role: string;
    positionRole: 'front' | 'mid' | 'back';
  }
> = {
  knight: {
    attackClip: '1H_Melee_Attack_Slice_Diagonal',
    idleClip: 'Idle',
    color: '#5bc0eb',
    cooldown: 1.1,
    role: 'Linha de frente',
    positionRole: 'front',
  },
  barbarian: {
    attackClip: '2H_Melee_Attack_Chop',
    idleClip: 'Idle',
    color: '#7bd389',
    cooldown: 1.35,
    role: 'Tanque',
    positionRole: 'front',
  },
  rogue: {
    attackClip: '1H_Melee_Attack_Stab',
    idleClip: 'Idle',
    color: '#f5c451',
    cooldown: 0.6,
    role: 'DPS',
    positionRole: 'mid',
  },
  mage: {
    attackClip: 'Spellcast_Shoot',
    idleClip: 'Idle',
    color: '#c084fc',
    cooldown: 1.6,
    role: 'Suporte',
    positionRole: 'back',
  },
};

const ENEMY_POSITIONS: Record<number, [number, number, number][]> = {
  // Spawn mais perto dos heróis: combinado com a caminhada, eles chegam a
  // tempo de atacar (antes as ondas acabavam durante o trajeto).
  1: [[0, 0, -5.6]],
  2: [
    [-2.6, 0, -5.2],
    [2.6, 0, -5.2],
  ],
  3: [
    [-4.4, 0, -4.6],
    [0, 0, -5.6],
    [4.4, 0, -4.6],
  ],
};

// ============================================================
// Helpers
// ============================================================

function pickMainSkill(skillIds: string[]): SkillDefinition | null {
  const actives = skillIds
    .map((id) => getSkill(id))
    .filter((skill): skill is SkillDefinition => Boolean(skill && skill.type === 'active' && skill.power > 0));

  actives.sort((a, b) => b.power - a.power);
  return actives[0] ?? null;
}

function isHealerName(className: string): boolean {
  const lower = className.toLowerCase();
  return (
    lower.includes('sacerdote') ||
    lower.includes('clerigo') ||
    lower.includes('clérigo') ||
    lower.includes('inquisidor')
  );
}

export function createSyntheticCharacter(level = 25): Character {
  const base = 10 + (level - 1) * 2;
  return {
    id: 'demo-character',
    account_id: 'demo',
    name: 'Herói de Aetheria',
    class_name: 'guerreiro',
    race: 'humano',
    level,
    exp: 0,
    gold: 0,
    premium_currency: 0,
    stat_points: 0,
    talent_points: 0,
    resets: 0,
    tower_floor: 1,
    str: base,
    agi: base,
    vit: base,
    int_stat: base,
    dex: base,
    luk: base,
  };
}

/**
 * Garante **um item por slot**: se o banco tiver mais de um item equipado do
 * mesmo tipo (estado legado), os extras voltam para a bolsa. Assim o cálculo
 * de atributos nunca soma duas armaduras no mesmo slot.
 */
export function normalizeEquipped(inventory: InventoryItem[]): InventoryItem[] {
  const seen = new Set<string>();

  return inventory.map((item) => {
    if (!item.is_equipped) return item;
    if (seen.has(item.item_type)) return { ...item, is_equipped: false };
    seen.add(item.item_type);
    return item;
  });
}

/**
 * Monta a party da arena a partir do personagem real + bots IAs,
 * usando os stats derivados (raça/classe/itens) do Aetheria.
 *
 * O `partyConfig` é o mesmo registro salvo pelo jogo principal
 * (`characters.party_config`), garantindo que as duas telas compartilhem
 * classe de bot, posição e auto-cast.
 */
export function buildArenaParty(
  character: Character,
  inventory: InventoryItem[] = [],
  partyConfig?: PartyConfig,
): HeroDef[] {
  const level = Math.max(1, character.level ?? 1);
  const itemByName = Object.fromEntries(Object.values(ITEM_DATABASE).map((item) => [item.name, item]));
  const equippedInventory = normalizeEquipped(inventory);

  const leaderStats = computeDerivedStats({
    character: { ...character, level },
    raceId: character.race ?? 'humano',
    inventory: equippedInventory,
    itemByName,
  });

  const leaderSkills = getSkillsForClass(character.class_name ?? 'aprendiz');
  const leaderSkill = pickMainSkill(leaderSkills);
  const knight = ARCHETYPES.knight;

  const totalItemAttack = equippedInventory
    .filter((item) => item.is_equipped)
    .reduce((acc, item) => {
      const template = itemByName[item.item_name];
      return acc + (template?.attack ?? 0) + (item.refine_level ?? 0) * 3;
    }, 0);
  const sdMax = 300 + level * 10;
  const cp = Math.floor(level * 100 + (character.str ?? 10) * 15 + totalItemAttack * 10);

  // Passivas são individuais da classe e ficam sempre ativas
  // (não ocupam slot de auto-cast).
  const PASSIVE = getPassiveBonus(character.class_name);
  const leaderMagicAttack = Math.floor(leaderStats.magicAttack * (1 + PASSIVE.int));

  const leaderConfig = partyConfig?.[PARTY_CONFIG_KEYS.knight];
  const leaderPosition = leaderConfig?.position ?? 'front';
  const leaderAutoCast = leaderConfig?.autoCast ?? true;

  const leader: HeroDef = {
    id: 'knight',
    name: character.name ?? 'Herói',
    className: character.class_name ?? 'Aprendiz',
    level,
    model: MODELS.knight,
    position: fieldPosition(POSITIONS.knight[0], leaderPosition),
    attackClip: knight.attackClip,
    idleClip: knight.idleClip,
    hp: leaderStats.maxHp,
    maxHp: leaderStats.maxHp,
    mp: leaderStats.maxMp,
    maxMp: leaderStats.maxMp,
    atk: Math.max(leaderStats.physicalAttack, leaderMagicAttack),
    defense: Math.floor(
      Math.max(leaderStats.physicalDefense, leaderStats.magicDefense) * (1 + PASSIVE.defense),
    ),
    critChance: leaderStats.critChance,
    critDamage: leaderStats.critDamage + PASSIVE.critDamage,
    cooldown: knight.cooldown,
    color: knight.color,
    skill: leaderSkill?.name ?? 'Ataque Básico',
    skillPower: leaderSkill?.power ?? 1,
    role: 'Líder',
    isPlayer: true,
    positionRole: leaderPosition,
    skills: leaderSkills,
    isHealer: isHealerName(character.class_name ?? ''),
    alive: true,
    cp,
    sd: sdMax,
    sdMax,
    autoCast: leaderAutoCast,
    classId: character.class_name,
    race: character.race ?? 'humano',
  };

  const templates = getBotTemplates();

  const botSpecs: Array<{
    id: HeroId;
    fallbackClass: string;
    roleLabel: string;
    defaultPosition: Position;
  }> = [
    { id: 'barbarian', fallbackClass: 'paladino', roleLabel: 'Tanque IA', defaultPosition: 'front' },
    { id: 'rogue', fallbackClass: 'atirador_elite', roleLabel: 'DPS IA', defaultPosition: 'mid' },
    { id: 'mage', fallbackClass: 'sacerdote_divino', roleLabel: 'Suporte IA', defaultPosition: 'back' },
  ];

  const bots: HeroDef[] = botSpecs.map((spec) => {
    const config = partyConfig?.[PARTY_CONFIG_KEYS[spec.id]];
    const template =
      templates.find((candidate) => candidate.classId === config?.classId) ??
      templates.find((candidate) => candidate.classId === spec.fallbackClass)!;
    const position = config?.position ?? spec.defaultPosition;
    const autoCast = config?.autoCast ?? true;
    return buildBotHero(template, level, spec.id, position, autoCast);
  });

  return [leader, ...bots];
}

/**
 * Cria um herói da arena a partir de um template de bot IA.
 * Permite trocar a classe no painel da arena mantendo posição e auto-cast.
 */
export function buildBotHero(
  template: BotTemplate,
  level: number,
  id: HeroId,
  position: 'front' | 'mid' | 'back',
  autoCast = true,
  classIdOverride?: string,
): HeroDef {
  const bot = createBotMember(template, level, id, position);
  const arch = ARCHETYPES[id];
  const mainSkill = pickMainSkill(bot.skills ?? []);
  const healer = isHealerName(bot.className ?? '') || (bot.skills ?? []).includes('heal');
  const sdMax = 300 + (bot.level ?? level) * 10;
  const passive = getPassiveBonus(template.classId);

  return {
    id,
    name: bot.name,
    className: bot.className ?? template.className,
    level: bot.level ?? level,
    model: MODELS[id],
    position: fieldPosition(POSITIONS[id][0], position),
    attackClip: arch.attackClip,
    idleClip: arch.idleClip,
    hp: bot.maxHp,
    maxHp: bot.maxHp,
    mp: bot.maxMp,
    maxMp: bot.maxMp,
    atk: Math.max(bot.physicalAttack ?? 1, Math.floor((bot.magicAttack ?? 1) * (1 + passive.int))),
    defense: Math.max(
      1,
      Math.floor(Math.max(1, Math.floor(bot.maxHp / 80)) * (1 + passive.defense)),
    ),
    critChance: 0.05 + (bot.level ?? level) * 0.003,
    critDamage: 1.5 + passive.critDamage,
    cooldown: arch.cooldown,
    color: arch.color,
    skill: mainSkill?.name ?? 'Ataque Básico',
    skillPower: mainSkill?.power ?? 1,
    role: template.role,
    isPlayer: false,
    positionRole: position,
    skills: bot.skills ?? [],
    isHealer: healer,
    alive: true,
    cp: Math.floor((bot.level ?? level) * 100 + (bot.physicalAttack ?? 1) * 5 + bot.maxHp * 0.05),
    sd: sdMax,
    sdMax,
    autoCast,
    classId: classIdOverride ?? template.classId,
  };
}

/**
 * Membro REAL da party (roster do banco) — usado pelo co-op para montar
 * o squad estendido: o líder arena adiciona os amigos como heróis jogáveis
 * no lugar de bots IA. Determinístico: ambos os lados (host/convidado)
 * computam o mesmo herói a partir das mesmas stats do roster.
 *
 * Nota v1: o inventário/equipamento do amigo entende-se só na tela dele —
 * o herói no mundo do host usa os stats base do banco (sem itens).
 */
export type CoopMate = {
  characterId: string;
  name: string;
  className: string;
  race: string;
  level: number;
  towerFloor: number;
  str: number;
  agi: number;
  vit: number;
  intStat: number;
  dex: number;
  luk: number;
};

export function buildMateHero(
  mate: CoopMate,
  id: HeroId,
  position: 'front' | 'mid' | 'back',
  autoCast = true,
): HeroDef {
  const level = Math.max(1, mate.level ?? 1);
  const itemByName = Object.fromEntries(
    Object.values(ITEM_DATABASE).map((item) => [item.name, item]),
  );

  const stats = computeDerivedStats({
    character: {
      id: mate.characterId,
      account_id: '',
      name: mate.name,
      class_name: mate.className,
      race: mate.race as RaceId ?? 'humano',
      level,
      exp: 0,
      gold: 0,
      premium_currency: 0,
      stat_points: 0,
      talent_points: 0,
      resets: 0,
      tower_floor: mate.towerFloor ?? 1,
      str: mate.str ?? 10,
      agi: mate.agi ?? 10,
      vit: mate.vit ?? 10,
      int_stat: mate.intStat ?? 10,
      dex: mate.dex ?? 10,
      luk: mate.luk ?? 10,
    },
    raceId: (mate.race ?? 'humano') as RaceId,
    inventory: [],
    itemByName,
  });

  const skills = getSkillsForClass(mate.className ?? 'aprendiz');
  const mainSkill = pickMainSkill(skills);
  const arch = ARCHETYPES[id];
  const passive = getPassiveBonus(mate.className ?? '');
  const magicAttack = Math.floor(stats.magicAttack * (1 + passive.int));
  const sdMax = 300 + level * 10;

  return {
    id,
    name: mate.name ?? 'Aliado',
    className: mate.className ?? 'Aprendiz',
    level,
    model: MODELS[id],
    position: fieldPosition(POSITIONS[id][0], position),
    attackClip: arch.attackClip,
    idleClip: arch.idleClip,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    mp: stats.maxMp,
    maxMp: stats.maxMp,
    atk: Math.max(stats.physicalAttack, magicAttack),
    defense: Math.floor(Math.max(stats.physicalDefense, stats.magicDefense) * (1 + passive.defense)),
    critChance: stats.critChance,
    critDamage: stats.critDamage + passive.critDamage,
    cooldown: arch.cooldown,
    color: arch.color,
    skill: mainSkill?.name ?? 'Ataque Básico',
    skillPower: mainSkill?.power ?? 1,
    role: 'Squad',
    isPlayer: false,
    positionRole: position,
    skills,
    isHealer: isHealerName(mate.className ?? ''),
    alive: true,
    cp: Math.floor(level * 100 + (mate.str ?? 10) * 15),
    sd: sdMax,
    sdMax,
    autoCast,
    classId: mate.className,
  };
}

function monsterToEnemy(monster: MonsterDefinition, position: [number, number, number]): EnemyDef {
  const dungeon = dungeonModelFor(monster);
  return {
    id: monster.id,
    kind: 'monster',
    name: monster.name,
    model: dungeon ?? WOLF_MODEL,
    position,
    // Monstros comuns mais resistentes NA ARENA (o jogo original fica igual):
    // HP ×3 e defesa ×2, combinado com spawn mais próximo — antes eles morriam
    // durante a caminhada e quase nunca davam nem um golpe.
    // O chefe não passa por aqui, então fica intocado.
    maxHp: Math.round(monster.hp * 3),
    atk: monster.attack,
    defense: Math.round(monster.defense * 2),
    exp: monster.exp,
    gold: monster.gold,
    // Imp/Puglin são humanoides (~1,9 u): escala e barra menores que as do lobo
    scale: dungeon ? 1.35 : 1.72,
    cooldown: 2600,
    barHeight: dungeon ? 2.4 : 2.75,
  };
}

/**
 * Gera as 10 waves de um andar. A wave 10 é sempre o chefe do andar,
 * acompanhado de 2 monstros comuns (como no Godot/Aetheria).
 */
export function buildFloorWaves(floor: number): WaveDef[] {
  const def = getFloor(floor);
  const waves: WaveDef[] = [];

  for (let wave = 1; wave <= 10; wave += 1) {
    let enemies: EnemyDef[];

    if (wave === 10) {
      const boss: EnemyDef = {
        id: def.boss.id,
        kind: 'boss',
        name: def.boss.name,
        model: bossModelFor(floor),
        position: [0, 0, -7.6],
        maxHp: def.boss.hp,
        atk: def.boss.attack,
        defense: def.boss.defense,
        exp: def.boss.exp,
        gold: def.boss.gold,
        // O demon drakon já é alto (~4,7 u); escala menor que a do lobo alfa
        scale: Math.floor((floor - 1) / 10) < 2 ? 1.15 : 3.1,
        cooldown: 2100,
        barHeight: Math.floor((floor - 1) / 10) < 2 ? 4.8 : 4.6,
      };

      const minions = [
        monsterToEnemy(def.monsters[0], [-4.6, 0, -6.0]),
        monsterToEnemy(def.monsters[1] ?? def.monsters[0], [4.6, 0, -6.0]),
      ];

      enemies = [boss, ...minions];
      waves.push({
        index: wave,
        title: `Andar ${floor} · Chefe`,
        subtitle: `${def.boss.name} — o guardião do portal despertou.`,
        enemies,
      });
      continue;
    }

    const count = wave <= 3 ? 1 : wave <= 6 ? 2 : 3;
    const positions = ENEMY_POSITIONS[count];
    enemies = Array.from({ length: count }, (_, i) => {
      const monster = def.monsters[(wave + i * 2) % def.monsters.length];
      return monsterToEnemy(monster, positions[i]);
    });

    waves.push({
      index: wave,
      title: `Andar ${floor} · Wave ${wave}/10`,
      subtitle:
        wave === 1
          ? `A party avança pelo ${def.biome}.`
          : `O ${def.biome} resiste. ${count} inimigo(s) à frente.`,
      enemies,
    });
  }

  return waves;
}

export function enemyHpMap(wave: WaveDef): Record<string, number> {
  return Object.fromEntries(wave.enemies.map((enemy) => [enemy.id, enemy.maxHp]));
}

export function heroHpMap(heroes: HeroDef[]): Record<string, number> {
  return Object.fromEntries(heroes.map((hero) => [hero.id, hero.hp]));
}

/** Personagem de fallback para quando não há sessão/personagem (modo demo). */
export function createDemoParty(level = 25): HeroDef[] {
  return buildArenaParty(createSyntheticCharacter(level), []);
}

export { ITEM_DATABASE };
