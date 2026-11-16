// lib/persistence/supabaseRepository.ts
import { supabase } from '@/lib/supabase';
import type { GameRepository, CharacterPatch } from '@/lib/persistence/types';
import type { Character, InventoryItem } from '@/lib/types/core';

export class SupabaseRepository implements GameRepository {
  async loadCharacter(characterId: string): Promise<Character | null> {
    const { data, error } = await supabase
      .from('characters')
      .select('*')
      .eq('id', characterId)
      .single();
    if (error || !data) return null;
    return data as unknown as Character;
  }

  async saveCharacter(characterId: string, patch: CharacterPatch, _idempotencyKey?: string): Promise<void> {
    const key = _idempotencyKey || `save:${characterId}:${crypto.randomUUID()}`;
    const { error: rpcErr } = await supabase.rpc('apply_character_patch_idempotent', {
      p_key: key,
      p_character_id: characterId,
      p_patch: patch,
    });
    if (rpcErr) {
      const { error } = await supabase
        .from('characters')
        .update(patch as Record<string, unknown>)
        .eq('id', characterId);
      if (error) throw error;
    }
  }

  async listInventory(characterId: string): Promise<InventoryItem[]> {
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .eq('character_id', characterId);
    if (error) throw error;
    return (data ?? []) as unknown as InventoryItem[];
  }

  async insertItem(item: Omit<InventoryItem, 'id'>, _idempotencyKey?: string): Promise<InventoryItem> {
    const row: Record<string, unknown> = { ...item };
    const { data, error } = await supabase
      .from('inventory')
      .insert([row])
      .select()
      .single();
    if (error || !data) throw error ?? new Error('insert failed');
    return data as unknown as InventoryItem;
  }

  async updateItem(itemId: string, patch: Partial<InventoryItem>, _idempotencyKey?: string): Promise<void> {
    const { error } = await supabase
      .from('inventory')
      .update(patch as Record<string, unknown>)
      .eq('id', itemId);
    if (error) throw error;
  }
}