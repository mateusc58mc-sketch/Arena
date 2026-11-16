// lib/content/classes.ts
import type { ClassId } from '@/lib/types/core';

export interface ClassDefinition {
  id: ClassId;
  name: string;
  description: string;
  // Distribuição inicial de pontos (soma ~60)
  baseStats: { str: number; agi: number; vit: number; int_stat: number; dex: number; luk: number };
  // Multiplicadores de crescimento por nível
  growth: { str: number; agi: number; vit: number; int_stat: number; dex: number; luk: number };
  // Skills desbloqueadas por nível (ids)
  skillUnlocks: { level: number; skillId: string }[];
  // Arma preferida
  preferredWeapon: string;
}

export const CLASSES: ClassDefinition[] = [
  {
    id: 'aprendiz', name: 'Aprendiz', description: 'Base para todas as classes. Versátil.',
    baseStats: { str: 5, agi: 5, vit: 5, int_stat: 5, dex: 5, luk: 5 },
    growth: { str: 0.5, agi: 0.5, vit: 0.5, int_stat: 0.5, dex: 0.5, luk: 0.5 },
    skillUnlocks: [{ level: 1, skillId: 'basic_attack' }],
    preferredWeapon: 'weapon',
  },
  {
    id: 'guerreiro', name: 'Guerreiro', description: 'Tanque físico de alto dano corpo-a-corpo.',
    baseStats: { str: 12, agi: 6, vit: 12, int_stat: 3, dex: 6, luk: 4 },
    growth: { str: 1.2, agi: 0.5, vit: 1.3, int_stat: 0.2, dex: 0.5, luk: 0.3 },
    skillUnlocks: [{ level: 1, skillId: 'basic_attack' }, { level: 5, skillId: 'power_strike' }, { level: 15, skillId: 'berserk' }],
    preferredWeapon: 'weapon',
  },
  {
    id: 'mago', name: 'Mago', description: 'Dano mágico em área e controle.',
    baseStats: { str: 3, agi: 5, vit: 5, int_stat: 14, dex: 6, luk: 5 },
    growth: { str: 0.2, agi: 0.4, vit: 0.5, int_stat: 1.5, dex: 0.5, luk: 0.4 },
    skillUnlocks: [{ level: 1, skillId: 'basic_attack' }, { level: 3, skillId: 'fireball' }, { level: 12, skillId: 'meteor' }],
    preferredWeapon: 'weapon',
  },
  {
    id: 'arqueiro', name: 'Arqueiro', description: 'Dano à distância e crítico.',
    baseStats: { str: 6, agi: 12, vit: 5, int_stat: 4, dex: 12, luk: 6 },
    growth: { str: 0.5, agi: 1.2, vit: 0.4, int_stat: 0.3, dex: 1.3, luk: 0.6 },
    skillUnlocks: [{ level: 1, skillId: 'basic_attack' }, { level: 4, skillId: 'arrow_rain' }, { level: 10, skillId: 'snipe' }],
    preferredWeapon: 'weapon',
  },
  {
    id: 'clerigo', name: 'Clérigo', description: 'Suporte, cura e ressurreição.',
    baseStats: { str: 4, agi: 5, vit: 8, int_stat: 10, dex: 5, luk: 6 },
    growth: { str: 0.3, agi: 0.4, vit: 0.8, int_stat: 1.1, dex: 0.4, luk: 0.6 },
    skillUnlocks: [{ level: 1, skillId: 'basic_attack' }, { level: 2, skillId: 'heal' }, { level: 8, skillId: 'sanctuary' }],
    preferredWeapon: 'weapon',
  },
  {
    id: 'mercenario', name: 'Mercenário', description: 'Velocidade, esquiva e golpes múltiplos.',
    baseStats: { str: 8, agi: 12, vit: 5, int_stat: 3, dex: 8, luk: 8 },
    growth: { str: 0.7, agi: 1.3, vit: 0.4, int_stat: 0.2, dex: 0.8, luk: 0.8 },
    skillUnlocks: [{ level: 1, skillId: 'basic_attack' }, { level: 6, skillId: 'double_attack' }, { level: 14, skillId: 'assassinate' }],
    preferredWeapon: 'weapon',
  },
];

export function getClass(id: string): ClassDefinition {
  return CLASSES.find((c) => c.id === id) ?? CLASSES[0];
}
