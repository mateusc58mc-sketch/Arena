'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';

import { useRouter } from 'next/navigation';

import dynamic from 'next/dynamic';

import { getUserWithTimeout, supabase } from '@/lib/supabase';

import { ITEM_DATABASE } from '@/lib/gameDatabase';

import { applyExperience, calculatePlayerDamage, resolveMonsterHit, rollChance } from '@/lib/gameEngine';

import { getFloor, isFloorUnlocked } from '@/lib/content/monsters';

import type { MonsterDefinition } from '@/lib/content/monsters';

import { getRace } from '@/lib/content/races';

import { getClass, CLASSES } from '@/lib/content/classes';

import { CLASS_EVOLUTIONS, getEvolutions } from '@/lib/content/classEvolutions';

import { applyRaceModifiers, computeDerivedStats, itemByNameMap } from '@/lib/systems/stats';

import { getSkill, getSkillsForClass } from '@/lib/content/skills';

import { shouldEndBossFight, type PartyMemberState } from '@/lib/partyDeath';

import { getRaceRig, hasRaceRig } from '@/lib/raceRigs';

import { getBossSkills, shouldTriggerSkill, type BossSkill } from '@/lib/bossSkills';

// Prévia 3D de raças — EXCLUSIVA de servidor local (LOCAL_TEST_ONLY):
// o módulo pesado (three/r3f) só entra no bundle do dev; em produção o
// painel nem existe.
const RacePreviewCanvas = process.env.NODE_ENV === 'development'
  ? dynamic(() => import('@/components/RacePreviewCanvas'), { ssr: false })
  : null;
const LOCAL_TEST_ONLY = process.env.NODE_ENV === 'development';

// Raças com rig (lib/raceRigs) recebem a prévia ANIMADA (RaceModelPreview),
// igual à da arena — o resto segue no canvas local (manifestos .racas).
const RaceRigPreview = process.env.NODE_ENV === 'development'
  ? dynamic(() => import('@/components/RaceModelPreview'), { ssr: false })
  : null;


import { getTowerTheme, type TowerThemeId } from '@/lib/floorScaling';

import { createBotMember, getBotTemplates, type BotTemplate } from '@/lib/aiSquad';

import type { Character, InventoryItem, RaceId } from '@/lib/types/core';

const RACES = [

  { id: 'humano', name: 'Humano', desc: 'Versátil, ganho extra de ouro e XP.' },

  { id: 'anao', name: 'Anão', desc: 'Alta defesa e bônus na forja de itens.' },

  { id: 'elfo', name: 'Elfo', desc: 'Foco em agilidade, esquiva e crítico.' },

  { id: 'goblin', name: 'Goblin', desc: 'Vantagens comerciais e bônus de venda.' },

  { id: 'orc', name: 'Orc', desc: 'Poder de ataque físico e dano crítico elevados.' },

  { id: 'morto_vivo', name: 'Morto-vivo', desc: 'Regenera vida drenando os inimigos.' },

  { id: 'troll', name: 'Troll', desc: 'Velocidade de ataque extrema em momentos críticos.' },

  { id: 'tauren', name: 'Tauren', desc: 'Vida máxima colossal e força física bruta.' },

  { id: 'pandaren', name: 'Pandaren', desc: 'Equilíbrio espiritual, regeneração de MP e poãães.' },

];

function pickRandom<T>(arr: T[]): T {

  return arr[Math.floor(Math.random() * arr.length)];

}

function nowMs() { return Date.now(); }

function pickMonster(floorData: { monsters: MonsterDefinition[]; monster: string; maxHp: number; exp: number; gold: number; floor: number }): MonsterDefinition {

  const fallback: MonsterDefinition = { id: 'default', name: floorData.monster, hp: floorData.maxHp, exp: floorData.exp, gold: floorData.gold, attack: 10, defense: 0, boss: false, floor: floorData.floor };

  const monsters = floorData.monsters.length > 0 ? floorData.monsters : [fallback];

  return pickRandom(monsters);

}

export default function Game() {

  const router = useRouter();

const [availableCharacters, setAvailableCharacters] = useState<Character[]>([]);

const [selectingCharacter, setSelectingCharacter] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);

  const [character, setCharacter] = useState<Character | null>(null);

  const [inventory, setInventory] = useState<InventoryItem[]>([]);

  const [loading, setLoading] = useState(true);

  // Sistema de Torre e Mobs

  const [currentFloor, setCurrentFloor] = useState(1);

  const [bossFighting, setBossFighting] = useState(false);

  const [bossHpCurrent, setBossHpCurrent] = useState(600);

  const [mobHpCurrent, setMobHpCurrent] = useState(120);

  const [highestClearedFloor, setHighestClearedFloor] = useState(1);

  const [currentMonster, setCurrentMonster] = useState<MonsterDefinition | null>(null);

  const [refineTarget, setRefineTarget] = useState<InventoryItem | null>(null);

  const [evolutionChoice, setEvolutionChoice] = useState<string>('');

  const [playerHpCurrent, setPlayerHpCurrent] = useState<number | null>(null);

  const [playerMpCurrent, setPlayerMpCurrent] = useState<number | null>(null);

  const [skillSlots, setSkillSlots] = useState<(string | null)[]>([null, null, null, null, null, null, null, null]);

  const [skillCooldowns, setSkillCooldowns] = useState<Record<string, number>>({});

  const [skillPickerSlot, setSkillPickerSlot] = useState<number | null>(null);

  const [effectExpiry, setEffectExpiry] = useState<Record<string, number>>({});

  // [NOVO] Party de 4 membros (líder + 3 IAs)

  const [partyMembers, setPartyMembers] = useState<PartyMemberState[]>([]);

  const [bossActiveSkill, setBossActiveSkill] = useState<BossSkill | null>(null);

  const [bossEnrageTimer, setBossEnrageTimer] = useState<number>(0);

  // Modais de Interface

  const [activeModal, setActiveModal] = useState<'bolsa' | 'deposito' | 'status' | 'classe' | 'combate' | 'talento' | null>(null);

  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  // Criar Personagem

  const [selectedRace, setSelectedRace] = useState('humano');

    const [charName, setCharName] = useState('');

  const [creating, setCreating] = useState(false);

  // Prévia 3D local (LOCAL_TEST_ONLY): nonces disparam a simulação de combate
  const [previewAttackNonce, setPreviewAttackNonce] = useState(0);

  // Caça Idle

    const [combatLog, setCombatLog] = useState<string[]>([]);

  const [autoHunt, setAutoHunt] = useState(true);

  const floorData = useMemo(() => {

    const rawFloor = getFloor(currentFloor);

    return {

      floor: rawFloor.floor,

      name: rawFloor.name,

      biome: rawFloor.biome,

      unlockLevel: rawFloor.unlockLevel,

      monsters: rawFloor.monsters,

      monster: rawFloor.monsters[0]?.name ?? rawFloor.boss.name,

      hp: rawFloor.monsters[0]?.hp ?? 100,

      maxHp: rawFloor.monsters[0]?.hp ?? 100,

      attack: rawFloor.monsters[0]?.attack ?? 10,

      exp: rawFloor.monsters[0]?.exp ?? 30,

      gold: rawFloor.monsters[0]?.gold ?? 20,

      boss: rawFloor.boss.name,

      bossHp: rawFloor.boss.hp,

      bossAttack: rawFloor.boss.attack ?? 30,

    };

  }, [currentFloor]);

  // Handler para troca de andar (evita setState síncrono em effect).

  async function handleEvolve() {

    if (!character || !evolutionChoice) return;

    const primary = CLASSES.find((c) => c.id === evolutionChoice);

    const spec = CLASS_EVOLUTIONS.find((e) => e.id === evolutionChoice);

    const chosenName = primary?.name ?? spec?.name;

    if (!chosenName) return;

    const updated = { ...character, class_name: chosenName };

    setCharacter(updated);

    await supabase.from('characters').update({ class_name: chosenName }).eq('id', character.id);

  }

  async function handleBuyPotion(tplId: string, price: number) {

    if (!character) return;

    if ((character.gold || 0) < price) {

      alert('Ouro insuficiente.');

      return;

    }

    const tpl = ITEM_DATABASE[tplId];

    const { data: newItem, error } = await supabase

      .from('inventory')

      .insert([{

        character_id: character.id,

        item_name: tpl.name,

        item_type: tpl.type,

        refine_level: 0,

        is_equipped: false,

        is_in_stash: false,

      }])

      .select()

      .single();

    if (error) {

      alert('Erro ao comprar poção.');

      return;

    }

    if (newItem) setInventory((prev) => [...prev, newItem]);

    const newGold = (character.gold || 0) - price;

    setCharacter({ ...character, gold: newGold });

    await supabase.from('characters').update({ gold: newGold }).eq('id', character.id);

  }

  async function handleSellItem(item: InventoryItem) {

    if (!character) return;

    const tpl = Object.values(ITEM_DATABASE).find((t) => t.name === item.item_name);

    const price = tpl?.sellValue ?? 5;

    const { error } = await supabase.from('inventory').delete().eq('id', item.id);

    if (error) {

      alert('Erro ao vender item.');

      return;

    }

    setInventory((prev) => prev.filter((i) => i.id !== item.id));

    const newGold = (character.gold || 0) + price;

    setCharacter({ ...character, gold: newGold });

    await supabase.from('characters').update({ gold: newGold }).eq('id', character.id);

  }

  async function handleRefineItem() {

    if (!character || !refineTarget) return;

    const refineStone = inventory.find((i) => i.item_type === 'refine_stone');

    if (!refineStone) {

      alert('Sem Joia de Refino.');

      return;

    }

    // consume stone

    await supabase.from('inventory').delete().eq('id', refineStone.id);

    setInventory((prev) => prev.filter((i) => i.id !== refineStone.id));

    const race = getRace((character.race ?? 'humano') as RaceId);

    const chance = 0.65 * (race.economy.refineCostMultiplier || 1); // simplificado

    const ok = Math.random() < chance;

    if (ok) {

      const newLevel = refineTarget.refine_level + 1;

      await supabase.from('inventory').update({ refine_level: newLevel }).eq('id', refineTarget.id);

      setInventory((prev) => prev.map((i) => (i.id === refineTarget.id ? { ...i, refine_level: newLevel } : i)));

      setRefineTarget((prev) => (prev ? { ...prev, refine_level: newLevel } : prev));

      alert(`Refino +${newLevel} com sucesso!`);

    } else {

      alert('Refino falhou. A joia foi consumida.');

    }

  }

  async function handleSellAll(maxRarity?: string) {

    if (!character) return;

    const rarityRank: Record<string, number> = { normal: 0, magic: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };

    const targets = inventory.filter((item) => {

      if (item.is_equipped || item.is_in_stash) return false;

      const tpl = Object.values(ITEM_DATABASE).find((t) => t.name === item.item_name);

      const rarity = tpl?.rarity ?? 'normal';

      if (maxRarity && (rarityRank[rarity] ?? 0) > (rarityRank[maxRarity] ?? 0)) return false;

      return true;

    });

    if (targets.length === 0) {

      alert('Sem itens para vender.');

      return;

    }

    if (!confirm(`Vender ${targets.length} item(ns)?`)) return;

    const ids = targets.map((i) => i.id);

    const { error } = await supabase.from('inventory').delete().in('id', ids);

    if (error) {

      alert('Erro ao vender itens.');

      return;

    }

    const gain = targets.reduce((acc, item) => {

      const tpl = Object.values(ITEM_DATABASE).find((t) => t.name === item.item_name);

      return acc + (tpl?.sellValue ?? 5);

    }, 0);

    setInventory((prev) => prev.filter((i) => !ids.includes(i.id)));

    const newGold = (character.gold || 0) + gain;

    setCharacter({ ...character, gold: newGold });

    await supabase.from('characters').update({ gold: newGold }).eq('id', character.id);

  }

  // === SKILL SYSTEM ===

  const unlockedSkills = character ? getSkillsForClass(character.class_name) : [];

  // [NOVO] Salvar posições do squad no banco quando mudam

  // Guarda a assinatura do último squad gravado. Combate chama setPartyMembers

  // a cada tick (MP/HP), e sem esse guarda o efeito reescreveria o

  // party_config inteiro com valores velhos, desembrulhando mudanças feitas

  // na arena 3D em outra aba (last write wins).

  const partyConfigSigRef = useRef<string | null>(null);

  useEffect(() => {

    if (!character || partyMembers.length === 0) return;

    const config: Record<string, { position: 'front' | 'mid' | 'back'; autoCast: boolean; classId?: string }> = {};

    partyMembers.forEach((m) => {

      config[m.id] = { position: m.position, autoCast: m.autoCast, classId: m.classId };

    });

    // Só grava quando classe/posição/auto-cast mudam de verdade — o HP/MP

    // de combate não deve tocar no squad persistido.

    const signature = JSON.stringify(config);

    if (partyConfigSigRef.current === signature) return;

    partyConfigSigRef.current = signature;

    supabase

      .from('characters')

      .update({ party_config: config })

      .eq('id', character.id)

      .then(({ error }) => {

        if (error) console.error('Erro ao salvar party_config:', error.message);

      });

  }, [partyMembers, character?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Inicializa skills ao carregar personagem

  useEffect(() => {

    if (!character) return;

    const saved = localStorage.getItem(`aetheria_skill_slots_${character.id}`);

    if (saved) {

      try {

        const parsed = JSON.parse(saved);

        queueMicrotask(() => setSkillSlots(parsed));

      } catch {

        /* ignore */

      }

    } else {

      // Auto-atribui apenas skills ATIVAS (não passivas, não basic_attack)

      const activeSkills = unlockedSkills.filter((id) => getSkill(id)?.type === 'active');

      const auto = [...activeSkills.slice(0, 4), null, null, null, null];

      queueMicrotask(() => setSkillSlots(auto));

      localStorage.setItem(`aetheria_skill_slots_${character.id}`, JSON.stringify(auto));

    }

  }, [character?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function saveSkillSlots(slots: (string | null)[]) {

    setSkillSlots(slots);

    if (character?.id) {

      localStorage.setItem(`aetheria_skill_slots_${character.id}`, JSON.stringify(slots));

    }

  }

  function assignSkillToSlot(skillId: string, slotIndex: number) {

    const newSlots = [...skillSlots];

    const prevIdx = newSlots.indexOf(skillId);

    if (prevIdx >= 0) newSlots[prevIdx] = null;

    newSlots[slotIndex] = skillId;

    saveSkillSlots(newSlots);

    setSkillPickerSlot(null);

  }

  function removeSkillFromSlot(slotIndex: number) {

    const newSlots = [...skillSlots];

    newSlots[slotIndex] = null;

    saveSkillSlots(newSlots);

  }

  // Tick para re-render a cada 500ms (para cooldowns)

  const [nowTick, setNowTick] = useState(0);

  useEffect(() => {

    const id = setInterval(() => setNowTick(Date.now()), 500);

    return () => clearInterval(id);

  }, []);

  function isSkillReady(skillId: string): boolean {

    const cd = skillCooldowns[skillId];

    if (!cd) return true;

    return nowTick >= cd;

  }

  function getSkillCooldownRemaining(skillId: string): number {

    const cd = skillCooldowns[skillId];

    if (!cd) return 0;

    return Math.max(0, cd - nowTick);

  }

  async function handleUseSkill(slotIndex: number) {

    if (!character) return;

    const skillId = skillSlots[slotIndex];

    if (!skillId) {

      setSkillPickerSlot(slotIndex);

      return;

    }

    const skill = getSkill(skillId);

    if (!skill) return;

    if (skill.type === 'passive') {

      alert('Passiva já está ativa.');

      return;

    }

    if (!isSkillReady(skillId)) {

      alert(`Recarga: ${Math.ceil(getSkillCooldownRemaining(skillId) / 1000)}s`);

      return;

    }

    const currentMp = playerMpCurrent ?? maxMp;

    if (currentMp < skill.mpCost) {

      alert('MP insuficiente.');

      return;

    }

    setPlayerMpCurrent(currentMp - skill.mpCost);

    setSkillCooldowns((prev) => ({ ...prev, [skillId]: Date.now() + skill.cooldownMs }));

    // Status ativos (buffs/debuffs reais) — durações por skill

  const nowT = nowMs();

  const ex = (key: string, ms: number) => setEffectExpiry((prev) => ({ ...prev, [key]: nowT + ms }));

  switch (skill.id) {

    case 'berserk': ex('atk', 10000); break;

    case 'furia_incontrolavel': ex('furia', 12000); break;

    case 'fluxo_arcano': ex('matk', 10000); break;

    case 'bencao_divina': ex('all', 12000); ex('defRed', 12000); break;

    case 'olho_aguia': ex('crit', 10000); break;

    case 'escudo_glacial':

    case 'escudo_absorcao': ex('defRed', 8000); break;

    case 'investida':

    case 'nova_congelante':

    case 'armadilha_gelo': ex('stun', 3000); break;

    case 'tiro_marcado': ex('vuln', 8000); break;

    case 'envenenar_laminas': ex('poison', 8000); break;

    case 'lacerar': ex('bleed', 6000); break;

    case 'lanca_gelo': ex('slow', 4000); break;

    case 'toque_vampirico': ex('vamp', 8000); break;

    default: break;

  }

  // parâmetros para lógica de combate

  const baseDmg = derivedStats?.physicalAttack ?? 50;

    const magicDmg = derivedStats?.magicAttack ?? 50;

    const isMagic = skill.id.includes('fireball') || skill.id.includes('meteor') || skill.id.includes('gelo') || skill.id.includes('arcano') || skill.id.includes('sagrada') || skill.id.includes('luz') || skill.id.includes('punicao') || skill.id.includes('insanidade') || skill.id.includes('mental');

    const base = isMagic ? magicDmg : baseDmg;

    const skillDamage = Math.floor(base * skill.power);

    if (skill.id === 'heal' || skill.id === 'luz_sagrada') {

      const healAmount = Math.floor(maxHp * 0.3);

      const nextHp = Math.min(maxHp, (playerHpCurrent ?? maxHp) + healAmount);

      setPlayerHpCurrent(nextHp);

      setCombatLog((prev) => [`✨ ${skill.name}: cura ${healAmount} HP`, ...prev.slice(0, 4)]);

      return;

    }

    if (skill.power > 0) {

      if (bossFighting) {

        const hit = resolveMonsterHit(bossHpCurrent, skillDamage);

        setBossHpCurrent(hit.remainingHp);

        setCombatLog((prev) => [`⚡ ${skill.name}: ${skillDamage} de dano!`, ...prev.slice(0, 4)]);

        if (hit.defeated) {

          // Boss derrotado por skill — mesma lógica do auto-attack

          setBossFighting(false);

          const newCleared = Math.max(highestClearedFloor, currentFloor);

          setHighestClearedFloor(newCleared);

          setBossHpCurrent(floorData.bossHp);

          setMobHpCurrent(floorData.maxHp);

          setCombatLog((prev) => [`🏆 ${skill.name} derrotou o chefe! Andar ${currentFloor} desbloqueado.`, ...prev.slice(0, 4)]);

          localStorage.setItem(`aetheria_floor_${character.id}`, JSON.stringify({ currentFloor, highestClearedFloor: newCleared }));

          await supabase.from('characters').update({ tower_floor: newCleared }).eq('id', character.id);

        }

      } else {

        const hit = resolveMonsterHit(mobHpCurrent, skillDamage);

        setMobHpCurrent(hit.remainingHp);

        setCombatLog((prev) => [`⚡ ${skill.name}: ${skillDamage} de dano!`, ...prev.slice(0, 4)]);

        if (hit.defeated) {

          // Monstro comum derrotado por skill

          const monsters: MonsterDefinition[] = floorData.monsters.length > 0 ? floorData.monsters : [{ id: 'default', name: floorData.monster, hp: floorData.maxHp, exp: floorData.exp, gold: floorData.gold, attack: 10, defense: 0, boss: false, floor: currentFloor }];

          const nextMonster = pickRandom(monsters);

          setCurrentMonster(nextMonster);

          setMobHpCurrent(nextMonster.hp);

          setCombatLog((prev) => [`⚡ ${skill.name} derrotou ${currentMonster?.name ?? floorData.monster}!`, ...prev.slice(0, 4)]);

        }

      }

    // Efeitos auxiliares de cura para skills híbridas

    if (skill.id === 'nova_sagrada') {

      const amt = Math.floor(maxHp * 0.1);

      setPlayerHpCurrent((prev) => Math.min(maxHp, (prev ?? maxHp) + amt));

    }

    if (skill.id === 'toque_vampirico') {

      const amt = Math.floor(skillDamage * 0.4);

      setPlayerHpCurrent((prev) => Math.min(maxHp, (prev ?? maxHp) + amt));

    }

    } else {

      setCombatLog((prev) => [`🔄 ${skill.name} ativada!`, ...prev.slice(0, 4)]);

    }

  }

  const handleSelectFloor = (nextFloor: number) => {

    if (nextFloor === 0) {

      setCurrentFloor(0);

      setBossFighting(false);

      if (character?.id) {

        localStorage.setItem(`aetheria_floor_${character.id}`, JSON.stringify({ currentFloor: 0, highestClearedFloor }));

      }

      return;

    }

    const fl = getFloor(nextFloor);

    setCurrentFloor(nextFloor);

    setBossFighting(false);

    setCurrentMonster(fl.monsters[0] ?? null);

    setMobHpCurrent(fl.monsters[0]?.hp ?? 100);

    setBossHpCurrent(fl.boss?.hp ?? 100);

    if (character?.id) {

      const state = { currentFloor: nextFloor, highestClearedFloor };

      localStorage.setItem(`aetheria_floor_${character.id}`, JSON.stringify(state));

    }

  };

  // 1. Carregar conta, personagens e inventário

  useEffect(() => {

    let cancelled = false;

    async function loadGameData() {

      setLoading(true);

      setLoadError(null);

      try {

        // Verificar a sessão autenticada (com tempo limite: rede bloqueada
        // não pode deixar a tela em "carregando" para sempre).

        const {

          user,

          error: authError,

          timedOut: authTimedOut,

        } = await getUserWithTimeout();

        if (authTimedOut) {

          if (!cancelled) {

            setLoadError(

              'Não foi possível falar com o servidor do jogo (tempo esgotado). Verifique sua conexão com a internet e tente novamente.',

            );

          }

          return;

        }

        if (authError || !user) {

          router.push('/login');

          return;

        }

        // Localizar a conta do jogo.

        const { data: account, error: accountError } = await supabase

          .from('accounts')

          .select('id')

          .eq('auth_user_id', user.id)

          .single();

        if (accountError || !account) {

          console.error('Erro ao carregar conta:', accountError);

          if (!cancelled) {

            setLoadError(

              'Não foi possível localizar sua conta do jogo. Tente novamente.'

            );

          }

          return;

        }

        if (cancelled) return;

        // Buscar somente os personagens desta conta.

        const { data: chars, error: charsError } = await supabase

          .from('characters')

          .select('*')

          .eq('account_id', account.id)

          .order('created_at', { ascending: true });

        if (charsError) {

          console.error('Erro ao carregar personagens:', charsError);

          if (!cancelled) {

            setLoadError('Não foi possível carregar seus personagens.');

          }

          return;

        }

        if (cancelled) return;

        const characters = (chars ?? []) as Character[];

        setAvailableCharacters(characters);

        // Se não existem personagens, mostrar a tela de criação.

        if (characters.length === 0) {

          localStorage.removeItem('aetheria_char_id');

          setCharacter(null);

          setInventory([]);

          setSelectingCharacter(false);

          return;

        }

        const savedCharId = localStorage.getItem('aetheria_char_id');

        let savedCharacter = characters.find(

          (char) => char.id === savedCharId

        );

        // [NOVO] Balanceamento de atributos: verificar e corrigir pontos distribuídos

        if (savedCharacter) {

          const lvl = savedCharacter.level ?? 1;

          const basePerStat = 10;

          const pointsPerLevel = 5;

          const totalStatsBase = 6 * basePerStat; // 60

          const expectedDistributed = (lvl - 1) * pointsPerLevel;

          const totalExpected = totalStatsBase + expectedDistributed;

          const actualTotal = (savedCharacter.str ?? 0) + (savedCharacter.agi ?? 0) + (savedCharacter.vit ?? 0) + (savedCharacter.int_stat ?? 0) + (savedCharacter.dex ?? 0) + (savedCharacter.luk ?? 0);

          if (actualTotal > totalExpected) {

            // Reset: volta tudo para base e recalcula stat_points

            const resetStats = {

              str: basePerStat, agi: basePerStat, vit: basePerStat,

              int_stat: basePerStat, dex: basePerStat, luk: basePerStat,

            };

            const { error: resetError } = await supabase

              .from('characters')

              .update({ ...resetStats, stat_points: expectedDistributed })

              .eq('id', savedCharacter.id);

            if (!resetError) {

              savedCharacter = { ...savedCharacter, ...resetStats, stat_points: expectedDistributed };

            }

          }

        }

        // Usar o personagem salvo somente se ele pertencer à  conta.

        // Caso contrário, abrir a seleção.

        if (!savedCharacter) {

          setCharacter(null);

          setInventory([]);

          setSelectingCharacter(true);

          return;

        }

        // Carregar inventário do personagem selecionado.

        const { data: invData, error: invError } = await supabase

          .from('inventory')

          .select('*')

          .eq('character_id', savedCharacter.id);

        if (invError) {

          console.error('Erro ao carregar inventário:', invError);

          if (!cancelled) {

            setLoadError(

              'O personagem foi encontrado, mas não foi possível carregar o inventário.'

            );

          }

          return;

        }

        if (cancelled) return;

        setCharacter({

          ...savedCharacter,

          race: savedCharacter.race ?? 'humano',

          level: savedCharacter.level ?? 1,

          exp: savedCharacter.exp ?? 0,

          gold: savedCharacter.gold ?? 0,

          str: savedCharacter.str ?? 10,

          agi: savedCharacter.agi ?? 10,

          vit: savedCharacter.vit ?? 10,

          stat_points: savedCharacter.stat_points ?? 0,

          talent_points: savedCharacter.talent_points ?? 0,

          int_stat: savedCharacter.int_stat ?? 10,

          dex: savedCharacter.dex ?? 10,

          luk: savedCharacter.luk ?? 10,

        });

        // [NOVO] Inicializar party de 4 membros (com posições salvas no banco)

        const pName = savedCharacter.name ?? 'Herói';

        const pMaxHp = 500 + (savedCharacter.vit ?? 10) * 20 + (savedCharacter.level ?? 1) * 15;

        const savedPositions = (savedCharacter.party_config as Record<string, { position: 'front' | 'mid' | 'back'; autoCast: boolean; classId?: string }>) ?? {};

        const getPos = (id: string, defaultPos: 'front' | 'mid' | 'back') => savedPositions[id]?.position ?? defaultPos;

        const getAuto = (id: string, defaultAuto: boolean) => savedPositions[id]?.autoCast ?? defaultAuto;

        const getClass = (id: string, defaultClass: string) => savedPositions[id]?.classId ?? defaultClass;

        // [NOVO] Inicializar party com bots IAs de classes finais

        const leaderLevel = savedCharacter.level ?? 1;

        const botTemplates = getBotTemplates();

        const botRoles = [

          { id: 'tank', defaultClass: 'paladino' },

          { id: 'dps', defaultClass: 'atirador_elite' },

          { id: 'healer', defaultClass: 'sacerdote_divino' },

        ];

        setPartyMembers([

          { id: 'player', name: pName, isPlayer: true, isAlive: true, hp: pMaxHp, maxHp: pMaxHp, mp: pMaxHp, maxMp: pMaxHp, position: getPos('player', 'front'), autoCast: getAuto('player', true) },

          ...botRoles.map((b) => {

            const savedClass = getClass(b.id, b.defaultClass);

            const template = botTemplates.find((t) => t.classId === savedClass) ?? botTemplates.find((t) => t.classId === b.defaultClass)!;

            const bot = createBotMember(template, leaderLevel, b.id, getPos(b.id, 'mid') as 'front' | 'mid' | 'back');

            return { ...bot, autoCast: getAuto(b.id, true) };

          }),

        ]);

        setPlayerHpCurrent(pMaxHp);

        setInventory(invData ?? []);

        setPlayerHpCurrent(null);

        const storedFloorRaw = localStorage.getItem(`aetheria_floor_${savedCharacter.id}`);

        const storedFloor = storedFloorRaw ? JSON.parse(storedFloorRaw) : null;

        const dbCleared = savedCharacter.tower_floor ?? 1;

        const cleared = Math.max(dbCleared, storedFloor?.highestClearedFloor ?? 1);

        const huntFloor = storedFloor?.currentFloor ?? (cleared > 1 ? cleared : 1);

        setHighestClearedFloor(cleared);

        setCurrentFloor(huntFloor);

        setSelectingCharacter(false);

      } catch (err) {

        console.error('Erro inesperado ao carregar o jogo:', err);

        if (!cancelled) {

          setLoadError(

            'Ocorreu um erro inesperado ao carregar Aetheria. Tente novamente.'

          );

        }

      } finally {

        if (!cancelled) setLoading(false);

      }

    }

    loadGameData();

    return () => {

      cancelled = true;

    };

  }, [router]);

  // Calcular bônus dos itens equipados

  const equippedItems = inventory.filter((i) => i.is_equipped);

  const totalItemAttack = equippedItems.reduce((acc, item) => {

    const template = Object.values(ITEM_DATABASE).find((t) => t.name === item.item_name);

    return acc + (template?.attack || 10) + (item.refine_level * 3);

  }, 0);

  const totalItemDefense = equippedItems.reduce((acc, item) => {

    const template = Object.values(ITEM_DATABASE).find((t) => t.name === item.item_name);

    return acc + (template?.defense || 0) + (item.refine_level * 2);

  }, 0);

  const itemByName = itemByNameMap(Object.values(ITEM_DATABASE));

  // Stats base do personagem

  const maxHp = Math.floor(500 + (character?.level ?? 1) * 25 + Math.pow(character?.level ?? 1, 1.85) * 2 * (1 + (character?.vit ?? 10) * 0.015));

  const playerHp = playerHpCurrent ?? maxHp;

  const maxMp = 100 + (character?.int_stat ?? 10) * 10 + (character?.level ?? 1) * 5;

  const maxSd = 300 + (character?.level ?? 1) * 10;

  const combatPower = Math.floor((character?.level ?? 1) * 100 + (character?.str ?? 10) * 15 + totalItemAttack * 10);

  // Passivas equipadas nos slots — bônus reais nos stats derivados

  const passiveSkillIds = skillSlots.filter((id): id is string => !!id && getSkill(id)?.type === 'passive');

  const passiveBonus = useMemo(() => {

    if (passiveSkillIds.length === 0) return null;

    const hpMult = 1;

    let defBonus = 0;

    let intBonus = 0;

    let critDmgBonus = 0;

    for (const id of passiveSkillIds) {

      if (id === 'pele_aco') defBonus += 0.10;

      if (id === 'foco_letal') critDmgBonus += 0.25;

      if (id === 'mente_brilhante') intBonus += 0.12;

    }

    return { hpMult, defBonus, intBonus, critDmgBonus };

  }, [passiveSkillIds]);

  const derivedStats = character

    ? (() => {

        const base = computeDerivedStats({

          character: { ...character, level: character.level ?? 1, race: (character.race ?? 'humano') as RaceId },

          raceId: (character.race ?? 'humano') as RaceId,

          inventory: inventory as InventoryItem[],

          itemByName,

        });

        const _now = nowTick;

        const _act = (k: string) => (effectExpiry[k] ?? 0) > _now;

        const _atkMult = (_act('atk') ? 1.5 : 1) * (_act('furia') ? 1.3 : 1) * (_act('all') ? 1.1 : 1);

        const _matkMult = (_act('matk') ? 1.2 : 1) * (_act('all') ? 1.1 : 1);

        if (!passiveBonus) {

          return { ...base, physicalAttack: Math.floor(base.physicalAttack * _atkMult), magicAttack: Math.floor(base.magicAttack * _matkMult) };

        }

        return {

          ...base,

          maxHp: Math.floor(base.maxHp * (1 + passiveBonus.hpMult)),

          physicalAttack: Math.floor(base.physicalAttack * _atkMult),

          magicAttack: Math.floor(base.magicAttack * _matkMult),

          physicalDefense: Math.floor(base.physicalDefense * (1 + passiveBonus.defBonus)),

          magicDefense: Math.floor(base.magicDefense * (1 + passiveBonus.defBonus)),

          int_stat: Math.floor(base.int_stat * (1 + passiveBonus.intBonus)),

          critDamage: base.critDamage + passiveBonus.critDmgBonus,

        };

      })()

    : null;

  // [NOVO] Sistema de Auto-Cast de Skills

  // Skills nos slots com autoCast=true são lançadas automaticamente em sequência

  // Skills de cura só são lançadas se autoCast=true (caso contrário, uso manual)

  useEffect(() => {

    if (!character || !autoHunt) return;

    const autoCastInterval = setInterval(() => {

      const targetHp = bossFighting ? bossHpCurrent : mobHpCurrent;

      const targetMaxHp = bossFighting ? floorData.bossHp : floorData.maxHp;

      // Itera pelos slots de skill em sequência

      for (let i = 0; i < skillSlots.length; i++) {

        const skillId = skillSlots[i];

        if (!skillId) continue;

        const skill = getSkill(skillId);

        if (!skill || skill.type === 'passive') continue;

        // Verifica se o jogador tem auto-cast ativo

        const playerMember = partyMembers.find((m) => m.isPlayer);

        if (playerMember && !playerMember.autoCast) continue;

        // Skills de cura só são lançadas se autoCast=true

        if (skill.effect.includes('Cura') || skill.effect.includes('Recupera')) {

          if (!playerMember?.autoCast) continue;

        }

        // Verifica se a skill está pronta

        const cd = skillCooldowns[skillId];

        if (cd && Date.now() < cd) continue;

        // Lança a skill

        const currentMp = playerMpCurrent ?? maxMp;

        if (skill.mpCost > currentMp) continue;

        // Calcula dano da skill

        const skillDamage = Math.floor((derivedStats?.physicalAttack ?? 40) * skill.power);

        const newTargetHp = resolveMonsterHit(targetHp, skillDamage);

        if (bossFighting) {

          setBossHpCurrent(newTargetHp.remainingHp);

          setCombatLog((prev) => [`✨ ${character.name} usou ${skill.name}! -${skillDamage}`, ...prev.slice(0, 4)]);

        } else {

          setMobHpCurrent(newTargetHp.remainingHp);

          setCombatLog((prev) => [`✨ ${character.name} usou ${skill.name}! -${skillDamage}`, ...prev.slice(0, 4)]);

        }

        // Aplica cooldown

        setSkillCooldowns((prev) => ({

          ...prev,

          [skillId]: Date.now() + skill.cooldownMs,

        }));

        // Apenas uma skill por tick

        break;

      }

    }, 500); // Verifica a cada 500ms

    return () => clearInterval(autoCastInterval);

  }, [character, autoHunt, bossFighting, bossHpCurrent, mobHpCurrent, skillSlots, skillCooldowns, partyMembers, floorData, derivedStats, maxMp]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2. Loop de Combate da Torre

  // Recompensas são concedidas somente quando o HP do monstro chega a zero.

  useEffect(() => {

    if (!character || !autoHunt) return;

    if (currentFloor === 0) return; // pausa combate na cidade

    const interval = setInterval(async () => {

      if (bossFighting) {

        // [NOVO] Atualizar timer de enrage

        setBossEnrageTimer((prev) => {

          const next = prev + 2.5;

          return next >= 60 ? 0 : next; // reset após 60s (enrage cycle)

        });

        // [NOVO] Combate individual — cada membro causa seu próprio dano

        let totalPartyDamage = 0;

        const combatMsgs: string[] = [];

        const targetName = bossFighting ? floorData.boss : floorData.monster;

        partyMembers.forEach((m) => {

          if (!m.isAlive) return;

          const memberName = m.isPlayer ? (character.name ?? 'Herói') : m.name;

          const atk = m.isPlayer ? (derivedStats?.physicalAttack ?? 40) : (m.physicalAttack ?? 40);

          // Verifica se bot tem skill pronta para usar

          let skillUsed = false;

          let skillDmg = 0;

          if (!m.isPlayer && m.autoCast && m.skills && m.skills.length > 0) {

            for (const skillId of m.skills) {

              const skill = getSkill(skillId);

              if (!skill || skill.type === 'passive') continue;

              const cd = skillCooldowns[skillId];

              if (cd && Date.now() < cd) continue;

              if (skill.mpCost > (m.mp ?? 0)) continue;

              // Usa a skill

              skillDmg = Math.floor((m.magicAttack ?? atk) * skill.power);

              totalPartyDamage += skillDmg;

              combatMsgs.push(`✨ ${memberName} usou ${skill.name}! -${skillDmg}`);

              // Consome MP e aplica cooldown

              setPartyMembers((prev) =>

                prev.map((p) => (p.id === m.id ? { ...p, mp: Math.max(0, (p.mp ?? 0) - skill.mpCost) } : p))

              );

              setSkillCooldowns((prev) => ({ ...prev, [skillId]: Date.now() + skill.cooldownMs }));

              skillUsed = true;

              break;

            }

          }

          // Auto-ataque (se não usou skill)

          if (!skillUsed) {

            const memberDmg = Math.floor(atk * (m.isPlayer ? 1 : 0.5));

            totalPartyDamage += memberDmg;

            combatMsgs.push(`⚔️ ${memberName} auto ataque causou ${memberDmg} em ${targetName}`);

          }

        });

        const hit = resolveMonsterHit(bossHpCurrent, totalPartyDamage);

        if (hit.defeated) {

          setBossFighting(false);

          setBossActiveSkill(null);

          const newCleared = Math.max(highestClearedFloor, currentFloor);

          setHighestClearedFloor(newCleared);

          setBossHpCurrent(floorData.bossHp);

          setMobHpCurrent(floorData.maxHp);

          if (character?.id) {

            localStorage.setItem(`aetheria_floor_${character.id}`, JSON.stringify({ currentFloor, highestClearedFloor: newCleared }));

          }

          await supabase.from('characters').update({ tower_floor: newCleared }).eq('id', character.id);

          setCombatLog((prev) => [`🏆 GUARDIÃO DERROTADO! Andar ${currentFloor} desbloqueado para progredir.`, ...prev.slice(0, 4)]);

        } else {

          setBossHpCurrent(hit.remainingHp);

          // [NOVO] Boss Skills baseadas no tema do andar

          const theme = getTowerTheme(currentFloor);

          const bossSkills = getBossSkills(theme.id as TowerThemeId);

          const bossHpPercent = (hit.remainingHp / (floorData.bossHp || 1)) * 100;

          const activeSkill = bossSkills.find((s) => shouldTriggerSkill(s, bossHpPercent));

          if (activeSkill && activeSkill.skillId !== bossActiveSkill?.skillId) {

            setBossActiveSkill(activeSkill);

          }

          // [NOVO] Skill AOE: distribui dano entre TODOS os membros vivos

          if (bossActiveSkill?.effect === 'aoe_damage') {

            const aoeDmg = Math.floor((floorData.bossAttack ?? 30) * bossActiveSkill.damageMultiplier);

            setPartyMembers((prev) => {

              const updated = prev.map((m) => {

                if (!m.isAlive) return m;

                const newHp = Math.max(0, m.hp - aoeDmg);

                if (m.isPlayer) setPlayerHpCurrent(newHp);

                return { ...m, hp: newHp, isAlive: newHp > 0 };

              });

              return updated;

            });

            setCombatLog((prev) => [`🔥 ${floorData.boss} usou ${bossActiveSkill.skillName}! Dano em área: ${aoeDmg}`, ...prev.slice(0, 4)]);

          }

          // [NOVO] Dano normal: atinge apenas o(s) membro(s) na FRONT LINE

          const enemyDmg = Math.max(1, (floorData.bossAttack ?? 30) - Math.floor(((character.vit ?? 10) + totalItemDefense) / 2));

          const frontLineMembers = partyMembers.filter((m) => m.isAlive && m.position === 'front');

          if (frontLineMembers.length === 0) {

            // Se não há ninguém na front, o boss ataca quem estiver vivo

            const anyAlive = partyMembers.find((m) => m.isAlive);

            if (anyAlive) {

              setPartyMembers((prev) =>

                prev.map((m) => {

                  if (m.id !== anyAlive.id) return m;

                  const newHp = Math.max(0, m.hp - enemyDmg);

                  if (m.isPlayer) setPlayerHpCurrent(newHp);

                  return { ...m, hp: newHp, isAlive: newHp > 0 };

                })

              );

            }

          } else {

            // Dano apenas na front line

            setPartyMembers((prev) => {

              const updated = prev.map((m) => {

                if (!m.isAlive || m.position !== 'front') return m;

                const newHp = Math.max(0, m.hp - enemyDmg);

                if (m.isPlayer) setPlayerHpCurrent(newHp);

                return { ...m, hp: newHp, isAlive: newHp > 0 };

              });

              return updated;

            });

          }

          // [NOVO] Verificar se TODOS morreram (líder pode morrer e squad continua)

          const allDead = partyMembers.every((m) => !m.isAlive);

          if (allDead) {

            setBossFighting(false);

            setBossActiveSkill(null);

            setBossHpCurrent(floorData.bossHp);

            setMobHpCurrent(floorData.maxHp);

            setPlayerHpCurrent(maxHp);

            setPartyMembers((prev) => prev.map((m) => ({ ...m, hp: m.maxHp, isAlive: true })));

            setCombatLog((prev) => [`💀 Party derrotada pelo chefe! Voltando ao farm do andar ${currentFloor}.`, ...prev.slice(0, 4)]);

            return;

          }

          // [NOVO] Log dos membros da party (mostra ações de todos)

          if (combatMsgs.length > 0) {

            setCombatLog((prev) => [combatMsgs.join(' | '), ...prev.slice(0, 4)]);

          }

          setCombatLog((prev) => [`⚔️ Dano no Chefe: -${hit.damage} (HP: ${hit.remainingHp}) | Boss causou ${enemyDmg} na linha de frente`, ...prev.slice(0, 4)]);

        }

        return;

      }

      // [NOVO] Combate normal — todos os membros atacam

      let totalMobDamage = 0;

      const mobMsgs: string[] = [];

      const mobTarget = floorData.monster;

      partyMembers.forEach((m) => {

        if (!m.isAlive) return;

        const memberName = m.isPlayer ? (character.name ?? 'Herói') : m.name;

        const atk = m.isPlayer ? (derivedStats?.physicalAttack ?? 40) : (m.physicalAttack ?? 40);

        // Bots usam skills no combate normal também

        let skillUsed = false;

        if (!m.isPlayer && m.autoCast && m.skills && m.skills.length > 0) {

          for (const skillId of m.skills) {

            const skill = getSkill(skillId);

            if (!skill || skill.type === 'passive') continue;

            const cd = skillCooldowns[skillId];

            if (cd && Date.now() < cd) continue;

            if (skill.mpCost > (m.mp ?? 0)) continue;

            const skillDmg = Math.floor((m.magicAttack ?? atk) * skill.power);

            totalMobDamage += skillDmg;

            mobMsgs.push(`✨ ${memberName} usou ${skill.name}! -${skillDmg}`);

            setPartyMembers((prev) =>

              prev.map((p) => (p.id === m.id ? { ...p, mp: Math.max(0, (p.mp ?? 0) - skill.mpCost) } : p))

            );

            setSkillCooldowns((prev) => ({ ...prev, [skillId]: Date.now() + skill.cooldownMs }));

            skillUsed = true;

            break;

          }

        }

        if (!skillUsed) {

          const memberDmg = Math.floor(atk * (m.isPlayer ? 1 : 0.5));

          totalMobDamage += memberDmg;

          mobMsgs.push(`⚔️ ${memberName} auto ataque causou ${memberDmg} em ${mobTarget}`);

        }

      });

      const hit = resolveMonsterHit(mobHpCurrent, totalMobDamage);

      if (!hit.defeated) {

        setMobHpCurrent(hit.remainingHp);

        const enemyDmg = Math.max(1, (floorData.attack ?? 10) - Math.floor(((character.vit ?? 10) + totalItemDefense) / 2));

        const nextHp = playerHp - enemyDmg;

        if (nextHp <= 0) {

          setPlayerHpCurrent(maxHp);

          setCombatLog((prev) => [`💀 ${character.name ?? 'Herói'} foi derrotado por ${mobTarget}. HP restaurado.`, ...prev.slice(0, 4)]);

        } else {

          setPlayerHpCurrent(nextHp);

          if (mobMsgs.length > 0) setCombatLog((prev) => [mobMsgs.join(' | '), ...prev.slice(0, 4)]);

          setCombatLog((prev) => [`⚔️ ${mobTarget} causou ${enemyDmg} em ${character.name ?? 'Herói'}`, ...prev.slice(0, 4)]);

        }

        return;

      }

      // A partir daqui temos exatamente uma resolução de morte para este HP atual.

      const nextMonster = pickMonster(floorData);

      setMobHpCurrent(nextMonster.hp);

      const expGained = floorData.exp;

      const goldGained = floorData.gold;

      const progression = applyExperience(

        { level: character.level, exp: character.exp || 0, statPoints: character.stat_points || 0 },

        expGained,

        5

      );

      const newTalentPoints = (character.talent_points ?? 0) + progression.levelsGained * 3;

      const newGold = (character.gold || 0) + goldGained;

      let droppedItemName = '';

      // O drop é rolado uma vez por monstro derrotado, nunca por golpe.

      if (rollChance(0.22)) {

        const templates = Object.values(ITEM_DATABASE);

        const randomTemplate = pickRandom(templates);

        droppedItemName = randomTemplate.name;

        const { data: newItem, error: itemError } = await supabase

          .from('inventory')

          .insert([{

            character_id: character.id,

            item_name: randomTemplate.name,

            item_type: randomTemplate.type,

            refine_level: 0,

            is_equipped: false,

            is_in_stash: false,

          }])

          .select()

          .single();

        if (itemError) {

          console.error('Falha ao salvar drop:', itemError.message);

          droppedItemName = '';

        } else if (newItem) {

          setInventory((prev) => [...prev, newItem]);

        }

      }

      const updatedChar = {

        ...character,

        level: progression.level,

        exp: progression.exp,

        gold: newGold,

        stat_points: progression.statPoints,

        talent_points: newTalentPoints,

      };

      const { error: saveError } = await supabase

        .from('characters')

        .update({

          level: progression.level,

          exp: progression.exp,

          gold: newGold,

          stat_points: progression.statPoints,

          talent_points: newTalentPoints,

        })

        .eq('id', character.id);

      if (saveError) {

        console.error('Falha ao salvar recompensa do combate:', saveError.message);

        setCombatLog((prev) => [`⚠️ Recompensa calculada, mas não foi possível salvar: ${saveError.message}`, ...prev.slice(0, 4)]);

        return;

      }

      setCharacter(updatedChar);

      let logMessage = progression.levelsGained > 0

        ? `🎉 LEVEL UP! Nível ${progression.level} alcançado! (+${expGained} XP, +${goldGained} Ouro)`

        : `⚔️ Derrotou ${floorData.monster} (+${expGained} XP, +${goldGained} Ouro)`;

      if (droppedItemName) logMessage += ` 🎁 Drop: ${droppedItemName}!`;

      setCombatLog((prev) => [logMessage, ...prev.slice(0, 4)]);

    }, 2500);

    return () => clearInterval(interval);

  }, [character, autoHunt, bossFighting, bossHpCurrent, currentFloor, floorData, totalItemAttack, mobHpCurrent]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleEquipItem(item: InventoryItem) {

    const newEquipStatus = !item.is_equipped;

    const { error } = await supabase

      .from('inventory')

      .update({ is_equipped: newEquipStatus, is_in_stash: false })

      .eq('id', item.id);

    if (!error) {

      setInventory((prev) =>

        prev.map((i) => (i.id === item.id ? { ...i, is_equipped: newEquipStatus, is_in_stash: false } : i))

      );

      setSelectedItem(null);

    }

  }

  async function handleMoveToStash(item: InventoryItem) {

    const newStashStatus = !item.is_in_stash;

    const { error } = await supabase

      .from('inventory')

      .update({ is_in_stash: newStashStatus, is_equipped: false })

      .eq('id', item.id);

    if (!error) {

      setInventory((prev) =>

        prev.map((i) => (i.id === item.id ? { ...i, is_in_stash: newStashStatus, is_equipped: false } : i))

      );

      setSelectedItem(null);

    }

  }

  async function handleAddStat(statKey: 'str' | 'agi' | 'vit' | 'int_stat' | 'dex' | 'luk') {

    if (!character || character.stat_points <= 0) return;

    const updatedChar = {

      ...character,

      [statKey]: character[statKey] + 1,

      stat_points: character.stat_points - 1,

    };

    setCharacter(updatedChar);

    await supabase

      .from('characters')

      .update({

        [statKey]: updatedChar[statKey],

        stat_points: updatedChar.stat_points,

      })

      .eq('id', character.id);

  }

async function handleCreateCharacter(e: React.FormEvent) {

  e.preventDefault();

  const cleanName = charName.trim().replace(/[^a-zA-Z0-9]/g, '');

  if (cleanName.length < 3 || cleanName.length > 12) {

    alert('O nome deve conter de 3 a 12 caracteres.');

    return;

  }

  setCreating(true);

  try {

    const {

      data: { user },

      error: authError,

    } = await supabase.auth.getUser();

    if (authError || !user) {

      alert('Sua sessão expirou. Entre novamente.');

      router.push('/login');

      return;

    }

    const { data: account, error: accountError } = await supabase

      .from('accounts')

      .select('id')

      .eq('auth_user_id', user.id)

      .single();

    if (accountError || !account) {

      console.error('Erro ao localizar a conta do jogo:', accountError);

      alert('Não foi possível localizar sua conta do jogo. Tente novamente.');

      return;

    }

    const cls = getClass('aprendiz');

    const baseStats = {

      str: cls.baseStats.str + 5,

      agi: cls.baseStats.agi + 5,

      vit: cls.baseStats.vit + 5,

      int_stat: cls.baseStats.int_stat + 5,

      dex: cls.baseStats.dex + 5,

      luk: cls.baseStats.luk + 5,

    };

    const raced = applyRaceModifiers(baseStats, selectedRace as RaceId);

    const { data, error } = await supabase

      .from('characters')

      .insert([

        {

          account_id: account.id,

          name: cleanName,

          class_name: 'Aprendiz',

          race: selectedRace,

          level: 1,

          resets: 0,

          exp: 0,

          str: raced.str,

          agi: raced.agi,

          vit: raced.vit,

          int_stat: raced.int_stat,

          dex: raced.dex,

          luk: raced.luk,

          stat_points: 5,

          talent_points: 3,

          gold: 500,

          tower_floor: 1,

        },

      ])

      .select()

      .single();

    if (error) {

      console.error('Erro ao criar personagem:', error);

      alert(`Erro ao criar personagem: ${error.message}`);

      return;

    }

    if (data) {

      localStorage.setItem('aetheria_char_id', data.id);

      setAvailableCharacters((previous) => [...previous, data]);

      setCharacter({ ...data, race: data.race ?? selectedRace });

      setInventory([]);

      setSelectingCharacter(false);

    }

  } catch (err) {

    console.error('Erro inesperado ao criar personagem:', err);

    alert('Erro de conexão ao criar personagem.');

  } finally {

    setCreating(false);

  }

}

  // TELA DE CARREGAMENTO

  if (loading) {

    return (

      <div className="w-screen h-screen bg-slate-950 flex items-center justify-center text-amber-500 font-mono text-sm">

        Carregando Aetheria Engine...

      </div>

    );

  }

  // Erro de carregamento: não confundir com personagem inexistente.

  if (loadError) {

    return (

      <div className="w-screen h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 p-6 text-slate-100">

        <h1 className="text-lg font-bold text-amber-500">

          PROJECT AETHERIA

        </h1>

        <p className="max-w-md text-center text-sm text-slate-300">

          {loadError}

        </p>

        <button

          onClick={() => window.location.reload()}

          className="rounded-xl bg-amber-600 px-5 py-3 text-sm font-bold text-white hover:bg-amber-500"

        >

          Tentar novamente

        </button>

        <button

          onClick={() => router.push('/login')}

          className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-bold text-slate-200 hover:bg-slate-800"

        >

          Ir para o login

        </button>

      </div>

    );

  }

  // TELA DE SELEÇÃO DE PERSONAGEM

  if (selectingCharacter && !character) {

    return (

      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-100">

        <div className="w-full max-w-2xl space-y-6">

          <div className="text-center">

            <h1 className="text-2xl font-extrabold text-amber-500 tracking-wider">

              PROJECT AETHERIA

            </h1>

            <p className="mt-2 text-sm text-slate-400">

              Escolha seu herói para continuar a aventura

            </p>

          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {availableCharacters.map((hero) => (

              <button

                key={hero.id}

                type="button"

                onClick={async () => {

                  setLoading(true);

                  setLoadError(null);

                  try {

                    const { data: invData, error: invError } =

                      await supabase

                        .from('inventory')

                        .select('*')

                        .eq('character_id', hero.id);

                    if (invError) {

                      console.error(

                        'Erro ao carregar inventário:',

                        invError

                      );

                      setLoadError(

                        'Não foi possível carregar o inventário deste personagem.'

                      );

                      return;

                    }

                    localStorage.setItem('aetheria_char_id', hero.id);

                    setCharacter({

                      ...hero,

                      race: hero.race ?? 'humano',

                      level: hero.level ?? 1,

                      exp: hero.exp ?? 0,

                      gold: hero.gold ?? 0,

                      str: hero.str ?? 10,

                      agi: hero.agi ?? 10,

                      vit: hero.vit ?? 10,

                      stat_points: hero.stat_points ?? 0,

                      talent_points: hero.talent_points ?? 0,

                      int_stat: hero.int_stat ?? 10,

                      dex: hero.dex ?? 10,

                      luk: hero.luk ?? 10,

                    });

                    setInventory(invData ?? []);

                    const pMaxHp2 = 500 + (hero.vit ?? 10) * 20 + (hero.level ?? 1) * 15;

                    setPlayerHpCurrent(pMaxHp2);

                    // [NOVO] Inicializar party ao selecionar personagem

                    setPartyMembers([

                      { id: 'player', name: hero.name ?? 'Herói', isPlayer: true, isAlive: true, hp: pMaxHp2, maxHp: pMaxHp2, mp: pMaxHp2, maxMp: pMaxHp2, position: 'front' as const, autoCast: true },

                      { id: 'tank', name: 'Ragnar (IA)', isPlayer: false, isAlive: true, hp: 2500, maxHp: 2500, mp: 2500, maxMp: 2500, position: 'front' as const, autoCast: true },

                      { id: 'dps', name: 'Lyra (IA)', isPlayer: false, isAlive: true, hp: 650, maxHp: 650, mp: 650, maxMp: 650, position: 'mid' as const, autoCast: true },

                      { id: 'healer', name: 'Sage (IA)', isPlayer: false, isAlive: true, hp: 720, maxHp: 720, mp: 720, maxMp: 720, position: 'back' as const, autoCast: false },

                    ]);

                    const storedFloorRaw2 = localStorage.getItem(`aetheria_floor_${hero.id}`);

                    const storedFloor2 = storedFloorRaw2 ? JSON.parse(storedFloorRaw2) : null;

                    const cleared2 = Math.max(hero.tower_floor ?? 1, storedFloor2?.highestClearedFloor ?? 1);

                    const huntFloor2 = storedFloor2?.currentFloor ?? (cleared2 > 1 ? cleared2 : 1);

                    setHighestClearedFloor(cleared2);

                    setCurrentFloor(huntFloor2);

                    setSelectingCharacter(false);

                  } catch (err) {

                    console.error(

                      'Erro ao selecionar personagem:',

                      err

                    );

                    setLoadError(

                      'Ocorreu um erro ao selecionar o personagem.'

                    );

                  } finally {

                    setLoading(false);

                  }

                }}

                className="rounded-2xl border border-slate-700 bg-slate-900 p-6 text-left transition hover:border-amber-500 hover:bg-slate-800"

              >

                <p className="text-lg font-bold text-amber-400">

                  {hero.name}

                </p>

                <p className="mt-2 text-sm text-slate-300">

                  Classe: {hero.class_name ?? 'Aprendiz'}

                </p>

                <p className="text-sm text-slate-300">

                  Nível: {hero.level ?? 1}

                </p>

                <p className="mt-4 text-xs font-semibold text-amber-500">

                  JOGAR COM ESTE HERÓI →

                </p>

              </button>

            ))}

          </div>

          <button

            type="button"

            onClick={() => {

              localStorage.removeItem('aetheria_char_id');

              setCharacter(null);

              setInventory([]);

              setSelectingCharacter(false);

            }}

            className="w-full rounded-xl border border-slate-700 px-4 py-3 text-sm text-slate-300 hover:border-amber-500 hover:text-amber-400"

          >

            Criar novo personagem

          </button>

        </div>

      </div>

    );

  }

  // TELA DE CRIAÇÃO DE PERSONAGEM (CASO NÃO EXISTA)

  if (!character) {

    return (

      <div className="w-screen h-screen bg-slate-950 flex items-center justify-center p-4 font-sans text-slate-100 overflow-y-auto">

        <form onSubmit={handleCreateCharacter} className="bg-slate-900 border border-slate-800 p-6 rounded-3xl max-w-lg w-full shadow-2xl space-y-4">

          <div className="text-center">

            <h1 className="text-lg font-extrabold text-amber-500 tracking-wider">PROJECT AETHERIA</h1>

            <p className="text-xs text-slate-400">Crie o seu herói para entrar na Torre Infinita</p>

          </div>

          <div>

            <label className="text-xs font-bold text-slate-300 block mb-1">Nome do Herói</label>

            <input

              type="text"

              value={charName}

              onChange={(e) => setCharName(e.target.value)}

              placeholder="Ex: Arthas"

              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"

              required

            />

          </div>

          <div>

            <label className="text-xs font-bold text-slate-300 block mb-1">Escolha a Raça</label>

            <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1 bg-slate-950 rounded-xl border border-slate-800">

              {RACES.map((race) => (

                <div

                  key={race.id}

                  onClick={() => setSelectedRace(race.id)}

                  className={`p-2 rounded-lg border text-center cursor-pointer transition-all flex flex-col justify-center ${

                    selectedRace === race.id

                      ? 'bg-amber-600/20 border-amber-500 text-amber-400'

                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'

                  }`}

                >

                  <span className="text-xs font-bold">{race.name}</span>

                  <span className="text-[9px] text-slate-400 mt-1 line-clamp-2">{race.desc}</span>

                </div>

              ))}

            </div>

          </div>

          {LOCAL_TEST_ONLY && RacePreviewCanvas && hasRaceRig(selectedRace) && RaceRigPreview && (
            <div className="rounded-xl border border-amber-700/40 bg-slate-950/70 p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-[10px] font-bold tracking-wider text-amber-400 uppercase">
                    🧪 Prévia 3D — RIG REAL {selectedRace.toUpperCase()}
                  </div>
                  <div className="text-[9px] text-slate-500">
                    modelo público/racas com clipes reais · normalizado {getRaceRig(selectedRace)?.height.toFixed(2)} m
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewAttackNonce((n) => n + 1)}
                  className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white font-bold text-[10px] rounded-lg uppercase tracking-wider transition-all"
                  title="Simula um golpe de combate no modelo 3D selecionado"
                >
                  ⚔️ Simular Combate
                </button>
              </div>
              <RaceRigPreview raceId={selectedRace} attackNonce={previewAttackNonce} />
            </div>
          )}

          {LOCAL_TEST_ONLY && RacePreviewCanvas && !hasRaceRig(selectedRace) && (
            <div className="rounded-xl border border-amber-700/40 bg-slate-950/70 p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-[10px] font-bold tracking-wider text-amber-400 uppercase">
                    🧪 Prévia 3D — LOCAL TEST ONLY
                  </div>
                  <div className="text-[9px] text-slate-500">
                    Modelos de C:\Users\Dell\Downloads\racas · normalizados 1,80 m · material mestre
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewAttackNonce((n) => n + 1)}
                  className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white font-bold text-[10px] rounded-lg uppercase tracking-wider transition-all"
                  title="Simula um golpe de combate no modelo 3D selecionado"
                >
                  ⚔️ Simular Combate
                </button>
              </div>
              <RacePreviewCanvas raceId={selectedRace} attackNonce={previewAttackNonce} />
            </div>
          )}

          <button

            type="submit"

            disabled={creating}

            className="w-full py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg transition-all uppercase tracking-wider"

          >

            {creating ? 'Criando Herói...' : 'Iniciar Aventura na Torre'}

          </button>

        </form>

      </div>

    );

  }

  const expPercentage = Math.min(100, Math.floor(((character.exp || 0) / (character.level * 100)) * 100));

  const bagItems = inventory.filter((i) => !i.is_in_stash && !i.is_equipped);

  const stashItems = inventory.filter((i) => i.is_in_stash);

  // [NOVO] Tema visual da torre baseado no andar

  const towerTheme = getTowerTheme(currentFloor);

  const themeBg = towerTheme.palette.background;

  const themePrimary = towerTheme.palette.primary;

  const themeSecondary = towerTheme.palette.secondary;

  const themeAccent = towerTheme.palette.accent;

  return (

    <div

      className="relative w-screen h-screen overflow-hidden flex flex-col justify-between select-none font-sans"

      style={{ background: `linear-gradient(180deg, ${themeBg} 0%, #020617 100%)` }}

    >

      {/* [NOVO] Efeito parallax vertical da torre */}

      <div

        className="absolute inset-0 opacity-20 pointer-events-none"

        style={{

          backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 80px, ${themePrimary}22 80px, ${themePrimary}22 82px)`,

          animation: 'parallaxUp 3s linear infinite',

        }}

      />

      <style>{`

        @keyframes parallaxUp {

          0% { transform: translateY(0); }

          100% { transform: translateY(-82px); }

        }

        @keyframes floorTransition {

          0% { transform: translateY(0) scale(1); opacity: 1; }

          50% { transform: translateY(-40px) scale(1.05); opacity: 0.8; }

          100% { transform: translateY(0) scale(1); opacity: 1; }

        }

        @keyframes pulseGlow {

          0%, 100% { box-shadow: 0 0 8px ${themePrimary}66; }

          50% { box-shadow: 0 0 20px ${themePrimary}aa; }

        }

      `}</style>

      {/* 1. BARRA SUPERIOR */}

<header className="w-full bg-slate-900/90 border-b border-slate-800 px-4 py-2 flex items-center justify-between gap-3 z-30 shadow-lg backdrop-blur-md">

  <div className="flex items-center space-x-2 shrink-0">

    <span className="font-extrabold text-xs tracking-widest" style={{ color: themePrimary }}>

      🏰 ANDAR {currentFloor} — {towerTheme.name.toUpperCase()}

    </span>

  </div>

  <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto py-1 scrollbar-none">

    {['Status', 'Bolsa', 'Depísito', 'Hunts (Torre)', 'Mercado RMP', 'Talentos'].map((menu) => (

      <button

        key={menu}

        onClick={() => {

          if (menu === 'Bolsa') setActiveModal('bolsa');

          if (menu === 'Depísito') setActiveModal('deposito');

          if (menu === 'Status') setActiveModal('status');

          if (menu === 'Talentos') setActiveModal('talento');

        }}

        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1 whitespace-nowrap shadow-sm border ${

          (menu === 'Bolsa' && activeModal === 'bolsa') ||

          (menu === 'Depísito' && activeModal === 'deposito') ||

          (menu === 'Status' && activeModal === 'status')

            ? 'bg-amber-600 text-white border-amber-400'

            : 'bg-slate-800/80 hover:bg-slate-700/80 border-slate-700/50 text-slate-200'

        }`}

      >

        <span>{menu}</span>

        {menu === 'Status' && character.stat_points > 0 && (

          <span className="ml-1 px-1.5 py-0.2 bg-emerald-500 text-black text-[9px] font-bold rounded-full">

            +{character.stat_points}

          </span>

        )}

      </button>

    ))}

  </div>

  <div className="flex items-center gap-2 shrink-0">

<button

  onClick={() => {

    setActiveModal(null);

    setCharacter(null);

    setInventory([]);

    setSelectingCharacter(true);

  }}

  className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition-all"

  title="Voltar à  seleção de personagens"

>

  Escolher personagem

</button>

    <button

      onClick={async () => {

        const { error } = await supabase.auth.signOut();

        if (error) {

          alert('Não foi possível sair da conta. Tente novamente.');

          return;

        }

        localStorage.removeItem('aetheria_char_id');

        router.push('/login');

      }}

      className="px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap bg-red-950/70 hover:bg-red-900 border border-red-800 text-red-200 transition-all"

      title="Sair da conta"

    >

      Sair

    </button>

  </div>

</header>

      {/* 2. HUD FIXO DO PERSONAGEM */}

      <div className="absolute top-14 left-4 z-20 flex items-center space-x-2 bg-slate-950/80 border border-slate-800 p-2 rounded-2xl shadow-2xl backdrop-blur-md">

        <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-amber-600 to-amber-400 border-2 border-amber-300 flex items-center justify-center text-2xl shadow-lg">

          👤

        </div>

        <div className="flex flex-col space-y-1 min-w-[180px]">

          <div className="flex justify-between items-center text-xs font-bold border-b border-slate-800/80 pb-0.5">

            <span className="text-slate-100">{character.name}</span>

            <span className="text-amber-400 font-mono">Lv. {character.level}</span>

            <span className="text-emerald-400 font-mono text-[10px]">CP {(combatPower / 1000).toFixed(1)} mil</span>

          </div>

          <div className="w-full bg-slate-900 h-3 rounded-full overflow-hidden border border-rose-950 relative">

            <div

              className="bg-gradient-to-r from-rose-700 to-rose-500 h-full transition-all duration-300"

              style={{ width: `${Math.max(0, Math.min(100, (playerHp / maxHp) * 100))}%` }}

            ></div>

            <span className="absolute inset-0 flex items-center justify-center text-[8px] font-mono font-bold text-white drop-shadow">

              {playerHp} / {maxHp}

            </span>

          </div>

          <div className="w-full bg-slate-900 h-3 rounded-full overflow-hidden border border-amber-950 relative">

            <div className="bg-gradient-to-r from-amber-600 to-amber-400 h-full w-full"></div>

            <span className="absolute inset-0 flex items-center justify-center text-[8px] font-mono font-bold text-black drop-shadow">

              SD {maxSd} / {maxSd}

            </span>

          </div>

          <div className="w-full bg-slate-900 h-3 rounded-full overflow-hidden border border-blue-950 relative">

            <div className="bg-gradient-to-r from-blue-700 to-blue-500 h-full w-3/4"></div>

            <span className="absolute inset-0 flex items-center justify-center text-[8px] font-mono font-bold text-white drop-shadow">

              {maxMp} / {maxMp}

            </span>

          </div>

        </div>

      </div>

      {/* [NOVO] SQUAD UI — 4 membros com HP, classe, posição e auto-cast */}

      <div className="absolute top-40 left-4 z-20 bg-slate-950/80 border border-slate-800 p-2 rounded-2xl shadow-2xl backdrop-blur-md space-y-1.5 min-w-[240px]">

        <div className="text-[9px] uppercase text-slate-400 font-bold tracking-wider mb-1">Squad</div>

        {partyMembers.map((m) => (

          <div key={m.id} className={`flex items-center gap-1.5 ${!m.isAlive ? 'opacity-40' : ''}`}>

            <span className="text-[10px] w-2 text-center">{m.isPlayer ? '⭐' : '🤖'}</span>

            <div className="flex-1 min-w-0">

              <div className="flex justify-between items-center text-[8px] mb-0.5">

                <span className="text-slate-200 truncate">{m.name}</span>

                <span className="text-slate-500">{m.isAlive ? `${m.hp}/${m.maxHp}` : '☠️ KO'}</span>

              </div>

              <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">

                <div

                  className={`h-full transition-all duration-300 ${

                    m.hp / m.maxHp > 0.5

                      ? 'bg-emerald-500'

                      : m.hp / m.maxHp > 0.25

                        ? 'bg-amber-500'

                        : 'bg-red-500'

                  }`}

                  style={{ width: `${Math.max(0, Math.min(100, (m.hp / m.maxHp) * 100))}%` }}

                />

              </div>

              <div className="flex justify-between items-center text-[7px] text-slate-500 mt-0.5"><span>MP</span><span>{m.mp ?? 0}/{m.maxMp ?? 0}</span></div><div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">

                <div

                  className="h-full bg-blue-500 transition-all duration-300"

                  style={{ width: `${Math.max(0, Math.min(100, ((m.mp ?? 0) / (m.maxMp ?? 1)) * 100))}%` }}

                />

              </div>

              <div className="flex items-center gap-1 mt-0.5">

                {/* Seletor de classe (apenas bots) */}

                {!m.isPlayer && (

                  <select

                    value={m.classId ?? ''}

                    onChange={(e) => {

                      const template = getBotTemplates().find((t) => t.classId === e.target.value);

                      if (!template) return;

                      const newBot = createBotMember(template, character?.level ?? 1, m.id, m.position);

                      setPartyMembers((prev) => prev.map((p) => (p.id === m.id ? newBot : p)));

                    }}

                    className="bg-slate-900 border border-slate-700 rounded text-[7px] px-0.5 py-0 text-slate-300"

                    title="Classe do bot"

                  >

                    {getBotTemplates().map((t) => (

                      <option key={t.classId} value={t.classId}>

                        {t.className}

                      </option>

                    ))}

                  </select>

                )}

                {/* Seletor de posição */}

                <select

                  value={m.position}

                  onChange={(e) => {

                    const newPos = e.target.value as 'front' | 'mid' | 'back';

                    setPartyMembers((prev) =>

                      prev.map((p) => (p.id === m.id ? { ...p, position: newPos } : p))

                    );

                  }}

                  className="bg-slate-900 border border-slate-700 rounded text-[7px] px-0.5 py-0 text-slate-300"

                  title="Posição na formação"

                >

                  <option value="front">⚔️ Front</option>

                  <option value="mid">🛡️ Mid</option>

                  <option value="back">✨ Back</option>

                </select>

                {/* Toggle de auto-cast */}

                <button

                  onClick={() => {

                    setPartyMembers((prev) =>

                      prev.map((p) => (p.id === m.id ? { ...p, autoCast: !p.autoCast } : p))

                    );

                  }}

                  className={`text-[7px] px-1 py-0 rounded border ${

                    m.autoCast

                      ? 'bg-emerald-900/50 border-emerald-700 text-emerald-300'

                      : 'bg-slate-800 border-slate-700 text-slate-500'

                  }`}

                  title={m.autoCast ? 'Auto-cast ATIVADO' : 'Auto-cast DESATIVADO'}

                >

                  {m.autoCast ? 'AUTO' : 'MANUAL'}

                </button>

              </div>

            </div>

          </div>

        ))}

        {/* Enrage timer do boss */}

        {bossFighting && bossEnrageTimer > 0 && (

          <div className="pt-1 border-t border-slate-800">

            <div className="flex justify-between items-center text-[8px] mb-0.5">

              <span className="text-red-400 font-bold">ENRAGE</span>

              <span className="text-red-300">{Math.ceil(60 - bossEnrageTimer)}s</span>

            </div>

            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">

              <div

                className="bg-gradient-to-r from-red-600 to-red-400 h-full transition-all duration-500"

                style={{ width: `${(bossEnrageTimer / 60) * 100}%` }}

              />

            </div>

          </div>

        )}

        {/* Skill ativa do boss */}

        {bossFighting && bossActiveSkill && (

          <div className="pt-1 border-t border-slate-800">

            <div className="text-[8px] text-amber-400 font-bold">🔥 {bossActiveSkill.skillName}</div>

            <div className="text-[7px] text-slate-500">{bossActiveSkill.description}</div>

          </div>

        )}

      </div>

      {/* 3. MAPA DA TORRE COM COMBATE */}

      <main className="absolute inset-0 z-0 flex flex-col items-center justify-center p-4 bg-gradient-to-b from-emerald-950/40 via-slate-950 to-black">

        <div className="absolute top-16 right-4 bg-slate-900/80 border border-slate-800 p-3 rounded-xl text-right z-10 backdrop-blur-sm w-64 space-y-2">

          <div>

            <span className="text-[10px] uppercase text-amber-500 font-bold block">{floorData.name}</span>

            <span className="text-[9px] text-slate-400 block">Bioma: {floorData.biome} • Nível mínimo: {floorData.unlockLevel}</span>

            <span className="text-xs text-slate-300">Ataque Base + Itens: <b className="text-amber-400">{35 + character.str * 2 + totalItemAttack}</b></span>

          </div>

          <div className="text-left">

            <label className="text-[9px] text-slate-400 block mb-1">Selecionar Andar</label>

            <select

              value={currentFloor}

              onChange={(e) => handleSelectFloor(Number(e.target.value))}

              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"

            >

              <option value={0}>Cidade (Andar 0)</option>

              {Array.from({ length: highestClearedFloor + 2 }, (_, i) => i + 1)

                .filter((f) => isFloorUnlocked(f, character.level ?? 1, highestClearedFloor))

                .map((f) => (

                  <option key={f} value={f}>

                    Andar {f} — {getFloor(f).biome}

                  </option>

                ))}

            </select>

          </div>

          <div className="text-left">

            <span className="text-[9px] text-slate-400 block mb-1">Monstros do andar:</span>

            <div className="flex flex-wrap gap-1">

              {floorData.monsters.map((m) => (

                <span key={m.id} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">

                  {m.name}

                </span>

              ))}

            </div>

          </div>

          <div className="flex gap-2">

            <button

              onClick={() => {

                setBossFighting(true);

                setBossHpCurrent(floorData.bossHp);

                setPartyMembers((prev) => prev.map((m) => ({ ...m, hp: m.maxHp, mp: m.maxMp, isAlive: true })));

                setPlayerHpCurrent(maxHp);

              }}

              className="flex-1 px-2 py-1 text-[10px] font-bold rounded-lg bg-rose-700 hover:bg-rose-600 text-white"

            >

              Convocar Chefe: {floorData.boss}

            </button>

          </div>

        </div>

        <div

          className="relative w-full max-w-xl h-72 border border-slate-800 rounded-3xl bg-slate-900/40 backdrop-blur-sm overflow-hidden flex items-center justify-around shadow-2xl"

          style={{

            perspective: '800px',

            transform: 'rotateX(8deg) rotateY(-2deg)',

            transformStyle: 'preserve-3d',

            boxShadow: `0 20px 60px ${themePrimary}22`,

          }}

        >

          <div className="flex flex-col items-center relative animate-pulse">

            <div className="flex flex-col items-center mb-1">

              <div className="w-12 h-1.5 bg-slate-900 rounded-full border border-red-500 overflow-hidden mb-0.5">

                <div className="bg-red-500 h-full w-full"></div>

              </div>

              <span className="text-[10px] font-bold text-amber-400 font-mono drop-shadow-md">

                {character.name} (Lv.{character.level})

              </span>

            </div>

            <div className="w-16 h-24 bg-gradient-to-b from-amber-600/30 to-amber-800/50 rounded-2xl border-2 border-amber-400/80 flex flex-col items-center justify-center shadow-lg relative">

              <span className="text-3xl">⚔️</span>

              <span className="text-[9px] text-amber-300 font-bold mt-1">{character.class_name}</span>

            </div>

            <div className="w-20 h-4 bg-black/40 rounded-full filter blur-sm mt-1"></div>

          </div>

          <div className="text-amber-500 font-bold text-xs tracking-widest animate-bounce">

            ⚡ TORRE DE AINCRAD ⚡

          </div>

          <div className="flex flex-col items-center">

            <div className="flex flex-col items-center mb-1">

              <div className="w-12 h-1.5 bg-slate-900 rounded-full border border-rose-600 overflow-hidden mb-0.5">

                <div 

                  className="bg-rose-600 h-full transition-all duration-300" 

                  style={{

  width: `${

    Math.max(

      0,

      Math.min(

        100,

        ((bossFighting ? bossHpCurrent : mobHpCurrent) /

          (bossFighting ? floorData.bossHp : floorData.maxHp)) *

          100

      )

    )

  }%`,

}}

                ></div>

              </div>

              <span className="text-[10px] font-bold text-rose-400 font-mono">

                {bossFighting ? floorData.boss : floorData.monster}

              </span>

            </div>

            <div className="w-16 h-24 bg-gradient-to-b from-rose-950/40 to-slate-900 rounded-2xl border-2 border-rose-800 flex flex-col items-center justify-center shadow-lg">

               <span className="text-3xl">{bossFighting ? '👹' : '👾'}</span>

            </div>

            <div className="w-20 h-4 bg-black/40 rounded-full filter blur-sm mt-1"></div>

          </div>

        </div>

        {currentFloor === 0 && (

          <div className="mt-4 bg-slate-900/80 border border-amber-500/40 rounded-xl p-4 max-w-3xl w-full backdrop-blur-sm shadow-xl space-y-3">

            <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider">Cidade de Aetheria (Andar 0)</h3>

            <section className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2">

              <span className="text-xs font-bold text-slate-200 block">NPC Alquimista — Poções</span>

              <div className="flex gap-2">

                <button onClick={() => handleBuyPotion('pocao_hp_menor', ITEM_DATABASE['pocao_hp_menor']?.sellValue ?? 10)} className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg">

                  Comprar Poção Menor ({ITEM_DATABASE['pocao_hp_menor']?.sellValue ?? 10} ouro)

                </button>

                <button onClick={() => handleBuyPotion('pocao_hp_media', 50)} className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg">

                  Comprar Poção Média (50 ouro)

                </button>

              </div>

            </section>

            <section className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2">

              <span className="text-xs font-bold text-slate-200 block">NPC Mercador — Vender Loot</span>

              <div className="flex gap-2 flex-wrap">

                <button onClick={() => handleSellAll('normal')} className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white text-[10px] font-bold rounded-lg">

                  Vender Comuns

                </button>

                <button onClick={() => handleSellAll('magic')} className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white text-[10px] font-bold rounded-lg">

                  Vender até Mágico

                </button>

                <button onClick={() => handleSellAll()} className="px-2 py-1 bg-rose-700 hover:bg-rose-600 text-white text-[10px] font-bold rounded-lg">

                  Vender Tudo (exceto equipado/stash)

                </button>

              </div>

              <div className="text-[10px] text-slate-400">

                Itens na bolsa: {inventory.filter((i) => !i.is_equipped && !i.is_in_stash).length}

              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-40 overflow-y-auto">

                {inventory.filter((i) => !i.is_equipped && !i.is_in_stash).length === 0 ? (

                  <span className="text-xs text-slate-500">Sem itens na bolsa.</span>

                ) : (

                  inventory.filter((i) => !i.is_equipped && !i.is_in_stash).map((item) => (

                    <button

                      key={item.id}

                      onClick={() => handleSellItem(item)}

                      className="text-left text-xs bg-slate-900 border border-slate-700 hover:border-amber-500 rounded-lg p-2"

                    >

                      Vender {item.item_name} ({Object.values(ITEM_DATABASE).find((t) => t.name === item.item_name)?.sellValue ?? 5})

                    </button>

                  ))

                )}

              </div>

            </section>

            <section className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2">

              <span className="text-xs font-bold text-slate-200 block">Forja — Refino</span>

              <div className="flex gap-2">

                <select

                  value={refineTarget?.id ?? ''}

                  onChange={(e) => setRefineTarget(inventory.find((i) => i.id === e.target.value) ?? null)}

                  className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"

                >

                  <option value="">Selecione um item para refinar</option>

                  {inventory.filter((i) => i.refine_level < 15).map((item) => (

                    <option key={item.id} value={item.id}>

                      {item.item_name} (+{item.refine_level})

                    </option>

                  ))}

                </select>

                <button onClick={handleRefineItem} className="px-3 py-1.5 bg-orange-700 hover:bg-orange-600 text-white text-xs font-bold rounded-lg">

                  Refinar

                </button>

              </div>

              <span className="text-[10px] text-slate-400 block">Consome uma Joia de Refino. Raça Anão tem vantagem.</span>

            </section>

          </div>

        )}

        <div className="mt-4 bg-slate-900/70 border border-slate-800/80 rounded-xl p-3 max-w-sm w-full backdrop-blur-sm shadow-xl space-y-1 font-mono text-xs">

          {combatLog.length === 0 ? (

            <div className="text-slate-500 text-center py-1">Iniciando caça na torre...</div>

          ) : (

            combatLog.map((log, i) => (

              <div key={i} className={log.includes('LEVEL UP') || log.includes('🎁') ? 'text-amber-400 font-bold' : 'text-slate-300'}>

                {log}

              </div>

            ))

          )}

        </div>

      </main>

      {/* MODAL: STATUS */}

      {activeModal === 'status' && (

        <div className="absolute inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">

          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 shadow-2xl relative">

            <div className="flex justify-between items-center mb-3 border-b border-slate-800 pb-2">

              <div>

                <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider">

                  📊 Atributos do Herói

                </h3>

                <span className="text-[10px] text-slate-400">Pontos Disponíveis: <b className="text-emerald-400">{character.stat_points}</b></span>

                <span className="text-[10px] text-slate-400 block">Talent Points: <b className="text-violet-400">{character.talent_points}</b></span>

                <span className="text-[10px] text-slate-400 block">Raça: <b className="text-amber-400">{character.race}</b> • Classe: <b className="text-amber-400">{character.class_name}</b></span>

                <span className="text-[10px] text-slate-400 block">

                  Skills: {getSkillsForClass(character.class_name).map((id) => getSkill(id)?.name).filter(Boolean).join(', ')}

                </span>

                {character.class_name.toLowerCase() === 'aprendiz' && character.level < 10 && (

                  <span className="text-[10px] text-slate-400 block mt-1">Nível 10 para escolher a classe inicial.</span>

                )}

                {['mago','guerreiro','arqueiro','clérigo','clerigo'].includes(character.class_name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')) && character.level < 40 && (

                  <span className="text-[10px] text-slate-400 block mt-1">Nível 40 para especializar a classe.</span>

                )}

                {character.level >= (character.class_name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === 'aprendiz' ? 10 : 40) && (

                  <div className="mt-2 flex gap-2 items-center">

                    <select

                      value={evolutionChoice}

                      onChange={(e) => setEvolutionChoice(e.target.value)}

                      className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"

                    >

                      <option value="">Evoluir classe...</option>

                      {(character.class_name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === 'aprendiz'

                        ? CLASSES.filter((c) => ['mago','guerreiro','arqueiro','clerigo'].includes(c.id)).map((c) => ({ id: c.id, name: c.name, role: c.description }))

                        : getEvolutions(character.class_name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))

                      ).map((evo) => (

                        <option key={evo.id} value={evo.id}>

                          {evo.name} ({evo.role})

                        </option>

                      ))}

                    </select>

                    <button

                      onClick={handleEvolve}

                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg"

                    >

                      Evoluir

                    </button>

                  </div>

                )}

              </div>

              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-white font-bold text-sm px-2 py-1 rounded-lg bg-slate-800">

                ✕

              </button>

            </div>

            <div className="space-y-2 mb-4">

              {[

                { key: 'str', name: 'FOR (Força)', desc: 'Aumenta Dano Físico' },

                { key: 'agi', name: 'AGI (Agilidade)', desc: 'Velocidade de Ataque' },

                { key: 'vit', name: 'VIT (Vitalidade)', desc: 'Aumenta HP Máximo' },

                { key: 'int_stat', name: 'INT (Inteligência)', desc: 'Aumenta Dano Mágico' },

                { key: 'dex', name: 'DES (Destreza)', desc: 'Precisão' },

                { key: 'luk', name: 'SOR (Sorte)', desc: 'Crítico' },

              ].map((stat) => {

                const k = stat.key as 'str' | 'agi' | 'vit' | 'int_stat' | 'dex' | 'luk';

                return (

                  <div key={k} className="flex items-center justify-between bg-slate-950/70 p-2 rounded-xl border border-slate-800">

                    <div>

                      <div className="text-xs font-bold text-slate-200">{stat.name}: <span className="text-amber-400 font-mono text-sm">{character[k]}</span></div>

                      <div className="text-[9px] text-slate-500">{stat.desc}</div>

                    </div>

                    <button

                      onClick={() => handleAddStat(k)}

                      disabled={character.stat_points <= 0}

                      className="px-3 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-30 text-white font-bold text-xs rounded-lg transition-all"

                    >

                      +1

                    </button>

                  </div>

                );

              })}

            </div>

          </div>

        </div>

      )}

      {/* MODAL: BOLSA */}

      {activeModal === 'bolsa' && (

        <div className="absolute inset-0 z-40 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">

          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-sm w-full p-4 shadow-2xl relative flex flex-col max-h-[90vh] overflow-y-auto">

            <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-3">

              <h3 className="text-sm font-bold text-amber-400 uppercase tracking-widest">

                INVENTÁRIO (BOLSA)

              </h3>

              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-white font-bold bg-slate-800 px-2 py-0.5 rounded-lg text-xs">

                ✕

              </button>

            </div>

            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80 mb-3">

              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block text-center mb-1.5">Equipado no Corpo</span>

              <div className="grid grid-cols-3 gap-1.5 text-center">

                {['helmet', 'armor', 'weapon', 'wings', 'boots', 'shield'].map((slotType) => {

                  const equippedInSlot = equippedItems.find((i) => i.item_type === slotType);

                  return (

                    <div 

                      key={slotType}

                      onClick={() => equippedInSlot && setSelectedItem(equippedInSlot)}

                      className={`border rounded-lg p-2 bg-slate-900/50 text-xs flex flex-col items-center justify-center cursor-pointer ${

                        equippedInSlot ? 'border-amber-500/80 bg-amber-950/20' : 'border-slate-800'

                      }`}

                    >

                      <span className="text-base">{equippedInSlot ? '⚔️' : '🛡️'}</span>

                      <span className="text-[9px] text-slate-300 font-medium truncate w-full">

                        {equippedInSlot ? equippedInSlot.item_name : slotType}

                      </span>

                    </div>

                  );

                })}

              </div>

            </div>

            <div className="grid grid-cols-4 gap-1.5 bg-slate-950 p-2 rounded-xl border border-slate-800 max-h-48 overflow-y-auto mb-3">

              {bagItems.length === 0 ? (

                <div className="col-span-4 text-center py-6 text-xs text-slate-500">

                  Nenhum item na bolsa.

                </div>

              ) : (

                bagItems.map((item) => (

                  <div

                    key={item.id}

                    onClick={() => setSelectedItem(item)}

                    className="h-14 bg-slate-900 border border-slate-800 hover:border-amber-500/80 rounded-lg p-1 flex flex-col items-center justify-between cursor-pointer transition-all group"

                  >

                    <span className="text-base group-hover:scale-110 transition-all">📦</span>

                    <span className="text-[8px] text-slate-300 font-medium truncate w-full text-center">

                      {item.item_name}

                    </span>

                  </div>

                ))

              )}

            </div>

            {selectedItem && (

              <div className="bg-slate-950 border border-amber-500/60 p-3 rounded-xl mb-3 shadow-2xl">

                <div className="flex justify-between items-center mb-2">

                  <span className="text-xs font-bold text-amber-400">{selectedItem.item_name}</span>

                  <button onClick={() => setSelectedItem(null)} className="text-slate-500 text-xs">✕</button>

                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">

                  <button

                    onClick={() => handleEquipItem(selectedItem)}

                    className="py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg"

                  >

                    {selectedItem.is_equipped ? 'Desequipar' : '🛡️ Equipar'}

                  </button>

                  <button

                    onClick={() => handleMoveToStash(selectedItem)}

                    className="py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg"

                  >

                    📦 Depósito

                  </button>

                </div>

              </div>

            )}

          </div>

        </div>

      )}

      {/* MODAL: DEPÓSITO */}

      {activeModal === 'deposito' && (

        <div className="absolute inset-0 z-40 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">

          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-sm w-full p-4 shadow-2xl relative">

            <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-3">

              <h3 className="text-sm font-bold text-amber-400 uppercase tracking-widest">

                📦 DEPÓSITO COMPARTILHADO

              </h3>

              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-white font-bold bg-slate-800 px-2 py-0.5 rounded-lg text-xs">

                ✕

              </button>

            </div>

            <div className="grid grid-cols-4 gap-1.5 bg-slate-950 p-2 rounded-xl border border-slate-800 max-h-60 overflow-y-auto mb-3">

              {stashItems.length === 0 ? (

                <div className="col-span-4 text-center py-8 text-xs text-slate-500">

                  Depísito vazio.

                </div>

              ) : (

                stashItems.map((item) => (

                  <div

                    key={item.id}

                    onClick={() => handleMoveToStash(item)}

                    className="h-14 bg-slate-900 border border-emerald-900/60 hover:border-emerald-500 rounded-lg p-1 flex flex-col items-center justify-between cursor-pointer transition-all"

                  >

                    <span className="text-base">📦</span>

                    <span className="text-[8px] text-emerald-300 font-medium truncate w-full text-center">

                      {item.item_name}

                    </span>

                  </div>

                ))

              )}

            </div>

          </div>

        </div>

      )}

      {/* MODAL: COMBATE — HUD de Skills para Auto-Cast */}

      {activeModal === 'combate' && (

        <div className="absolute inset-0 z-40 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">

          <div className="bg-slate-900 border border-blue-500/40 rounded-2xl max-w-lg w-full p-4 shadow-2xl relative max-h-[80vh] overflow-y-auto">

            <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-3">

              <h3 className="text-sm font-bold text-blue-400 uppercase tracking-widest">

                COMBATE - Habilidades

              </h3>

              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-white font-bold bg-slate-800 px-2 py-0.5 rounded-lg text-xs">

                X

              </button>

            </div>

            <p className="text-[10px] text-slate-400 mb-3">

              Classe: <b className="text-blue-300">{character.class_name}</b> - Clique em um slot para selecionar a skill de auto-cast.

            </p>

            <div className="grid grid-cols-4 gap-2 mb-4">

              {skillSlots.map((skillId, idx) => {

                const skill = skillId ? getSkill(skillId) : null;

                return (

                  <button

                    key={idx}

                    onClick={() => setSkillPickerSlot(idx)}

                    className={`h-16 bg-slate-950 border rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all ${

                      skill

                        ? 'border-blue-500/80 hover:border-blue-400'

                        : 'border-slate-700/80 hover:border-amber-500/50'

                    }`}

                  >

                    {skill ? (

                      <>

                        <span className="text-[9px] text-blue-300 font-mono truncate w-full text-center px-0.5">{skill.name.slice(0, 8)}</span>

                        <span className="text-[8px] text-blue-400 font-mono">{skill.mpCost}MP</span>

                      </>

                    ) : (

                      <span className="text-[9px] text-slate-500">Slot {idx + 1}</span>

                    )}

                  </button>

                );

              })}

            </div>

            <div className="border-t border-slate-800 pt-3">

              <h4 className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">Skills Disponiveis</h4>

              <div className="max-h-48 overflow-y-auto space-y-1.5">

                {unlockedSkills.filter((id) => id !== 'basic_attack').length === 0 ? (

                  <div className="text-xs text-slate-500 text-center py-4">Nenhuma skill desbloqueada.</div>

                ) : (

                  unlockedSkills.filter((id) => id !== 'basic_attack').map((skillId) => {

                    const skill = getSkill(skillId);

                    if (!skill) return null;

                    const isInSlot = skillSlots.includes(skillId);

                    return (

                      <div

                        key={skillId}

                        className={`px-3 py-2 rounded-lg border text-left ${

                          isInSlot

                            ? 'bg-blue-950/40 border-blue-500/40 text-blue-200'

                            : 'bg-slate-950 border-slate-800 text-slate-300'

                        }`}

                      >

                        <div className="flex justify-between items-center">

                          <span className="text-xs font-bold">{skill.name}</span>

                          <span className="text-[9px] text-slate-500">

                            {skill.type === 'passive' ? 'Passiva' : `${skill.mpCost} MP - CD ${(skill.cooldownMs / 1000).toFixed(0)}s`}

                          </span>

                        </div>

                        <div className="text-[10px] text-slate-500 mt-0.5">{skill.description}</div>

                        <div className="text-[9px] text-amber-400 mt-0.5">Efeito: {skill.effect}</div>

                        {skill.power > 0 && <div className="text-[9px] text-emerald-400">Dano: x{skill.power.toFixed(1)} ATK</div>}

                      </div>

                    );

                  })

                )}

              </div>

            </div>

          </div>

        </div>

      )}

      {/* MODAL: SKILL PICKER */}

      {skillPickerSlot !== null && (

        <div className="absolute inset-0 z-40 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">

          <div className="bg-slate-900 border border-blue-500/40 rounded-2xl max-w-md w-full p-4 shadow-2xl relative">

            <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-3">

              <h3 className="text-sm font-bold text-blue-400 uppercase tracking-widest">

                Escolher Skill — Slot {skillPickerSlot + 1}

              </h3>

              <button onClick={() => setSkillPickerSlot(null)} className="text-slate-400 hover:text-white font-bold bg-slate-800 px-2 py-0.5 rounded-lg text-xs">

                ✕

              </button>

            </div>

            <div className="max-h-80 overflow-y-auto space-y-1.5">

              {unlockedSkills.filter((id) => id !== 'basic_attack').length === 0 ? (

                <div className="text-xs text-slate-500 text-center py-8">Nenhuma skill desbloqueada.</div>

              ) : (

                unlockedSkills.filter((id) => id !== 'basic_attack').map((skillId) => {

                  const skill = getSkill(skillId);

                  if (!skill) return null;

                  const isInSlot = skillSlots.includes(skillId);

                  return (

                    <button

                      key={skillId}

                      onClick={() => assignSkillToSlot(skillId, skillPickerSlot)}

                      className={`w-full text-left px-3 py-2 rounded-lg border transition-all ${

                        isInSlot

                          ? 'bg-blue-950/40 border-blue-500/40 text-blue-200'

                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-blue-500/60'

                      }`}

                    >

                      <div className="flex justify-between items-center">

                        <span className="text-xs font-bold">{skill.name}</span>

                        <span className="text-[9px] text-slate-500">

                          {skill.type === 'passive' ? 'Passiva' : `${skill.mpCost} MP • CD ${(skill.cooldownMs / 1000).toFixed(0)}s`}

                        </span>

                      </div>

                      <div className="text-[10px] text-slate-500 mt-0.5">{skill.description}</div>

                      <div className="text-[9px] text-amber-400 mt-0.5">Efeito: {skill.effect}</div>

                      {skill.power > 0 && <div className="text-[9px] text-emerald-400">Dano: x{skill.power.toFixed(1)} ATK</div>}

                    </button>

                  );

                })

              )}

            </div>

            <div className="mt-3 pt-2 border-t border-slate-800">

              <button

                onClick={() => {

                  removeSkillFromSlot(skillPickerSlot);

                  setSkillPickerSlot(null);

                }}

                className="w-full py-1.5 text-xs font-bold text-slate-400 hover:text-red-400 rounded-lg"

              >

                Remover skill do slot

              </button>

            </div>

          </div>

        </div>

      )}

      {/* 4. HUD INFERIOR */}

      <footer className="w-full bg-slate-900/95 border-t border-slate-800 p-2 sm:p-3 z-30 shadow-2xl backdrop-blur-md flex flex-col items-center">

        <div className="w-full max-w-5xl h-2 bg-slate-800 rounded-full mb-2 overflow-hidden relative border border-slate-700/50">

          <div 

            className="h-full bg-gradient-to-r from-amber-600 via-amber-500 to-amber-300 transition-all duration-500 shadow-lg shadow-amber-500/50"

            style={{ width: `${expPercentage}%` }}

          ></div>

        </div>

        <div className="w-full max-w-5xl flex flex-col md:flex-row items-center justify-between gap-3">

          <div className="flex items-center space-x-2 bg-slate-950/60 p-1.5 rounded-xl border border-slate-800/80">

            <button 

              onClick={() => setAutoHunt(!autoHunt)}

              className={`px-4 py-2 rounded-lg text-xs font-bold tracking-wider transition-all shadow ${

                autoHunt 

                  ? 'bg-amber-600 text-white shadow-amber-900/30' 

                  : 'bg-slate-800 text-slate-400 hover:text-white'

              }`}

            >

              {autoHunt ? '⚔️ CAÇAR (AUTO)' : '✋ MANUAL'}

            </button>

            <div className="text-[10px] text-slate-400 px-2 leading-tight">

              <div>Andar: <span className="text-emerald-400 font-semibold">{currentFloor}</span></div>

              <div>Ouro: <span className="text-amber-400 font-semibold">{character.gold}</span></div>

            </div>

          </div>

          <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto py-1">

            {skillSlots.map((skillId, idx) => {

              const skill = skillId ? getSkill(skillId) : null;

              const ready = skillId ? isSkillReady(skillId) : true;

              const cdRemaining = skillId ? getSkillCooldownRemaining(skillId) : 0;

              const hasMp = skill ? (playerMpCurrent ?? maxMp) >= skill.mpCost : true;

              const isActive = skill && skill.type === 'passive';

              return (

                <div

                  key={idx}

                  onClick={() => handleUseSkill(idx)}

                  className={`w-10 h-10 sm:w-11 sm:h-11 bg-slate-950 border rounded-lg flex flex-col items-center justify-center relative shadow-inner cursor-pointer group transition-all ${

                    skill

                      ? ready && hasMp

                        ? 'border-blue-500/80 hover:border-blue-400'

                        : 'border-slate-700/80 opacity-60'

                      : 'border-slate-700/80 hover:border-amber-500/50'

                  }`}

                  title={skill ? `${skill.name} — MP ${skill.mpCost}, CD ${skill.cooldownMs / 1000}s` : `Slot ${idx + 1} — clique para atribuir`}

                >

                  {skill ? (

                    <>

                      <span className="text-[8px] text-blue-300 font-mono truncate w-full text-center px-0.5">{skill.name.slice(0, 6)}</span>

                      <div className="absolute bottom-0.5 right-1 text-[8px] text-blue-400 font-mono">{skill.mpCost}MP</div>

                      {!ready && (

                        <div className="absolute inset-0 bg-slate-950/70 rounded-lg flex items-center justify-center">

                          <span className="text-[9px] text-amber-400 font-bold">{Math.ceil(cdRemaining / 1000)}s</span>

                        </div>

                      )}

                      {isActive && (

                        <div className="absolute top-0.5 left-0.5 w-1.5 h-1.5 bg-emerald-400 rounded-full" title="Passiva ativa" />

                      )}

                    </>

                  ) : (

                    <span className="text-[10px] text-slate-500 font-mono group-hover:text-amber-400">+ Skill</span>

                  )}

                </div>

              );

            })}

          </div>

          <div className="hidden xl:flex flex-col text-[11px] font-mono text-slate-300 bg-slate-950/60 px-3 py-1.5 rounded-xl border border-slate-800/80 min-w-[200px]">

            <div className="flex justify-between">

              <span className="text-slate-400">Bolsa (Lim. 2000):</span>

              <span className="text-amber-400 font-bold">{bagItems.length} Itens</span>

            </div>

            <div className="flex justify-between">

              <span className="text-slate-400">Depísito:</span>

              <span className="text-emerald-400 font-bold">{stashItems.length} Itens</span>

            </div>

          </div>

        </div>

      </footer>

      {/* [NOVO] Bottom Navigation fixa — estilo Ulala */}

      <nav className="absolute bottom-0 left-0 right-0 z-40 bg-slate-900/95 border-t border-slate-800 backdrop-blur-md flex items-center justify-around px-2 py-2">

        {[

          { icon: '🏠', label: 'Início', action: () => {} },

          { icon: '⚔️', label: 'Combate', action: () => setActiveModal('combate') },

          { icon: '🎒', label: 'Mochila', action: () => setActiveModal('bolsa') },

          { icon: '📦', label: 'Depósito', action: () => setActiveModal('deposito') },

        ].map((tab, i) => (

          <button

            key={i}

            onClick={tab.action}

            className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg hover:bg-slate-800/50 transition-all"

            style={{ color: themePrimary }}

          >

            <span className="text-lg">{tab.icon}</span>

            <span className="text-[8px] font-bold">{tab.label}</span>

          </button>

        ))}

      </nav>

    </div>

  );

}
