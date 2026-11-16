// lib/systems/soulStones.ts
// Regras de Pedras da Alma (GDD): grimório separado, stacking infinito,
// soquetagem por tipo de item e extração com alicate.

export type SoulStoneRarity = 'normal' | 'magic' | 'rare' | 'epic' | 'legendary';

export interface SoulStone {
  id: string;
  name: string;
  rarity: SoulStoneRarity;
  bonus: string;
  premium: boolean;
}

export const SOUL_STONES: SoulStone[] = [
  { id: 'alma_poring', name: 'Alma de Poring', rarity: 'normal', bonus: '+2% HP Máximo', premium: false },
  { id: 'alma_javali', name: 'Alma de Javali', rarity: 'normal', bonus: '+2% Dano Físico', premium: false },
  { id: 'alma_lobo', name: 'Alma de Lobo', rarity: 'magic', bonus: '+5% Velocidade de Ataque', premium: false },
  { id: 'alma_tigre', name: 'Alma de Tigre Branco', rarity: 'rare', bonus: '+8% Crítico', premium: true },
  { id: 'alma_arvore', name: 'Alma de Árvore Anciã', rarity: 'epic', bonus: '+10% Redução de Dano', premium: true },
  { id: 'alma_dragao', name: 'Alma de Dragão', rarity: 'legendary', bonus: '+15% Dano Físico/Mágico', premium: true },
];

export function socketSlotsForType(type: string): number {
  if (type === 'weapon') return 4;
  if (type === 'armor' || type === 'shield' || type === 'helmet') return 2;
  if (type === 'wings' || type === 'boots' || type === 'ring' || type === 'amulet') return 2;
  return 0;
}
