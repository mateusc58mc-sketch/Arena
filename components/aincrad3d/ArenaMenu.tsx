'use client';

import { useMemo, useState } from 'react';
import { ITEM_DATABASE } from '@/lib/gameDatabase';
import { getSkill } from '@/lib/content/skills';
import { computeDerivedStats, itemByNameMap } from '@/lib/systems/stats';
import type { Character, DerivedStats, InventoryItem, ItemTemplate } from '@/lib/types/core';
import { normalizeEquipped } from '@/lib/arenaData';
import type { HeroDef } from './data';
import CombatPanel from './CombatPanel';
import InventoryPanel from './InventoryPanel';
import styles from './Arena.module.css';

export type MenuTab = 'status' | 'bolsa' | 'deposito' | 'combate' | 'cidade';

export type StatKey = 'str' | 'agi' | 'vit' | 'int_stat' | 'dex' | 'luk';

type ArenaMenuProps = {
  open: boolean;
  tab: MenuTab;
  onTab: (tab: MenuTab) => void;
  onClose: () => void;
  character: Character | null;
  inventory: InventoryItem[];
  heroes: HeroDef[];
  onToggleEquip: (item: InventoryItem) => void;
  onToggleStash: (items: InventoryItem | InventoryItem[]) => void;
  onAddStat: (stat: StatKey) => void;
  onBuyPotion: (tplId: string, price: number) => void;
  onSellItems: (items: InventoryItem[]) => void;
  onRefine: (item: InventoryItem) => void;
  skillSlots: Record<string, string[]>;
  onSetSlot: (memberId: string, index: number, skillId: string | null) => void;
};

function useTemplateMap() {
  return useMemo(() => {
    const map = new Map<string, ItemTemplate>();
    for (const template of Object.values(ITEM_DATABASE)) map.set(template.name, template);
    return map;
  }, []);
}

export default function ArenaMenu({
  open,
  tab,
  onTab,
  onClose,
  character,
  inventory,
  heroes,
  onToggleEquip,
  onToggleStash,
  onAddStat,
  onBuyPotion,
  onSellItems,
  onRefine,
  skillSlots,
  onSetSlot,
}: ArenaMenuProps) {
  const templateMap = useTemplateMap();
  const [refineTargetId, setRefineTargetId] = useState('');

  const derived: DerivedStats | null = useMemo(() => {
    if (!character) return null;
    const itemByName = itemByNameMap(Object.values(ITEM_DATABASE));
    return computeDerivedStats({
      character: { ...character, level: character.level ?? 1 },
      raceId: character.race ?? 'humano',
      inventory: normalizeEquipped(inventory),
      itemByName,
    });
  }, [character, inventory]);

  if (!open) return null;

  const equipped = inventory.filter((item) => item.is_equipped);
  const bag = inventory.filter((item) => !item.is_equipped && !item.is_in_stash);
  const stash = inventory.filter((item) => item.is_in_stash);
  const characterModel = heroes.find((hero) => hero.isPlayer)?.model ?? '/models/aincrad/Knight.glb';

  const baseStats: Array<[StatKey, string, number]> = character
    ? [
        ['str', 'FOR', character.str ?? 0],
        ['agi', 'AGI', character.agi ?? 0],
        ['vit', 'VIT', character.vit ?? 0],
        ['int_stat', 'INT', character.int_stat ?? 0],
        ['dex', 'DES', character.dex ?? 0],
        ['luk', 'SOR', character.luk ?? 0],
      ]
    : [];

  const statPoints = character?.stat_points ?? 0;

  // --- Cidade (Andar 0) ---
  const sellable = inventory.filter((item) => !item.is_equipped && !item.is_in_stash);
  const refinable = inventory.filter((item) => item.refine_level < 15);
  const rarityRank: Record<string, number> = {
    normal: 0,
    magic: 1,
    rare: 2,
    epic: 3,
    legendary: 4,
    mythic: 5,
  };
  const sellByRarity = (max: string) =>
    sellable.filter((item) => {
      const rarity = templateMap.get(item.item_name)?.rarity ?? 'normal';
      return (rarityRank[rarity] ?? 0) <= (rarityRank[max] ?? 0);
    });
  const sellValue = (item: InventoryItem) => templateMap.get(item.item_name)?.sellValue ?? 5;
  const refineTargetItem = inventory.find((item) => item.id === refineTargetId) ?? null;

  return (
    <div className={styles.menuOverlay} onClick={onClose}>
      <div className={styles.menuPanel} onClick={(event) => event.stopPropagation()}>
        <div className={styles.menuHeader}>
          <div className={styles.menuTabs}>
            {(
              [
                ['status', 'Status'],
                ['bolsa', 'Bolsa'],
                ['deposito', 'Depósito'],
                ['combate', 'Combate'],
                ['cidade', 'Cidade'],
              ] as Array<[MenuTab, string]>
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={tab === id ? styles.menuTabOn : ''}
                onClick={() => onTab(id)}
              >
                {label}
                {id === 'bolsa' && bag.length > 0 && <em>{bag.length}</em>}
                {id === 'deposito' && stash.length > 0 && <em>{stash.length}</em>}
              </button>
            ))}
          </div>
          <button type="button" className={styles.menuClose} onClick={onClose} title="Fechar">
            ✕
          </button>
        </div>

        <div className={styles.menuBody}>
          {tab === 'status' && (
            <div className={styles.menuGrid}>
              <div className={styles.menuCard}>
                <span className={styles.menuCardTitle}>PERSONAGEM</span>
                {character ? (
                  <>
                    <div className={styles.menuCharHead}>
                      <b>{character.name}</b>
                      <span>
                        Lv. {character.level} · {character.class_name}
                      </span>
                      <span>{character.race}</span>
                    </div>
                    <div className={styles.menuStats}>
                      {baseStats.map(([key, label, value]) => (
                        <div key={key} className={styles.statCell}>
                          <span>{label}</span>
                          <b>{value}</b>
                          {statPoints > 0 && (
                            <button
                              type="button"
                              onClick={() => onAddStat(key)}
                              title={`Alocar 1 ponto em ${label}`}
                            >
                              +
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className={styles.menuStats}>
                      <div>
                        <span>CP</span>
                        <b>{derived ? Math.floor(derived.level * 100 + (character.str ?? 0) * 15) : 0}</b>
                      </div>
                      <div>
                        <span>OURO</span>
                        <b>{character.gold ?? 0}</b>
                      </div>
                      <div>
                        <span>PONTOS</span>
                        <b>{character.stat_points ?? 0}</b>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className={styles.menuEmpty}>Sem personagem carregado.</p>
                )}
              </div>

              <div className={styles.menuCard}>
                <span className={styles.menuCardTitle}>ATRIBUTOS DERIVADOS</span>
                {derived ? (
                  <div className={styles.menuStats}>
                    <div>
                      <span>ATQ FÍS</span>
                      <b>{derived.physicalAttack}</b>
                    </div>
                    <div>
                      <span>ATQ MÁG</span>
                      <b>{derived.magicAttack}</b>
                    </div>
                    <div>
                      <span>DEF FÍS</span>
                      <b>{derived.physicalDefense}</b>
                    </div>
                    <div>
                      <span>DEF MÁG</span>
                      <b>{derived.magicDefense}</b>
                    </div>
                    <div>
                      <span>HP MÁX</span>
                      <b>{derived.maxHp}</b>
                    </div>
                    <div>
                      <span>MP MÁX</span>
                      <b>{derived.maxMp}</b>
                    </div>
                    <div>
                      <span>CRIT</span>
                      <b>{(derived.critChance * 100).toFixed(1)}%</b>
                    </div>
                    <div>
                      <span>CRIT DMG</span>
                      <b>{derived.critDamage.toFixed(2)}x</b>
                    </div>
                    <div>
                      <span>VEL ATQ</span>
                      <b>{derived.attackSpeed.toFixed(2)}</b>
                    </div>
                    <div>
                      <span>ESQUIVA</span>
                      <b>{(derived.dodge * 100).toFixed(1)}%</b>
                    </div>
                    <div>
                      <span>PRECISÃO</span>
                      <b>{(derived.accuracy * 100).toFixed(1)}%</b>
                    </div>
                    <div>
                      <span>ROUBO VIDA</span>
                      <b>{(derived.lifesteal * 100).toFixed(1)}%</b>
                    </div>
                  </div>
                ) : (
                  <p className={styles.menuEmpty}>Sem atributos calculados.</p>
                )}
              </div>

              <div className={styles.menuCard}>
                <span className={styles.menuCardTitle}>PARTY</span>
                {heroes.map((hero) => (
                  <div className={styles.menuPartyRow} key={hero.id}>
                    <span className={styles.squadIcon}>{hero.isPlayer ? '⭐' : '🤖'}</span>
                    <div>
                      <b>{hero.name}</b>
                      <span>
                        {hero.className} · Nv {hero.level}
                      </span>
                    </div>
                    <div className={styles.menuPartyNumbers}>
                      <span>ATK {hero.atk}</span>
                      <span>HP {hero.maxHp}</span>
                      <span>
                        CRIT {(hero.critChance * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'bolsa' && (
            <InventoryPanel
              inventory={inventory}
              characterModel={characterModel}
              mode="bag"
              onToggleEquip={onToggleEquip}
              onToggleStash={onToggleStash}
            />
          )}

          {tab === 'deposito' && (
            <InventoryPanel
              inventory={inventory}
              characterModel={characterModel}
              mode="stash"
              onToggleEquip={onToggleEquip}
              onToggleStash={onToggleStash}
            />
          )}

          {tab === 'combate' && (
            <div className={styles.menuList}>
              <CombatPanel heroes={heroes} slots={skillSlots} onSetSlot={onSetSlot} />
            </div>
          )}

          {tab === 'cidade' && (
            <div className={styles.menuGrid}>
              <div className={styles.menuCard}>
                <span className={styles.menuCardTitle}>🧪 NPC ALQUIMISTA — POÇÕES</span>
                <div className={styles.cityActions}>
                  <button
                    type="button"
                    onClick={() =>
                      onBuyPotion(
                        'pocao_hp_menor',
                        ITEM_DATABASE['pocao_hp_menor']?.sellValue ?? 10,
                      )
                    }
                  >
                    Comprar Poção Menor ({ITEM_DATABASE['pocao_hp_menor']?.sellValue ?? 10} ouro)
                  </button>
                  <button type="button" onClick={() => onBuyPotion('pocao_hp_media', 50)}>
                    Comprar Poção Média (50 ouro)
                  </button>
                </div>
                <p className={styles.menuEmpty}>Seu ouro: {character?.gold ?? 0}</p>
              </div>

              <div className={styles.menuCard}>
                <span className={styles.menuCardTitle}>💰 NPC MERCADOR — VENDER LOOT</span>
                <div className={styles.cityActions}>
                  <button type="button" onClick={() => onSellItems(sellByRarity('normal'))}>
                    Vender Comuns
                  </button>
                  <button type="button" onClick={() => onSellItems(sellByRarity('magic'))}>
                    Vender até Mágico
                  </button>
                  <button type="button" onClick={() => onSellItems(sellable)}>
                    Vender Tudo
                  </button>
                </div>

                <div className={styles.citySellList}>
                  {sellable.length === 0 && (
                    <p className={styles.menuEmpty}>Sem itens na bolsa.</p>
                  )}
                  {sellable.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => onSellItems([item])}
                    >
                      Vender {item.item_name} ({sellValue(item)} ouro)
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.menuCard}>
                <span className={styles.menuCardTitle}>🔨 FORJA — REFINO</span>
                <div className={styles.cityActions}>
                  <select
                    className={styles.citySelect}
                    value={refineTargetId}
                    onChange={(event) => setRefineTargetId(event.target.value)}
                  >
                    <option value="">Selecione um item para refinar</option>
                    {refinable.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.item_name} (+{item.refine_level})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!refineTargetItem}
                    onClick={() => refineTargetItem && onRefine(refineTargetItem)}
                  >
                    Refinar
                  </button>
                </div>
                <p className={styles.menuEmpty}>
                  Consome uma Joia de Refino ({inventory.filter((i) => i.item_type === 'refine_stone').length}
                  na bolsa). Raça Anão tem vantagem.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
