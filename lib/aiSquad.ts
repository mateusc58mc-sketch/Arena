/**
 * aiSquad.ts — Sistema de bots IAs com classes finais.
 * 
 * Cada bot tem: classe final, nível = líder, stats distribuídos pela classe,
 * skills da classe, dano individual e auto-cast (exceto cura).
 */

import type { PartyMemberState } from './partyDeath';
import { getClass } from '@/lib/content/classes';
import { getSkillsForClass } from '@/lib/content/skills';
import { getSkill } from '@/lib/content/skills';
import { applyRaceModifiers } from '@/lib/systems/stats';

// ============================================================
// Templates de bots por classe final
// ============================================================

export interface BotTemplate {
  classId: string;
  className: string;
  role: string;
  baseRace: 'humano' | 'anao' | 'elfo' | 'goblin' | 'orc' | 'morto_vivo' | 'troll' | 'tauren' | 'pandaren';
}

export const BOT_TEMPLATES: BotTemplate[] = [
  { classId: 'paladino', className: 'Paladino', role: 'Tanque / Suporte', baseRace: 'humano' },
  { classId: 'berserker', className: 'Berserker', role: 'DPS Físico', baseRace: 'orc' },
  { classId: 'atirador_elite', className: 'Atirador de Elite', role: 'DPS à distância', baseRace: 'elfo' },
  { classId: 'assassino', className: 'Assassino', role: 'DPS Crítico', baseRace: 'goblin' },
  { classId: 'sacerdote_divino', className: 'Sacerdote Divino', role: 'Curador', baseRace: 'elfo' },
  { classId: 'inquisidor', className: 'Inquisidor', role: 'DPS Mágico / Sustentado', baseRace: 'elfo' },
  { classId: 'arcmago', className: 'Arcmago', role: 'DPS Mágico', baseRace: 'humano' },
  { classId: 'bruxo', className: 'Bruxo', role: 'DoT / Sustentado', baseRace: 'elfo' },
];

// ============================================================
// Fábrica de bots
// ============================================================

/**
 * Cria um bot IA com classe final, nível do líder, stats e skills da classe.
 */
export function createBotMember(
  template: BotTemplate,
  leaderLevel: number,
  memberId: string,
  position: 'front' | 'mid' | 'back' = 'mid'
): PartyMemberState {
  const cls = getClass(template.classId);
  const raced = applyRaceModifiers(cls.baseStats, template.baseRace);

  const lvl = Math.max(1, leaderLevel);
  const pointsFromLevel = (lvl - 1) * 5;

  const growthTotal = cls.growth.str + cls.growth.agi + cls.growth.vit + cls.growth.int_stat + cls.growth.dex + cls.growth.luk;
  const str = raced.str + Math.floor(pointsFromLevel * (cls.growth.str / growthTotal));
  const agi = raced.agi + Math.floor(pointsFromLevel * (cls.growth.agi / growthTotal));
  const vit = raced.vit + Math.floor(pointsFromLevel * (cls.growth.vit / growthTotal));
  const intStat = raced.int_stat + Math.floor(pointsFromLevel * (cls.growth.int_stat / growthTotal));
  const dex = raced.dex + Math.floor(pointsFromLevel * (cls.growth.dex / growthTotal));
  const luk = raced.luk + Math.floor(pointsFromLevel * (cls.growth.luk / growthTotal));

  const maxHp = Math.floor(500 + lvl * 25 + Math.pow(lvl, 1.85) * 2 * (1 + vit * 0.015));

  // Skills ativas da classe
  const skillIds = getSkillsForClass(template.classId).filter((id) => {
    const skill = getSkill(id);
    return skill && skill.type === 'active';
  });

  // Calcula ataque físico e mágico do bot
  const physicalAttack = Math.floor(10 + lvl * 2 + str * 2 + Math.floor(luk / 3));
  const magicAttack = Math.floor(10 + lvl * 2 + intStat * 2 + Math.floor(luk / 3));

  const maxMp = Math.floor((100 + lvl * 5) * (1 + intStat * 0.01));
  return {
    id: memberId,
    name: `Bot ${template.className}`,
    isPlayer: false,
    isAlive: true,
    hp: maxHp,
    maxHp,
    mp: maxMp,
    maxMp,
    position,
    autoCast: true,
    classId: template.classId,
    className: template.className,
    skills: skillIds,
    level: lvl,
    physicalAttack,
    magicAttack,
  };
}

/**
 * Retorna todos os templates disponíveis.
 */
export function getBotTemplates(): BotTemplate[] {
  return BOT_TEMPLATES;
}

/**
 * Retorna um template por classId.
 */
export function getBotTemplate(classId: string): BotTemplate | undefined {
  return BOT_TEMPLATES.find((t) => t.classId === classId);
}
