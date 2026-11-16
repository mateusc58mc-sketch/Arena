// lib/types/core.ts
// Tipos compartilhados do Aetheria. Mantidos pequenos e puros para facilitar
// a migração do cliente para um backend autoritativo no futuro.

export type RaceId =
  | 'humano'
  | 'anao'
  | 'elfo'
  | 'goblin'
  | 'orc'
  | 'morto_vivo'
  | 'troll'
  | 'tauren'
  | 'pandaren';

export type ClassId =
  | 'aprendiz'
  | 'guerreiro'
  | 'mago'
  | 'arqueiro'
  | 'clerigo'
  | 'mercenario';

export type ItemType =
  | 'helmet'
  | 'armor'
  | 'weapon'
  | 'shield'
  | 'wings'
  | 'boots'
  | 'ring'
  | 'amulet'
  | 'potion'
  | 'material'
  | 'soul_stone'
  | 'pet'
  | 'refine_stone';

export type ItemRarity = 'normal' | 'magic' | 'rare' | 'epic' | 'legendary' | 'mythic';

export interface BaseStats {
  str: number;
  agi: number;
  vit: number;
  int_stat: number;
  dex: number;
  luk: number;
}

export interface DerivedStats extends BaseStats {
  level: number;
  maxHp: number;
  maxMp: number;
  maxSd: number;
  physicalAttack: number;
  magicAttack: number;
  physicalDefense: number;
  magicDefense: number;
  attackSpeed: number; // ataques por segundo
  critChance: number; // 0..1
  critDamage: number; // multiplicador
  dodge: number; // 0..1
  accuracy: number; // 0..1
  lifesteal: number; // 0..1
}

export interface ItemTemplate {
  id: string;
  name: string;
  type: ItemType;
  rarity: ItemRarity;
  // Stats base do item (somados ao personagem quando equipado)
  attack: number;
  defense: number;
  str: number;
  agi: number;
  vit: number;
  int_stat: number;
  dex: number;
  luk: number;
  // Propriedades opcionais (para futuro)
  refineable: boolean;
  maxRefine: number;
  sellValue: number; // ouro de vendor
  premium: boolean; // pode entrar no mercado RMT? (terreno futuro)
  icon: string;
}

// Item persistido no banco/inventário.
export interface InventoryItem {
  id: string;
  character_id: string;
  item_name: string;
  item_type: ItemType;
  refine_level: number;
  is_equipped: boolean;
  is_in_stash: boolean;
  sockets?: string[]; // ids de gemas (futuro)
  created_at?: string;
}

export interface Character extends BaseStats {
  id: string;
  account_id: string;
  name: string;
  class_name: ClassId | string;
  race: RaceId;
  level: number;
  exp: number;
  gold: number;
  premium_currency: number; // reservado para RMT futuro (ex.: gemas/cash)
  stat_points: number;
  talent_points: number;
  resets: number;
  tower_floor: number;
  last_hunt_at?: string | null; // para idle offline futuro
  created_at?: string;
  party_config?: Record<string, { position: 'front' | 'mid' | 'back'; autoCast: boolean }>;
}

export interface Account {
  id: string;
  auth_user_id: string;
  created_at?: string;
}

// Escudo contra anti-cheat futuro: uma "mutação" de jogo sempre carrega uma chave
// de idempotência. Hoje é opcional, mas prepara terreno para o backend.
export interface GameMutation {
  idempotencyKey: string;
  characterId: string;
  occurredAt: string;
}
