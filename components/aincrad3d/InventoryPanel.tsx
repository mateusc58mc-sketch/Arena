'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { ITEM_DATABASE } from '@/lib/gameDatabase';
import { normalizeEquipped } from '@/lib/arenaData';
import type { InventoryItem, ItemTemplate } from '@/lib/types/core';
import styles from './Arena.module.css';

const CharacterDoll = dynamic(() => import('./CharacterDoll'), { ssr: false });

// ============================================================
// Slots de equipamento (paper doll no estilo WoW)
// ============================================================

type SlotDef = { type: string; label: string };

const DOLL_LAYOUT: Array<SlotDef | null> = [
  { type: 'helmet', label: 'Cabeça' },
  { type: 'armor', label: 'Torso' },
  { type: 'weapon', label: 'Mão' },
  { type: 'shield', label: 'Escudo' },
  null, // boneco
  { type: 'wings', label: 'Costas' },
  { type: 'boots', label: 'Pés' },
  { type: 'ring', label: 'Anel' },
  { type: 'amulet', label: 'Amuleto' },
];

const EQUIPABLE_TYPES = DOLL_LAYOUT.filter(Boolean).map((slot) => slot!.type);

/**
 * Regra de empilhamento: apenas consumíveis e materiais (poções, joias de
 * refino, alicate de extração, almas...) empilham. Equipamento — que tem
 * stats — nunca empilha, cada peça ocupa seu próprio slot.
 */
function isStackable(item: InventoryItem) {
  return !EQUIPABLE_TYPES.includes(item.item_type);
}

const TYPE_ICON: Record<string, string> = {
  helmet: '🪖',
  armor: '🛡️',
  weapon: '⚔️',
  shield: '🔰',
  wings: '🪽',
  boots: '🥾',
  ring: '💍',
  amulet: '📿',
  potion: '🧪',
  material: '🧱',
  soul_stone: '🔮',
  pet: '🐾',
  refine_stone: '💎',
};

const RARITY_COLOR: Record<string, string> = {
  normal: '#94a3b8',
  magic: '#60a5fa',
  rare: '#a78bfa',
  epic: '#f472b6',
  legendary: '#fbbf24',
  mythic: '#fb7185',
};

const RARITY_LABEL: Record<string, string> = {
  normal: 'Comum',
  magic: 'Mágico',
  rare: 'Raro',
  epic: 'Épico',
  legendary: 'Lendário',
  mythic: 'Mítico',
};

// ============================================================
// Tooltip no estilo WoW
// ============================================================

type TooltipState = {
  item: InventoryItem;
  items: InventoryItem[];
  template?: ItemTemplate;
  x: number;
  y: number;
};

function ItemTooltip({
  state,
  onEquip,
  onStash,
}: {
  state: TooltipState;
  onEquip?: (item: InventoryItem) => void;
  onStash?: (items: InventoryItem[]) => void;
}) {
  const { item, items, template, x, y } = state;
  const color = RARITY_COLOR[template?.rarity ?? 'normal'] ?? '#94a3b8';
  const slot = DOLL_LAYOUT.find((entry) => entry?.type === item.item_type);
  const count = items.length;

  const rows: Array<[string, string]> = [];
  if (template) {
    if (template.attack) rows.push(['Ataque', `+${template.attack}`]);
    if (template.defense) rows.push(['Defesa', `+${template.defense}`]);
    if (template.str) rows.push(['FOR', `+${template.str}`]);
    if (template.agi) rows.push(['AGI', `+${template.agi}`]);
    if (template.vit) rows.push(['VIT', `+${template.vit}`]);
    if (template.int_stat) rows.push(['INT', `+${template.int_stat}`]);
    if (template.dex) rows.push(['DES', `+${template.dex}`]);
    if (template.luk) rows.push(['SOR', `+${template.luk}`]);
  }

  const canEquip = EQUIPABLE_TYPES.includes(item.item_type);

  return (
    <div
      className={styles.itemTooltip}
      style={{ left: Math.min(x, window.innerWidth - 250), top: Math.min(y, window.innerHeight - 220) }}
    >
      <span className={styles.itemTooltipName} style={{ color }}>
        {item.item_name}
        {item.refine_level > 0 && ` +${item.refine_level}`}
      </span>
      <span className={styles.itemTooltipType}>
        {template ? RARITY_LABEL[template.rarity] : item.item_type} · {slot?.label ?? item.item_type}
      </span>

      {rows.length > 0 && (
        <div className={styles.itemTooltipStats}>
          {rows.map(([label, value]) => (
            <span key={label}>
              {label} <b>{value}</b>
            </span>
          ))}
        </div>
      )}

      <span className={styles.itemTooltipFoot}>
        {item.is_equipped ? 'Equipado' : item.is_in_stash ? 'No depósito' : 'Na bolsa'}
        {count > 1 ? ` · Quantidade: ${count}` : ''}
        {template ? ` · Venda ${template.sellValue} ouro` : ''}
      </span>

      <div className={styles.itemTooltipActions}>
        {onEquip && canEquip && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onEquip(item);
            }}
          >
            {item.is_equipped ? 'Desequipar' : 'Equipar'}
          </button>
        )}
        {onStash && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onStash(items);
            }}
          >
            {item.is_in_stash ? 'Mover p/ bolsa' : 'Depósito'}
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Painel de inventário
// ============================================================

type InventoryPanelProps = {
  inventory: InventoryItem[];
  characterModel: string;
  mode: 'bag' | 'stash';
  onToggleEquip: (item: InventoryItem) => void;
  onToggleStash: (items: InventoryItem[]) => void;
};

export default function InventoryPanel({
  inventory,
  characterModel,
  mode,
  onToggleEquip,
  onToggleStash,
}: InventoryPanelProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const templateMap = useMemo(() => {
    const map = new Map<string, ItemTemplate>();
    for (const template of Object.values(ITEM_DATABASE)) map.set(template.name, template);
    return map;
  }, []);

  // Um item por slot: itens duplicados (estado legado) voltam para a bolsa.
  const safeInventory = useMemo(() => normalizeEquipped(inventory), [inventory]);

  const equipped = safeInventory.filter((item) => item.is_equipped);

  // Empilha consumíveis e materiais do mesmo item; equipamento nunca empilha.
  const stacks = useMemo(() => {
    const base = safeInventory.filter((item) =>
      mode === 'stash' ? item.is_in_stash : !item.is_in_stash && !item.is_equipped,
    );

    base.sort((a, b) => {
      const ta = templateMap.get(a.item_name);
      const tb = templateMap.get(b.item_name);
      if (ta?.type !== tb?.type) return (ta?.type ?? '').localeCompare(tb?.type ?? '');
      return (tb?.rarity ?? '').localeCompare(ta?.rarity ?? '');
    });

    const result: Array<{ key: string; items: InventoryItem[]; stackable: boolean }> = [];

    for (const item of base) {
      const stackable = isStackable(item);

      if (stackable) {
        const existing = result.find(
          (entry) => entry.stackable && entry.items[0]?.item_name === item.item_name,
        );
        if (existing) {
          existing.items.push(item);
          continue;
        }
      }

      result.push({ key: item.id, items: [item], stackable });
    }

    return result;
  }, [safeInventory, mode, templateMap]);

  const totalItems = stacks.reduce((sum, stack) => sum + stack.items.length, 0);

  const equippedByType = useMemo(() => {
    const map = new Map<string, InventoryItem>();
    for (const item of equipped) {
      if (!map.has(item.item_type)) map.set(item.item_type, item);
    }
    return map;
  }, [equipped]);

  const show = (
    item: InventoryItem,
    items: InventoryItem[],
    event: { clientX: number; clientY: number },
  ) => {
    setTooltip({
      item,
      items,
      template: templateMap.get(item.item_name),
      x: event.clientX,
      y: event.clientY,
    });
  };

  return (
    <div
      className={styles.inventoryWrap}
      onClick={() => setTooltip(null)}
      onMouseLeave={() => setTooltip(null)}
    >
      {mode === 'bag' && (
        <div className={styles.paperDoll}>
          {DOLL_LAYOUT.map((slot, index) => {
            if (!slot) {
              return (
                <div className={styles.dollSlot} key="doll">
                  <CharacterDoll url={characterModel} />
                  <span className={styles.dollLabel}>PERSONAGEM</span>
                </div>
              );
            }

            const item = equippedByType.get(slot.type);
            const template = item ? templateMap.get(item.item_name) : undefined;
            const color = RARITY_COLOR[template?.rarity ?? 'normal'] ?? '#94a3b8';

            return (
              <button
                type="button"
                key={slot.type}
                className={`${styles.dollSlot} ${item ? styles.dollSlotFilled : styles.dollSlotEmpty}`}
                style={item ? { borderColor: color } : undefined}
                onMouseEnter={(event) => {
                  if (item) show(item, [item], event);
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  if (item) onToggleEquip(item);
                }}
                title={item ? `${item.item_name} — clique para desequipar` : `${slot.label} (vazio)`}
              >
                <span className={styles.dollSlotIcon}>
                  {item ? TYPE_ICON[item.item_type] ?? '📦' : '＋'}
                </span>
                <span className={styles.dollSlotName}>{item ? item.item_name : slot.label}</span>
                {item && item.refine_level > 0 && (
                  <span className={styles.dollSlotRefine}>+{item.refine_level}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className={styles.bagArea}>
        <span className={styles.menuCardTitle}>
          {mode === 'stash' ? `DEPÓSITO (${totalItems})` : `INVENTÁRIO (${totalItems})`}
        </span>

        {stacks.length === 0 ? (
          <p className={styles.menuEmpty}>
            {mode === 'stash' ? 'Depósito vazio.' : 'Nenhum item na bolsa.'}
          </p>
        ) : (
          <div className={styles.bagGrid}>
            {stacks.map((stack) => {
              const item = stack.items[0];
              const template = templateMap.get(item.item_name);
              const color = RARITY_COLOR[template?.rarity ?? 'normal'] ?? '#94a3b8';
              const count = stack.items.length;
              return (
                <button
                  type="button"
                  key={stack.key}
                  className={styles.bagIcon}
                  style={{ borderColor: color }}
                  onMouseEnter={(event) => show(item, stack.items, event)}
                  onClick={(event) => {
                    event.stopPropagation();
                    show(item, stack.items, event);
                  }}
                  title={count > 1 ? `${item.item_name} (${count})` : item.item_name}
                >
                  <span>{TYPE_ICON[item.item_type] ?? '📦'}</span>
                  {count > 1 && <b className={styles.bagCount}>×{count}</b>}
                  {item.refine_level > 0 && <em>+{item.refine_level}</em>}
                </button>
              );
            })}
          </div>
        )}

        <p className={styles.menuEmpty}>
          {mode === 'stash'
            ? 'Toque em um item para movê-lo de volta para a bolsa.'
            : 'Passe o cursor (ou toque) para ver os atributos do item.'}
        </p>
      </div>

      {tooltip && (
        <ItemTooltip
          state={tooltip}
          onEquip={mode === 'bag' ? onToggleEquip : undefined}
          onStash={onToggleStash}
        />
      )}
    </div>
  );
}
