/**
 * skillIcons.ts — Gera um ícone determinístico para cada skill, combinando
 * o nome da skill com a classe do personagem (emoji temático + cor da classe).
 */

import type { SkillDefinition } from '@/lib/content/skills';

const KEYWORD_ICONS: Array<[string, string]> = [
  ['meteoro', '☄️'],
  ['bola de fogo', '🔥'],
  ['piromante', '🔥'],
  ['fogo', '🔥'],
  ['nova congelante', '❄️'],
  ['gelo', '❄️'],
  ['glacial', '🧊'],
  ['congelante', '🧊'],
  ['santuario', '🕊️'],
  ['sanctuary', '🕊️'],
  ['bencao', '✨'],
  ['sagrada', '✨'],
  ['sagrado', '✨'],
  ['luz', '✨'],
  ['divina', '⚖️'],
  ['punicao', '⚖️'],
  ['julgamento', '⚖️'],
  ['flecha', '🏹'],
  ['seta', '🏹'],
  ['disparo', '🎯'],
  ['snipe', '🎯'],
  ['olho', '👁️'],
  ['marcado', '🎯'],
  ['armadilha', '🪤'],
  ['lamina', '🗡️'],
  ['lacerar', '🩸'],
  ['envenenar', '☠️'],
  ['veneno', '☠️'],
  ['escudo', '🛡️'],
  ['golpear', '🛡️'],
  ['cura', '💚'],
  ['curar', '💚'],
  ['investida', '🐗'],
  ['berserk', '🪓'],
  ['furia', '🪓'],
  ['fluxo', '🌊'],
  ['mana', '🔮'],
  ['vampirico', '🧛'],
  ['impacto', '💥'],
  ['explosao', '💥'],
  ['insanidade', '🧠'],
  ['mente', '🧠'],
  ['foco', '🎯'],
  ['pele', '🛡️'],
  ['toque', '☝️'],
  ['golpe', '👊'],
  ['basico', '👊'],
];

const FALLBACK_ICONS = ['✦', '✧', '❋', '✶', '✷', '❈', '✹', '✺', '✱', '✲', '❖'];

const CLASS_TINT: Record<string, string> = {
  aprendiz: '#cbd5e1',
  guerreiro: '#f87171',
  paladino: '#ffd98a',
  berserker: '#ff7a5c',
  mago: '#60a5fa',
  arcmago: '#a78bfa',
  bruxo: '#4ade80',
  arqueiro: '#86efac',
  atirador_elite: '#a3e635',
  assassino: '#c084fc',
  clerigo: '#fcd34d',
  sacerdo_divino: '#fde68a',
  inquisidor: '#7cc7ff',
  mercenario: '#94a3b8',
};

export function getClassTint(classId?: string) {
  if (!classId) return '#94a3b8';
  const key = classId.toLowerCase().replace(/[\s_]/g, '');
  return CLASS_TINT[key] ?? '#94a3b8';
}

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function emojiForSkill(skill: SkillDefinition) {
  const name = skill.name.toLowerCase();

  for (const [keyword, emoji] of KEYWORD_ICONS) {
    if (name.includes(keyword)) return emoji;
  }

  return FALLBACK_ICONS[hashString(skill.id + name) % FALLBACK_ICONS.length];
}

export interface SkillIcon {
  emoji: string;
  color: string;
}

export function getSkillIcon(skill: SkillDefinition, classId?: string): SkillIcon {
  return { emoji: emojiForSkill(skill), color: getClassTint(classId) };
}
