// lib/gameDatabase.ts
// Fonte de compatibilidade: o código antigo importa daqui. Os dados canônicos agora
// vivem em lib/content/* para facilitar curadoria e expansão.

import { ITEMS } from '@/lib/content/items';
import { TOWER_FLOORS_COMPAT } from '@/lib/content/monsters';
import type { ItemTemplate } from '@/lib/types/core';

// Reexporta o tipo canônico.
export type { ItemTemplate };

export const ITEM_DATABASE: Record<string, ItemTemplate> = Object.fromEntries(
  ITEMS.map((item) => [item.id, item])
);

export const TOWER_FLOORS_DB = TOWER_FLOORS_COMPAT;
