// lib/persistence/types.ts
// Contrato de persistência. Hoje usamos Supabase direto no cliente; este
// contrato desacopla o domínio do storage e prepara a migração para um
// backend autoritativo (Edge Functions / serviço próprio) sem reescrever a UI.

import type { Character, InventoryItem } from '@/lib/types/core';

export interface CharacterPatch {
  level?: number;
  exp?: number;
  gold?: number;
  premium_currency?: number;
  str?: number;
  agi?: number;
  vit?: number;
  int_stat?: number;
  dex?: number;
  luk?: number;
  stat_points?: number;
  talent_points?: number;
  tower_floor?: number;
  last_hunt_at?: string | null;
}

export interface GameRepository {
  // Personagem
  loadCharacter(characterId: string): Promise<Character | null>;
  saveCharacter(characterId: string, patch: CharacterPatch, idempotencyKey?: string): Promise<void>;

  // Inventário
  listInventory(characterId: string): Promise<InventoryItem[]>;
  insertItem(item: Omit<InventoryItem, 'id'>, idempotencyKey?: string): Promise<InventoryItem>;
  updateItem(itemId: string, patch: Partial<InventoryItem>, idempotencyKey?: string): Promise<void>;

  // Futuro mercado RMT (terreno pronto, implementação posterior)
  // createListing / buyListing / cancelListing ...
}

// Adapter em memória, útil para testes e prototipação offline.
export class InMemoryRepository implements GameRepository {
  private characters = new Map<string, Character>();
  private inventories = new Map<string, InventoryItem[]>();

  async loadCharacter(id: string) {
    return this.characters.get(id) ?? null;
  }
  async saveCharacter(id: string, patch: CharacterPatch, _idempotencyKey?: string) {
    const c = this.characters.get(id);
    if (c) this.characters.set(id, { ...c, ...patch } as Character);
  }
  async listInventory(id: string) {
    return this.inventories.get(id) ?? [];
  }
  async insertItem(item: Omit<InventoryItem, 'id'>, _idempotencyKey?: string) {
    const created = { ...item, id: crypto.randomUUID() } as InventoryItem;
    const list = this.inventories.get(item.character_id) ?? [];
    list.push(created);
    this.inventories.set(item.character_id, list);
    return created;
  }
  async updateItem(itemId: string, patch: Partial<InventoryItem>, _idempotencyKey?: string) {
    for (const list of this.inventories.values()) {
      const idx = list.findIndex((i) => i.id === itemId);
      if (idx >= 0) list[idx] = { ...list[idx], ...patch };
    }
  }
  // helper para testes
  seedCharacter(c: Character) {
    this.characters.set(c.id, c);
  }
  seedInventory(cid: string, items: InventoryItem[]) {
    this.inventories.set(cid, items);
  }
}
