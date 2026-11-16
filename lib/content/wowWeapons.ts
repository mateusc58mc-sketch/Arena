// lib/content/wowWeapons.ts
// Banco expandido de armas inspirado no WoW Classic (portugues adaptado).
// Gerado de forma deterministica para facilitar curadoria futura.

import type { ItemTemplate } from '@/lib/types/core';

const WEAPON_NAMES = [
  'Lâmina do Cão Feroz',
  'Machado das Terras Altas',
  'Arco do Caçador Veloz',
  'Cajado da Aurora',
  'Espada Curta do Príncipe',
  'Lâmina Sombria de Duskwood',
  'Machado de Guerra Orcish',
  'Florete de Stranglethorn',
  'Martelo da Luz Sagrada',
  'Bastão do Vidente',
  'Espada Longa do Leão',
  'Lâmina Rúnica do Gelo',
  'Arco Composto do Guarda-Florestal',
  'Cajado do Feiticeiro',
  'Lâmina do Eclipse',
  'Machado de Batalha do Campeão',
  'Lança do Desbravador',
  'Adaga do Silêncio',
  'Martelo do Arauto',
  'Cajado das Runas',
  'Espada do Crepúsculo',
  'Lâmina Flamejante',
  'Machado de Pedra',
  'Arco de Ébano',
  'Cajado do Erudito',
  'Espada Bastarda da Torre',
  'Lâmina de Mithril',
  'Machado de Tiragarde',
  'Lança da Coroa Tundra',
  'Adaga de Furtividade',
];

const RARITIES: Array<ItemTemplate['rarity']> = ['normal', 'magic', 'rare', 'epic', 'legendary'];
const ICONS = ['⚔️', '🪓', '🏹', '🔮', '🗡️', '⚒️', '⛏️'];

export const WOW_WEAPONS: ItemTemplate[] = WEAPON_NAMES.flatMap((name, idx) => {
  const tier = Math.floor(idx / 5) + 1;
  const rarity = RARITIES[Math.min(RARITIES.length - 1, Math.floor(idx / 6))];
  const baseAttack = 12 + tier * 14 + (idx % 5) * 3;
  const premium = rarity === 'epic' || rarity === 'legendary';
  return {
    id: `wow_weapon_${idx + 1}`,
    name: `${name}${tier > 1 ? ` (T${tier})` : ''}`,
    type: 'weapon',
    rarity,
    attack: baseAttack,
    defense: Math.floor(baseAttack * 0.15),
    str: 1 + Math.floor(tier / 2),
    agi: tier >= 3 ? 1 : 0,
    vit: Math.floor(tier / 3),
    int_stat: rarity === 'legendary' ? 2 : 0,
    dex: 1,
    luk: tier >= 4 ? 2 : 0,
    refineable: true,
    maxRefine: rarity === 'legendary' ? 20 : 15,
    sellValue: 25 + tier * 40 + (idx % 7) * 10,
    premium,
    icon: ICONS[idx % ICONS.length],
  };
});
