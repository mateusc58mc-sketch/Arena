// lib/content/items.ts
import type { ItemTemplate } from '@/lib/types/core';
import { WOW_WEAPONS } from '@/lib/content/wowWeapons';

export const ITEMS: ItemTemplate[] = [
  // ========== Armas ==========
  { id: 'espada_aprendiz', name: 'Espada Curta de Treino', type: 'weapon', rarity: 'normal', attack: 15, defense: 0, str: 2, agi: 1, vit: 0, int_stat: 0, dex: 1, luk: 0, refineable: true, maxRefine: 10, sellValue: 50, premium: false, icon: '⚔️' },
  { id: 'espada_bronze', name: 'Espada de Bronze', type: 'weapon', rarity: 'normal', attack: 28, defense: 0, str: 3, agi: 1, vit: 0, int_stat: 0, dex: 1, luk: 0, refineable: true, maxRefine: 10, sellValue: 120, premium: false, icon: '⚔️' },
  { id: 'lamina_aco', name: 'Lâmina de Aço', type: 'weapon', rarity: 'magic', attack: 52, defense: 0, str: 6, agi: 2, vit: 0, int_stat: 0, dex: 2, luk: 1, refineable: true, maxRefine: 12, sellValue: 400, premium: false, icon: '⚔️' },
  { id: 'espada_gelo', name: 'Espada do Gelo Eterno', type: 'weapon', rarity: 'rare', attack: 95, defense: 5, str: 12, agi: 4, vit: 0, int_stat: 4, dex: 3, luk: 2, refineable: true, maxRefine: 15, sellValue: 2500, premium: true, icon: '❄️' },
  { id: 'lamina_sagrada', name: 'Lâmina Sagrada', type: 'weapon', rarity: 'epic', attack: 160, defense: 10, str: 20, agi: 6, vit: 0, int_stat: 10, dex: 5, luk: 4, refineable: true, maxRefine: 15, sellValue: 12000, premium: true, icon: '✨' },
  { id: 'espada_abismo', name: 'Espada do Abismo', type: 'weapon', rarity: 'legendary', attack: 280, defense: 20, str: 35, agi: 10, vit: 5, int_stat: 15, dex: 8, luk: 10, refineable: true, maxRefine: 20, sellValue: 80000, premium: true, icon: '🗡️' },

  // ========== Capacete ==========
  { id: 'capacete_bronze', name: 'Capacete de Bronze', type: 'helmet', rarity: 'magic', attack: 0, defense: 12, str: 0, agi: 0, vit: 3, int_stat: 0, dex: 0, luk: 0, refineable: true, maxRefine: 10, sellValue: 80, premium: false, icon: '🪖' },
  { id: 'elmo_aco', name: 'Elmo de Aço', type: 'helmet', rarity: 'magic', attack: 0, defense: 28, str: 0, agi: 0, vit: 6, int_stat: 0, dex: 1, luk: 0, refineable: true, maxRefine: 12, sellValue: 300, premium: false, icon: '🪖' },
  { id: 'elmo_guardiao', name: 'Elmo do Guardião', type: 'helmet', rarity: 'rare', attack: 2, defense: 55, str: 2, agi: 0, vit: 12, int_stat: 0, dex: 2, luk: 1, refineable: true, maxRefine: 15, sellValue: 3000, premium: true, icon: '🛡️' },

  // ========== Armadura ==========
  { id: 'armadura_guerreiro', name: 'Armadura de Placas do Guardião', type: 'armor', rarity: 'rare', attack: 5, defense: 35, str: 3, agi: 0, vit: 8, int_stat: 0, dex: 0, luk: 0, refineable: true, maxRefine: 12, sellValue: 600, premium: false, icon: '🛡️' },
  { id: 'armadura_reforcada', name: 'Armadura Reforçada', type: 'armor', rarity: 'magic', attack: 0, defense: 50, str: 0, agi: 0, vit: 12, int_stat: 0, dex: 0, luk: 0, refineable: true, maxRefine: 12, sellValue: 900, premium: false, icon: '🛡️' },
  { id: 'manto_sombrio', name: 'Manto Sombrio', type: 'armor', rarity: 'epic', attack: 15, defense: 80, str: 5, agi: 8, vit: 5, int_stat: 10, dex: 3, luk: 4, refineable: true, maxRefine: 15, sellValue: 15000, premium: true, icon: '🧥' },

  // ========== Escudo ==========
  { id: 'escudo_madeira', name: 'Escudo de Madeira', type: 'shield', rarity: 'normal', attack: 0, defense: 10, str: 0, agi: 0, vit: 2, int_stat: 0, dex: 0, luk: 0, refineable: true, maxRefine: 8, sellValue: 40, premium: false, icon: '🛡️' },
  { id: 'escudo_aco', name: 'Escudo de Aço', type: 'shield', rarity: 'magic', attack: 0, defense: 30, str: 0, agi: 0, vit: 6, int_stat: 0, dex: 0, luk: 0, refineable: true, maxRefine: 12, sellValue: 350, premium: false, icon: '🛡️' },

  // ========== Botas ==========
  { id: 'botas_couro', name: 'Botas de Couro', type: 'boots', rarity: 'normal', attack: 0, defense: 6, str: 0, agi: 3, vit: 1, int_stat: 0, dex: 2, luk: 0, refineable: true, maxRefine: 8, sellValue: 35, premium: false, icon: '👢' },
  { id: 'botas_velocidade', name: 'Botas da Velocidade', type: 'boots', rarity: 'rare', attack: 0, defense: 18, str: 0, agi: 12, vit: 3, int_stat: 0, dex: 4, luk: 2, refineable: true, maxRefine: 12, sellValue: 1800, premium: true, icon: '👢' },

  // ========== Asas ==========
  { id: 'asas_ilusaao', name: 'Asas da Ilusão (MU Style)', type: 'wings', rarity: 'legendary', attack: 25, defense: 20, str: 10, agi: 10, vit: 5, int_stat: 5, dex: 5, luk: 5, refineable: true, maxRefine: 15, sellValue: 50000, premium: true, icon: '🪽' },
  { id: 'asas_fenix', name: 'Asas da Fênix', type: 'wings', rarity: 'mythic', attack: 60, defense: 40, str: 25, agi: 25, vit: 15, int_stat: 25, dex: 15, luk: 15, refineable: true, maxRefine: 20, sellValue: 250000, premium: true, icon: '🔥' },

  // ========== Anéis e Amuletos (novos slots) ==========
  { id: 'anel_forca', name: 'Anel de Força', type: 'ring', rarity: 'magic', attack: 5, defense: 0, str: 4, agi: 0, vit: 0, int_stat: 0, dex: 0, luk: 2, refineable: false, maxRefine: 0, sellValue: 200, premium: false, icon: '💍' },
  { id: 'amuleto_vida', name: 'Amuleto da Vida', type: 'amulet', rarity: 'rare', attack: 0, defense: 5, str: 0, agi: 0, vit: 15, int_stat: 0, dex: 0, luk: 0, refineable: false, maxRefine: 0, sellValue: 1500, premium: true, icon: '📿' },

  // ========== Materiais (futuro crafting/mercado) ==========
  { id: 'pedra_refino', name: 'Pedra de Refino', type: 'material', rarity: 'normal', attack: 0, defense: 0, str: 0, agi: 0, vit: 0, int_stat: 0, dex: 0, luk: 0, refineable: false, maxRefine: 0, sellValue: 10, premium: false, icon: '🪨' },
  { id: 'gema_rara', name: 'Gema Rara', type: 'material', rarity: 'rare', attack: 0, defense: 0, str: 0, agi: 0, vit: 0, int_stat: 0, dex: 0, luk: 0, refineable: false, maxRefine: 0, sellValue: 500, premium: true, icon: '💎' },
  // Pedras de Alma (GDD) - armazenadas isoladamente, stacking infinito
  { id: 'alma_poring', name: 'Alma de Poring', type: 'soul_stone', rarity: 'normal', attack: 0, defense: 0, str: 0, agi: 0, vit: 0, int_stat: 0, dex: 0, luk: 0, refineable: false, maxRefine: 0, sellValue: 5, premium: false, icon: '🟣' },
  { id: 'alma_tigre', name: 'Alma de Tigre Branco', type: 'soul_stone', rarity: 'rare', attack: 0, defense: 0, str: 0, agi: 0, vit: 0, int_stat: 0, dex: 0, luk: 0, refineable: false, maxRefine: 0, sellValue: 200, premium: true, icon: '🟣' },
  { id: 'alma_dragao', name: 'Alma de Dragão', type: 'soul_stone', rarity: 'legendary', attack: 0, defense: 0, str: 0, agi: 0, vit: 0, int_stat: 0, dex: 0, luk: 0, refineable: false, maxRefine: 0, sellValue: 5000, premium: true, icon: '🐉' },
  // Joias de refino (GDD) +1..+15
  { id: 'joia_refino_baixa', name: 'Joia de Refino (Baixa)', type: 'refine_stone', rarity: 'magic', attack: 0, defense: 0, str: 0, agi: 0, vit: 0, int_stat: 0, dex: 0, luk: 0, refineable: false, maxRefine: 0, sellValue: 50, premium: false, icon: '💎' },
  // Alicates de extração
  { id: 'alicate_extracao', name: 'Alicate de Extração', type: 'material', rarity: 'rare', attack: 0, defense: 0, str: 0, agi: 0, vit: 0, int_stat: 0, dex: 0, luk: 0, refineable: false, maxRefine: 0, sellValue: 300, premium: true, icon: '✂️' },
  { id: 'pocao_hp_menor', name: 'Poção de Vida (Menor)', type: 'potion', rarity: 'normal', attack: 0, defense: 0, str: 0, agi: 0, vit: 0, int_stat: 0, dex: 0, luk: 0, refineable: false, maxRefine: 0, sellValue: 5, premium: false, icon: '🧪' },
  { id: 'pocao_hp_media', name: 'Poção de Vida (Média)', type: 'potion', rarity: 'magic', attack: 0, defense: 0, str: 0, agi: 0, vit: 0, int_stat: 0, dex: 0, luk: 0, refineable: false, maxRefine: 0, sellValue: 25, premium: false, icon: '🧪' },
  ...WOW_WEAPONS,
];
