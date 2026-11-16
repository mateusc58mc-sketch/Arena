// lib/content/races.ts
import type { RaceId } from '@/lib/types/core';

export interface RaceDefinition {
  id: RaceId;
  name: string;
  bonusName: string;
  description: string;
  // Modificadores percentuais aplicados sobre os stats base (0.10 = +10%).
  modifiers: Partial<Record<'str' | 'agi' | 'vit' | 'int_stat' | 'dex' | 'luk', number>>;
  // Modificadores econômicos (para futuro: RMT, vendas, etc.).
  economy: {
    goldGainMultiplier: number;
    xpGainMultiplier: number;
    vendorSellMultiplier: number;
    refineCostMultiplier: number;
  };
  // Hook reservado para mecânicas especiais (lifesteal, berserk, etc.).
  special?: string;
}

export const RACES: RaceDefinition[] = [
  { id: 'humano', name: 'Humano', bonusName: 'Espírito Humano', description: 'Versátil. +10% de ouro e XP ao caçar.', modifiers: {}, economy: { goldGainMultiplier: 1.1, xpGainMultiplier: 1.1, vendorSellMultiplier: 1.0, refineCostMultiplier: 1.0 } },
  { id: 'anao', name: 'Anão', bonusName: 'Pele de Pedra', description: 'Alta defesa física e desconto na forja.', modifiers: { vit: 0.15, str: 0.05 }, economy: { goldGainMultiplier: 1.0, xpGainMultiplier: 1.0, vendorSellMultiplier: 1.0, refineCostMultiplier: 0.85 } },
  { id: 'elfo', name: 'Elfo', bonusName: 'Agilidade Ancestral', description: 'Esquiva, precisão e crítico elevados.', modifiers: { agi: 0.15, dex: 0.1, luk: 0.1 }, economy: { goldGainMultiplier: 1.0, xpGainMultiplier: 1.0, vendorSellMultiplier: 1.0, refineCostMultiplier: 1.0 } },
  { id: 'goblin', name: 'Goblin', bonusName: 'Mão de Midas', description: 'Vantagens comerciais e maior valor de venda.', modifiers: { agi: 0.05, luk: 0.05 }, economy: { goldGainMultiplier: 1.0, xpGainMultiplier: 1.0, vendorSellMultiplier: 1.25, refineCostMultiplier: 1.0 } },
  { id: 'orc', name: 'Orc', bonusName: 'Fúria Bruta', description: 'Ataque físico e crítico elevados.', modifiers: { str: 0.2, luk: 0.05 }, economy: { goldGainMultiplier: 1.0, xpGainMultiplier: 1.0, vendorSellMultiplier: 1.0, refineCostMultiplier: 1.0 } },
  { id: 'morto_vivo', name: 'Morto-vivo', bonusName: 'Toque da Morte', description: 'Drena vida dos inimigos (lifesteal).', modifiers: { int_stat: 0.1, vit: 0.05 }, economy: { goldGainMultiplier: 1.0, xpGainMultiplier: 1.0, vendorSellMultiplier: 1.0, refineCostMultiplier: 1.0 }, special: 'lifesteal' },
  { id: 'troll', name: 'Troll', bonusName: 'Berserker', description: 'Velocidade de ataque extrema abaixo de 50% HP.', modifiers: { agi: 0.1, str: 0.05 }, economy: { goldGainMultiplier: 1.0, xpGainMultiplier: 1.0, vendorSellMultiplier: 1.0, refineCostMultiplier: 1.0 }, special: 'berserk' },
  { id: 'tauren', name: 'Tauren', bonusName: 'Robustez', description: 'HP colossal e resistência física.', modifiers: { vit: 0.25, str: 0.1 }, economy: { goldGainMultiplier: 1.0, xpGainMultiplier: 1.0, vendorSellMultiplier: 1.0, refineCostMultiplier: 1.0 } },
  { id: 'pandaren', name: 'Pandaren', bonusName: 'Caminho Interno', description: 'Regeneração de MP e eficácia de poções.', modifiers: { int_stat: 0.1, vit: 0.05, luk: 0.05 }, economy: { goldGainMultiplier: 1.0, xpGainMultiplier: 1.0, vendorSellMultiplier: 1.0, refineCostMultiplier: 1.0 }, special: 'mp_regen' },
];

export function getRace(id: RaceId): RaceDefinition {
  return RACES.find((r) => r.id === id) ?? RACES[0];
}
