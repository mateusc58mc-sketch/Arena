'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useProgress, useGLTF } from '@react-three/drei';
import { getUserWithTimeout, supabase } from '@/lib/supabase';
import { DEMON_MODEL } from '@/lib/arenaData';
import { ITEM_DATABASE } from '@/lib/gameDatabase';
import { getRace } from '@/lib/content/races';
import { getSkill, type SkillDefinition } from '@/lib/content/skills';
import type { Character, InventoryItem, RaceId } from '@/lib/types/core';
import {
  buildArenaParty,
  buildBotHero,
  buildFloorWaves,
  createDemoParty,
  createSyntheticCharacter,
  enemyHpMap,
  fieldPosition,
  heroHpMap,
  PARTY_CONFIG_KEYS,
  type BoltData,
  type CoopMate,
  type DamageLabel,
  type EnemyDef,
  type HeroDef,
  type HeroId,
  type MemberMeter,
  type PartyConfig,
  type Position,
  type WaveDef,
} from '@/lib/arenaData';
import { getBotTemplates } from '@/lib/aiSquad';
import { rollDamage, applyRaceModifiers } from '@/lib/systems/stats';
import { getClass } from '@/lib/content/classes';
import { applyExperience } from '@/lib/gameEngine';
import { getFloor } from '@/lib/content/monsters';
import { getTowerTheme } from '@/lib/floorScaling';
import { getBossSkills, shouldTriggerSkill, calculateBossSkillDamage, type BossSkill } from '@/lib/bossSkills';
import { rollDrops } from '@/lib/dropTable';
import Hud, { type LiveMate } from './Hud';
import ArenaMenu, { type MenuTab } from './ArenaMenu';
import ArenaErrorBoundary from './ArenaErrorBoundary';
import ErrorBoundary from '@/components/ErrorBoundary';
import { getRaceHeroAsset } from '@/lib/racesAssets';
import PartyPanel from './PartyPanel';
import styles from './Arena.module.css';

const ArenaExperience = dynamic(() => import('./ArenaExperience'), {
  ssr: false,
  loading: () => null,
});

/**
 * Prévia 3D das raças — procedural (sem assets externos), funciona também
 * no deploy. Os modelos reais continuam exclusivos de dev/local.
 */
const RacePreview3D = dynamic(() => import('@/components/RacePreviewSwitch'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: '100%',
        height: 380,
        borderRadius: 12,
        border: '1px dashed #334155',
        background: '#0b0f1a',
        display: 'grid',
        placeItems: 'center',
        color: '#64748b',
        fontSize: 11,
      }}
    >
      Carregando prévia 3D…
    </div>
  ),
});

const TEMPLATE_BY_NAME = new Map(
  Object.values(ITEM_DATABASE).map((template) => [template.name, template]),
);

const SKILL_SLOTS = 4;
const SKILL_SLOTS_KIND = 'arena_skill_slots';

// Resultado da liquidação offline (RPC settle_offline no Supabase).
type OfflineSettlement = {
  seconds: number;
  xp: number;
  gold: number;
  levelBefore: number;
  levelAfter: number;
};

// Valores ABSOLUTOS pós-liquidação vindos do banco. null = nada a liquidar.
type SettleResult = {
  seconds: number;
  xp: number;
  gold: number;
  levelBefore: number;
  levelAfter: number;
  expAfter: number;
  goldAfter: number;
  statPointsAfter: number;
  talentPointsAfter: number;
} | null;

// Dedupe de liquidações simultâneas (o dev roda o boot 2x via StrictMode):
// ambas as chamadas recebem o MESMO resultado absolutamente idempotente.
const settleInFlight = new Map<string, Promise<SettleResult>>();

// ============================================================
// Co-op (host model) — payload do RPC party_roster e mensagens de broadcast
// ============================================================
type RosterPayload = {
  party: { id: string; invite_code: string; leader_id: string; max_floor: number } | null;
  members: Array<{
    character_id: string;
    name?: string;
    class_name?: string;
    race?: string;
    level?: number;
    tower_floor?: number;
    str?: number;
    agi?: number;
    vit?: number;
    int_stat?: number;
    dex?: number;
    luk?: number;
  }> | null;
};

type CoopVitalsPayload = {
  /** characterId do emissor. */
  i: string;
  /** Nome e nível do personagem. */
  n: string;
  l: number;
  /** HP/MP do herói principal (knight) do emissor. */
  h: number;
  /** HP máximo do herói principal. */
  hm: number;
  /** MP atual do herói principal. */
  m: number;
  /** MP máximo do herói principal. */
  mm: number;
  /** Andar atual do emissor — alinhamento de andar compartilhado. */
  f: number;
};

function mapRosterMembers(raw: NonNullable<RosterPayload['members']>): CoopMate[] {
  return raw.map((row) => ({
    characterId: String(row.character_id),
    name: row.name ?? '?',
    className: row.class_name ?? 'aprendiz',
    race: row.race ?? 'humano',
    level: row.level ?? 1,
    towerFloor: row.tower_floor ?? 1,
    str: row.str ?? 10,
    agi: row.agi ?? 10,
    vit: row.vit ?? 10,
    intStat: row.int_stat ?? 10,
    dex: row.dex ?? 10,
    luk: row.luk ?? 10,
  }));
}

async function reconcileSettlementOnce(characterId: string): Promise<SettleResult> {
  const existing = settleInFlight.get(characterId);
  if (existing) return existing;

  const promise = (async (): Promise<SettleResult> => {
    try {
      const { data, error } = await supabase.rpc('settle_offline', {
        p_character_id: characterId,
      });
      if (error) {
        console.error('[arena] settle_offline falhou:', error.message);
        return null;
      }
      const row = (data ?? null) as {
        settled?: boolean;
        seconds?: number;
        xp?: number;
        gold?: number;
        level_before?: number;
        level_after?: number;
        exp_after?: number;
        gold_after?: number;
        stat_points_after?: number;
        talent_points_after?: number;
      } | null;
      if (!row?.settled) return null;
      return {
        seconds: row.seconds ?? 0,
        xp: row.xp ?? 0,
        gold: row.gold ?? 0,
        levelBefore: row.level_before ?? 1,
        levelAfter: row.level_after ?? 1,
        expAfter: row.exp_after ?? 0,
        goldAfter: row.gold_after ?? 0,
        statPointsAfter: row.stat_points_after ?? 0,
        talentPointsAfter: row.talent_points_after ?? 0,
      };
    } catch (exception) {
      console.error('[arena] settle_offline exceção:', exception);
      return null;
    } finally {
      settleInFlight.delete(characterId);
    }
  })();

  settleInFlight.set(characterId, promise);
  // Rede travada/HMR: não deixa uma chamada pendente "mortal" bloquear
  // todas as liquidações futuras desta sessão.
  setTimeout(() => {
    if (settleInFlight.get(characterId) === promise) settleInFlight.delete(characterId);
  }, 20000);
  return promise;
}

function formatOfflineDuration(seconds: number): string {
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h${minutes > 0 ? ` ${minutes}min` : ''}`;
  }
  return `${Math.max(1, Math.floor(seconds / 60))}min`;
}

const skillSlotsKey = (characterId: string) => `${SKILL_SLOTS_KIND}:${characterId}`;

function readStoredSkills(characterId: string): Record<string, string[]> | null {
  if (typeof window === 'undefined' || !characterId || characterId === 'demo') return null;
  try {
    return JSON.parse(window.localStorage.getItem(`aetheria_arena_skills_${characterId}`) ?? 'null');
  } catch {
    return null;
  }
}

/** Limpa os caches locais da sessão (usado no logout). */
function clearLocalSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem('aetheria_char_id');
  for (const key of Object.keys(window.localStorage)) {
    if (key.startsWith('aetheria_arena_') || key.startsWith('aetheria_floor_')) {
      window.localStorage.removeItem(key);
    }
  }
}

/** Skills ativas do personagem (as passivas ficam sempre ativas e não ocupam slot). */
function defaultSkillSlots(heroes: HeroDef[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};

  for (const hero of heroes) {
    map[hero.id] = (hero.skills ?? [])
      .filter((id) => id !== 'basic_attack')
      .filter((id) => getSkill(id)?.type === 'active')
      .slice(0, SKILL_SLOTS);
  }

  return map;
}

const labelId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const STORAGE_PREFIX = 'aetheria_arena_';

type Mode = 'farm' | 'advance';

const FARM_WAVES = 9;

function readStored(characterId: string) {
  if (typeof window === 'undefined' || !characterId || characterId === 'demo') return null;
  try {
    return JSON.parse(window.localStorage.getItem(`${STORAGE_PREFIX}${characterId}`) ?? 'null');
  } catch {
    return null;
  }
}

function LoadingVeil({
  visible,
  fatal,
  onRetry,
}: {
  visible: boolean;
  fatal: string | null;
  onRetry: () => void;
}) {
  const { progress, active, total, loaded } = useProgress();
  const [booted, setBooted] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (progress < 100 || active) return;
    const timer = window.setTimeout(() => setBooted(true), 500);
    return () => window.clearTimeout(timer);
  }, [progress, active]);

  // Se os modelos não carregarem, mostra o diagnóstico em vez de travar.
  useEffect(() => {
    if (booted || fatal) return;
    const timer = window.setTimeout(() => setSlow(true), 20000);
    return () => window.clearTimeout(timer);
  }, [booted, fatal, progress]);

  if (!fatal && (!visible || booted)) return null;

  return (
    <div className={styles.loading}>
      <div className={styles.loadingInner}>
        <div className={styles.loadingMark}>A</div>
        <div className={styles.loadingTitle}>AINCRAD</div>
        <div className={styles.loadingSub}>
          {fatal ? 'Falha ao iniciar a arena' : 'Carregando sua party...'}
        </div>
        {!fatal && (
          <>
            <div className={styles.loadingBar}>
              <i style={{ width: `${Math.max(5, progress)}%` }} />
            </div>
            <div className={styles.loadingPct}>
              {Math.round(progress)}% {total > 0 ? `(${loaded}/${total} modelos)` : ''}
            </div>
          </>
        )}

        {fatal && (
          <div className={styles.loadingFatal}>
            <p>{fatal}</p>
            <button type="button" onClick={onRetry}>
              RECARREGAR
            </button>
          </div>
        )}

        {!fatal && slow && (
          <div className={styles.loadingFatal}>
            <p>
              Os modelos 3D ainda não baixaram. Verifique sua conexão com o Wi-Fi (o jogo baixa
              ~15 MB na primeira visita) e toque em RECARREGAR.
            </p>
            <button type="button" onClick={onRetry}>
              RECARREGAR
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ArenaClient() {
  const router = useRouter();
  // Registro global de erros para diagnóstico (cliente).
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      console.error('[arena-global-error]', event.message, event.filename, event.lineno, event.colno, event.error);
      try {
        window.localStorage.setItem('aetheria_last_error', JSON.stringify({
          type: 'error',
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack,
          url: window.location.href,
          ts: new Date().toISOString(),
        }));
      } catch {}
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      console.error('[arena-unhandled-rejection]', event.reason);
      try {
        window.localStorage.setItem('aetheria_last_error', JSON.stringify({
          type: 'unhandledrejection',
          message: String(event.reason?.message ?? event.reason),
          stack: event.reason?.stack,
          url: window.location.href,
          ts: new Date().toISOString(),
        }));
      } catch {}
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  const [characterId, setCharacterId] = useState('demo');
  const [heroes, setHeroes] = useState<HeroDef[]>(() => createDemoParty());
  const [floor, setFloor] = useState(1);
  const [waves, setWaves] = useState<WaveDef[]>(() => buildFloorWaves(1));
  const [waveIndex, setWaveIndex] = useState(0);
  const [waveKey, setWaveKey] = useState(0);
  const [enemyHp, setEnemyHp] = useState<Record<string, number>>(() => enemyHpMap(buildFloorWaves(1)[0]));
  const [heroHp, setHeroHp] = useState<Record<string, number>>(() => heroHpMap(createDemoParty()));
  const [alive, setAlive] = useState<Record<string, boolean>>({});
  const [heroSd, setHeroSd] = useState<Record<string, number>>({});
  const [heroMp, setHeroMp] = useState<Record<string, number>>({});
  const [positions, setPositions] = useState<Record<string, 'front' | 'mid' | 'back'>>({});
  const [autoCastMap, setAutoCastMap] = useState<Record<string, boolean>>({});
  const [botClasses, setBotClasses] = useState<Record<string, string>>({});
  const [hitNonce, setHitNonce] = useState<Record<string, number>>({});
  const [labels, setLabels] = useState<DamageLabel[]>([]);
  const [bolts, setBolts] = useState<BoltData[]>([]);
  const [auto, setAuto] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [mode, setMode] = useState<Mode>('farm');
  const [preview, setPreview] = useState(false);
  const [cheerNonce, setCheerNonce] = useState(0);
  const [expGained, setExpGained] = useState(0);
  const [goldGained, setGoldGained] = useState(0);
  const [creditedExp, setCreditedExp] = useState(0);
  const [creditedGold, setCreditedGold] = useState(0);
  const [highestCleared, setHighestCleared] = useState(1);
  const [dataReady, setDataReady] = useState(false);
  const [meter, setMeter] = useState<Record<string, MemberMeter>>({});
  const [elapsedMs, setElapsedMs] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const [bossDefeated, setBossDefeated] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [defeatCountdown, setDefeatCountdown] = useState<number | null>(null);
  const [character, setCharacter] = useState<Character | null>(null);
  // Ganho offline (Fase P2): liquidação feita no servidor ao abrir a arena.
  const [offlineSettlement, setOfflineSettlement] = useState<OfflineSettlement | null>(null);
  // Painel de party/squad multiplayer.
  const [partyOpen, setPartyOpen] = useState(false);
  // Party ao vivo: id da party (co-op) e integrantes reais sincronizados
  // por vitals via broadcast (presence nunca exibiu os mates no HUD).
  const [livePartyId, setLivePartyId] = useState<string | null>(null);
  const [liveMates, setLiveMates] = useState<LiveMate[]>([]);
  // ============================================================
  // Co-op v2 — andar compartilhado + combate individual
  //   Cada tela simula o PRÓPRIO combate na velocidade local; o que é
  //   compartilhado é o ANDAR: o membro que conquistar o andar mais alto
  //   anuncia e os demais pulam para cima. Quem minimizar/fechar não
  //   congela ninguém — ao voltar, alinha no andar do grupo.
  // ============================================================
  const [coopRole, setCoopRole] = useState<'none' | 'peer'>('none');
  const coopRoleRef = useRef('none' as 'none' | 'peer');
  const coopRosterRef = useRef<{
    leaderId: string | null;
    maxFloor: number;
    members: CoopMate[];
  } | null>(null);
  const coopChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const dataReadyRef = useRef(false);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuTab, setMenuTab] = useState<MenuTab>('status');
  const [skillSlots, setSkillSlots] = useState<Record<string, string[]>>({});
  const [availableCharacters, setAvailableCharacters] = useState<Character[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showSelect, setShowSelect] = useState(false);
  const [selectBusy, setSelectBusy] = useState<string | null>(null);
  const [createName, setCreateName] = useState('');
  const [createRace, setCreateRace] = useState('humano');
  const [creating, setCreating] = useState(false);
  const [pickingCharacter, setPickingCharacter] = useState(false);

  const wavesRef = useRef(waves);
  const waveIndexRef = useRef(waveIndex);
  const floorRef = useRef(floor);
  const expGainedRef = useRef(expGained);
  const goldGainedRef = useRef(goldGained);
  const lastCreditedExpRef = useRef(0);
  const lastCreditedGoldRef = useRef(0);
  const pityState = useRef<Record<string, number>>({});
  const heroesRef = useRef(heroes);
  const enemyHpRef = useRef(enemyHp);
  const heroHpRef = useRef(heroHp);
  const aliveRef = useRef(alive);
  const heroSdRef = useRef(heroSd);
  const heroMpRef = useRef(heroMp);
  const positionsRef = useRef(positions);
  const autoCastMapRef = useRef(autoCastMap);
  const modeRef = useRef(mode);
  const highestClearedRef = useRef(highestCleared);
  const timers = useRef<number[]>([]);
  const partyConfigTimer = useRef<number | null>(null);
  const pendingPartyConfig = useRef<PartyConfig | null>(null);
  const defeatCountdownRef = useRef<number | null>(null);
  const skillSlotsRef = useRef<Record<string, string[]>>({});
  const skillCooldowns = useRef<Record<string, number>>({});
  const characterRef = useRef<Character | null>(null);
  const inventoryRef = useRef<InventoryItem[]>([]);
  const resolvedWave = useRef<number | null>(null);
  const bossAoeAt = useRef(0);
  // P1 item 6: telegrafia de boss skill (aviso visual antes do efeito)
  const [bossTelegraph, setBossTelegraph] = useState<{
    skillName: string;
    progress: number; // 0..1
  } | null>(null);
  const bossSkillUsedAt = useRef<Record<string, number>>({});
  const bossBuffUntil = useRef(0);
  const bossBuffMult = useRef(1);
  const bossDefeatedRef = useRef(false);

  wavesRef.current = waves;
  waveIndexRef.current = waveIndex;
  floorRef.current = floor;
  expGainedRef.current = expGained;
  goldGainedRef.current = goldGained;
  heroesRef.current = heroes;
  enemyHpRef.current = enemyHp;
  heroHpRef.current = heroHp;
  aliveRef.current = alive;
  heroSdRef.current = heroSd;
  heroMpRef.current = heroMp;
  positionsRef.current = positions;
  autoCastMapRef.current = autoCastMap;
  modeRef.current = mode;
  highestClearedRef.current = highestCleared;
  characterRef.current = character;
  inventoryRef.current = inventory;
  coopRoleRef.current = coopRole;
  dataReadyRef.current = dataReady;

  const wave = waves[waveIndex];

  function initVitals(party: HeroDef[]) {
    setHeroSd(Object.fromEntries(party.map((hero) => [hero.id, hero.sd])));
    setHeroMp(Object.fromEntries(party.map((hero) => [hero.id, hero.mp])));
    setPositions(Object.fromEntries(party.map((hero) => [hero.id, hero.positionRole])));
    setAutoCastMap(Object.fromEntries(party.map((hero) => [hero.id, hero.autoCast])));
    setBotClasses(
      Object.fromEntries(party.filter((hero) => hero.classId).map((hero) => [hero.id, hero.classId as string])),
    );
    setMeter(Object.fromEntries(party.map((hero) => [hero.id, blankMeter()])));
    setElapsedMs(0);
  }

  function blankMeter(): MemberMeter {
    return {
      damage: 0,
      taken: 0,
      takenHits: 0,
      healed: 0,
      healHits: 0,
      autoHits: 0,
      autoCrits: 0,
      autoDamage: 0,
      skills: {},
    };
  }

  const pushNotice = useCallback((text: string) => {
    // Timer próprio do notice: startFloor limpa timers.current em massa
    // (timers de combate) e isso câncelava o timeout de sumir o aviso.
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    setNotice(text);
    noticeTimer.current = window.setTimeout(() => {
      noticeTimer.current = null;
      setNotice(null);
    }, 3000);
  }, []);

  // ============================================================
  // Co-op v2 — núcleo (papel simétrico 'peer')
  //   Cada tela simula o próprio combate; compartilha-se o ANDAR (o
  //   membro que conquistar o andar mais alto anuncia e os demais
  //   pulam para cima) e os VITAIS (HP/MP a cada 2s p/ o HUD "AO VIVO").
  // ============================================================
  const coopSend = useCallback((event: string, payload: unknown) => {
    try {
      void coopChannelRef.current?.send({ type: 'broadcast', event, payload } as never);
    } catch {
      /* canal nem sempre presente — silencioso */
    }
  }, []);

  /** Sai do co-op (party encerrada/saída): remove o canal e volta ao solo.
   * O squad nunca foi substituído (combate individual), nada a restaurar. */
  const endCoop = useCallback((reason?: string) => {
    if (coopChannelRef.current) {
      void supabase.removeChannel(coopChannelRef.current);
      coopChannelRef.current = null;
    }
    coopRosterRef.current = null;
    setCoopRole('none');
    if (reason) pushNotice(reason);
  }, [pushNotice]);

  /** Roster carregado (boot ou painel fechando): liga o papel 'peer'. */
  const handleRosterLoaded = useCallback(
    (
      party: { id: string; leader_id: string; max_floor: number },
      members: CoopMate[],
      _selfId?: string,
    ) => {
      coopRosterRef.current = {
        leaderId: party.leader_id,
        maxFloor: Math.max(1, party.max_floor ?? 1),
        members,
      };
      setLivePartyId(party.id);
      setCoopRole('peer');
      if (members.length > 1) {
        pushNotice(
          `👥 Co-op: ${members.length} membros — cada um luta na própria tela, andar compartilhado.`,
        );
      }
    },
    [pushNotice],
  );

  /**
   * Carrega o personagem escolhido (inventário, skills, party, ganho offline).
   * Reutilizado pelo boot automático e pela tela de seleção de personagem.
   */
  const applyCharacterData = useCallback(
    async (chosen: Character, params: URLSearchParams, isCancelled: () => boolean) => {
      const { data: inv } = await supabase.from('inventory').select('*').eq('character_id', chosen.id);
      const inventory = (inv ?? []) as InventoryItem[];

      // Um item por slot: devolve à bolsa o que estiver duplicado no mesmo tipo.
      const seenTypes = new Set<string>();
      const duplicates = inventory.filter((entry) => {
        if (!entry.is_equipped) return false;
        if (seenTypes.has(entry.item_type)) return true;
        seenTypes.add(entry.item_type);
        return false;
      });

      let finalInventory = inventory;

      if (duplicates.length > 0) {
        await Promise.all(
          duplicates.map((entry) =>
            supabase
              .from('inventory')
              .update({ is_equipped: false, is_in_stash: false })
              .eq('id', entry.id),
          ),
        );
        finalInventory = inventory.map((entry) =>
          duplicates.some((duplicate) => duplicate.id === entry.id)
            ? { ...entry, is_equipped: false, is_in_stash: false }
            : entry,
        );
        console.log(
          '[arena] slots normalizados:',
          duplicates.length,
          'item(ns) duplicado(s) devolvido(s) à bolsa',
        );
      }

      const stored = readStored(chosen.id);
      const requestedFloor = Number(params.get('floor') ?? params.get('wave'));
      const baseFloor = Math.max(1, chosen.tower_floor ?? 1, stored?.highestClearedFloor ?? 1);
      const startFloor =
        requestedFloor >= 1 && requestedFloor <= 100 ? requestedFloor : ((stored?.floor ?? baseFloor) as number);

      // Pré-carrega os monstros do pack (bandas 0–1) para não piscar ao trocar de wave
      if (Math.floor((startFloor - 1) / 10) < 2) {
        useGLTF.preload('/models/dungeon/Imp.glb');
        useGLTF.preload('/models/dungeon/Puglin.glb');
        useGLTF.preload(DEMON_MODEL);
      }

      if (isCancelled()) return;

      const party = buildArenaParty(
        chosen,
        finalInventory,
        chosen.party_config as PartyConfig | undefined,
      );
      const nextWaves = buildFloorWaves(startFloor);

      setCharacterId(chosen.id);
      setHeroes(party);
      initVitals(party);
      setCharacter(chosen);
      setCreditedExp(0);
      setCreditedGold(0);
      setInventory(finalInventory);

      const cachedSlots = readStoredSkills(chosen.id);

      const { data: slotsRow } = await supabase
        .from('operation_keys')
        .select('result_json')
        .eq('idempotency_key', skillSlotsKey(chosen.id))
        .maybeSingle();

      const dbSlots =
        (slotsRow?.result_json as { slots?: Record<string, string[]> } | null)?.slots ?? null;

      const slots = dbSlots ?? cachedSlots ?? defaultSkillSlots(party);
      setSkillSlots(slots);
      skillSlotsRef.current = slots;

      // Se o banco ainda não tem os slots (ex.: salvados só no navegador), grava agora.
      if (!dbSlots && cachedSlots) {
        void supabase
          .from('operation_keys')
          .upsert(
            {
              idempotency_key: skillSlotsKey(chosen.id),
              character_id: chosen.id,
              kind: SKILL_SLOTS_KIND,
              result_json: { slots },
            },
            { onConflict: 'idempotency_key' },
          );
      }
      // Party (co-op): roster via RPC — líder/membros/max_floor. O andar
      // inicial é travado no limite da party (membror mais fraco = MIN).
      let coopParty: { id: string; leaderId: string; maxFloor: number } | null = null;
      if (chosen.id && chosen.id !== 'demo') {
        const { data: rosterData } = await supabase
          .rpc('party_roster', { p_character_id: chosen.id });
        const rosterPayload = (rosterData ?? null) as RosterPayload | null;
        if (rosterPayload?.party) {
          coopParty = {
            id: rosterPayload.party.id,
            leaderId: rosterPayload.party.leader_id,
            maxFloor: Math.max(1, rosterPayload.party.max_floor ?? 1),
          };
          if (!isCancelled()) {
            coopRosterRef.current = {
              leaderId: rosterPayload.party.leader_id,
              maxFloor: coopParty.maxFloor,
              members: mapRosterMembers(rosterPayload.members ?? []),
            };
          }
        }
      }

      // Ganho offline (Fase P2): liquida no servidor o tempo ausente com o
      // relógio do banco (cap 12h / 24h premium). Atômico, idempotente e
      // deduplicado (reconcileSettlementOnce) — o XP/ouro já foi aplicado
      // no banco; aqui aplica o estado absoluto e mostra o comprovante.
      if (chosen.id && chosen.id !== 'demo') {
        const result = await reconcileSettlementOnce(chosen.id);
        if (!isCancelled() && result) {
          applySettlementRef.current?.(result);
        }
      }

      setHeroHp(heroHpMap(party));
      setAlive(Object.fromEntries(party.map((hero) => [hero.id, true])));
      // Limite de andar da party (MIN entre membros reais trava o boot).
      const cappedFloor = coopParty
        ? Math.min(startFloor, coopParty.maxFloor)
        : Math.max(1, startFloor);
      const cappedWaves = coopParty ? buildFloorWaves(cappedFloor) : nextWaves;
      setFloor(cappedFloor);
      setWaves(cappedWaves);
      setWaveIndex(0);
      setEnemyHp(enemyHpMap(cappedWaves[0]));
      setWaveKey((current) => current + 1);
      setHighestCleared(Math.max(baseFloor, stored?.highestClearedFloor ?? 1));
      setMode(stored?.mode === 'advance' ? 'advance' : 'farm');
      // Liga o co-op com o roster já disponível (host monta o squad
      // estendido aqui — o efeito de mount pode ter corrido antes do load).
      if (coopParty && !isCancelled()) {
        handleRosterLoaded(
          {
            id: coopParty.id,
            leader_id: coopParty.leaderId,
            max_floor: Math.max(1, coopParty.maxFloor ?? 1),
          },
          coopRosterRef.current?.members ?? [],
          chosen.id,
        );
      } else if (!isCancelled()) {
        setCoopRole('none');
      }
      setDataReady(true);
    },
    [handleRosterLoaded],
  );

  // ---------------------------------------------------------------
  // Carregamento: personagem real + inventário + party do Aetheria
  // ---------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    function applyDemo() {
      if (cancelled) return;
      const party = createDemoParty(25);
      const synthetic = createSyntheticCharacter(25);
      const requestedFloor = Number(
        new URLSearchParams(window.location.search).get('floor') ?? '1',
      );
      const startFloor = requestedFloor >= 1 && requestedFloor <= 100 ? requestedFloor : 1;
      const nextWaves = buildFloorWaves(startFloor);
      setCharacterId('demo');
      setHeroes(party);
      initVitals(party);
      setCharacter(synthetic);
      setCreditedExp(0);
      setCreditedGold(0);
      setInventory([]);
      const demoSlots = defaultSkillSlots(party);
      setSkillSlots(demoSlots);
      skillSlotsRef.current = demoSlots;
      setHeroHp(heroHpMap(party));
      setAlive(Object.fromEntries(party.map((hero) => [hero.id, true])));
      setFloor(startFloor);
      setWaves(nextWaves);
      setWaveIndex(0);
      setEnemyHp(enemyHpMap(nextWaves[0]));
      setWaveKey((current) => current + 1);
      setHighestCleared(Math.max(1, startFloor));
      setMode('farm');
      setDataReady(true);
    }

    async function load() {
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('demo') === '1') {
          applyDemo();
          return;
        }

        const { user, timedOut } = await getUserWithTimeout();

        if (timedOut) {
          // Servidor de autenticação inacessível: não trava em "carregando".
          if (cancelled) return;
          router.replace('/login');
          return;
        }

        if (!user) {
          // Sem sessão: volta para o login (nunca carrega personagem de teste).
          if (cancelled) return;
          router.replace('/login');
          return;
        }

        const { data: account } = await supabase
          .from('accounts')
          .select('id')
          .eq('auth_user_id', user.id)
          .single();
        if (!account) {
          if (cancelled) return;
          router.replace('/login');
          return;
        }

        const { data: chars } = await supabase
          .from('characters')
          .select('*')
          .eq('account_id', account.id)
          .order('created_at', { ascending: true });

        const list = (chars ?? []) as Character[];
        if (list.length === 0) {
          if (cancelled) return;
          setShowCreate(true);
          return;
        }

        if (cancelled) return;
        setAvailableCharacters(list);
        // Com personagens existentes: abre a tela de seleção (não entra sozinho).
        setShowSelect(true);
      } catch (error) {
        console.error('[arena] falha ao carregar dados do personagem', error);
        if (!cancelled) router.replace('/login');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Sessão encerrada em outra tela (ex.: logout no jogo original) → volta ao login
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        clearLocalSession();
        router.replace('/login');
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [router]);

  // Heartbeat offline: estando ONLINE E COM A ABA VISÍVEL, mantém
  // last_settled_at recente para a liquidação offline não contabilizar tempo
  // em que o jogador estava ativamente jogando (XP/ouro creditados em tempo
  // real). Com a aba escondida o combate 3D congela (RAF pausado) — esse
  // tempo é offline e o heartbeat NÃO avança (não zera o relógio accrual).
  useEffect(() => {
    if (characterId === 'demo') return;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void supabase
        .from('characters')
        .update({ last_settled_at: new Date().toISOString() })
        .eq('id', characterId);
    }, 60 * 1000);
    return () => window.clearInterval(interval);
  }, [characterId]);

  // Aplica o estado (personagem + herói) com os valores absolutos do banco,
  // sem abrir o modal — usado nos lances feitos com a aba escondida.
  const applySettlementState = useCallback((result: NonNullable<SettleResult>) => {
    setCharacter((previous) =>
      previous
        ? {
            ...previous,
            level: result.levelAfter,
            exp: result.expAfter,
            gold: result.goldAfter,
            stat_points: result.statPointsAfter,
            talent_points: result.talentPointsAfter,
          }
        : previous,
    );
    setHeroes((previous) =>
      previous.map((hero) =>
        hero.isPlayer ? { ...hero, level: result.levelAfter } : hero,
      ),
    );
  }, []);

  const openOfflineDialog = useCallback((summary: OfflineSettlement) => {
    setOfflineSettlement(summary);
  }, []);

  // Caminho "visível": aplica estado E abre o modal (comprovante).
  const applySettlement = useCallback(
    (result: NonNullable<SettleResult>) => {
      applySettlementState(result);
      openOfflineDialog({
        seconds: result.seconds,
        xp: result.xp,
        gold: result.gold,
        levelBefore: result.levelBefore,
        levelAfter: result.levelAfter,
      });
    },
    [applySettlementState, openOfflineDialog],
  );

  // Cumulativo de liquidações pendentes de exibição (blocos escondidos +
  // lote concedido no retorno). Um ÚNICO modal mostra o total consolidado.
  const pendingSummaryRef = useRef<{
    seconds: number;
    xp: number;
    gold: number;
    levelBefore: number;
    levelAfter: number;
  } | null>(null);

  const showPendingSummary = useCallback(() => {
    const total = pendingSummaryRef.current;
    if (!total) return;
    pendingSummaryRef.current = null;
    openOfflineDialog({
      seconds: total.seconds,
      xp: total.xp,
      gold: total.gold,
      levelBefore: total.levelBefore,
      levelAfter: total.levelAfter,
    });
  }, [openOfflineDialog]);

  // O boot (do dev em StrictMode roda 2x) aplica antes do callback existir.
  const applySettlementRef = useRef<((result: NonNullable<SettleResult>) => void) | null>(null);
  applySettlementRef.current = applySettlement;

  // Pulsos de liquidação: rodam visível E escondido (o navegador limita abas
  // ocultas a ≥1 wake/min; abas congeladas retomam ao voltar — o lote final
  // cobre o tempo congelado). Resultados são ACUMULADOS e exibidos num único
  // modal consolidado ao voltar para a aba visível.
  const settleCheckRef = useRef<(() => void) | null>(null);
  settleCheckRef.current = () => {
    const id = characterRef.current?.id ?? characterId;
    if (!id || id === 'demo') return;
    const isHidden = document.visibilityState !== 'visible';
    void reconcileSettlementOnce(id).then((result) => {
      if (!result) {
        if (!isHidden) showPendingSummary();
        return;
      }
      applySettlementState(result);
      const total = pendingSummaryRef.current ?? {
        seconds: 0,
        xp: 0,
        gold: 0,
        levelBefore: result.levelBefore,
        levelAfter: result.levelBefore,
      };
      total.seconds += result.seconds;
      total.xp += result.xp;
      total.gold += result.gold;
      total.levelBefore = Math.min(total.levelBefore, result.levelBefore);
      total.levelAfter = Math.max(total.levelAfter, result.levelAfter);
      pendingSummaryRef.current = total;
      console.log(`[arena] settle offline (${isHidden ? 'escondido' : 'visível'}):`, result);
      if (!isHidden) showPendingSummary();
    });
  };

  // Gatilhos: visibilidade, foco (inclui restauração do bfcache) e pulso de 30s.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      settleCheckRef.current?.(); // liquida o lote final e abre o resumo consolidado
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('pageshow', onVisible);
    const interval = window.setInterval(() => settleCheckRef.current?.(), 30 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('pageshow', onVisible);
      window.clearInterval(interval);
    };
  }, []);

  // ---------------------------------------------------------------
  // Herói "eu" no squad: no combate individual é sempre o knight do
  // PRÓPRIO personagem (o squad de cada tela é o dele).
  // ---------------------------------------------------------------
  const selfHero = () => {
    const heroes = heroesRef.current;
    return heroes.find((hero) => hero.isPlayer) ?? heroes[0];
  };

  /**
   * Envia os vitais (HP/MP/nível/andar) do próprio herói via broadcast.
   * Usado no canal co-op a cada 2s e imediatamente após trocar de andar.
   */
  const coopSendVitals = useCallback(() => {
    const char = characterRef.current;
    const player = selfHero();
    if (!char || !player || !coopChannelRef.current) return;
    coopSend('vitals', {
      i: char.id,
      n: char.name,
      l: char.level,
      h: heroHpRef.current[player.id] ?? player.maxHp,
      hm: player.maxHp,
      m: heroMpRef.current[player.id] ?? player.mp,
      mm: player.maxMp,
      f: floorRef.current,
    } as CoopVitalsPayload);
  }, [coopSend]);

  // Query params de depuração/prévia
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('portal') === '1') setPreview(true);
  }, []);

  // Verifica suporte a WebGL (aceleração de hardware) antes de subir a cena 3D
  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      if (!gl) {
        setFatal(
          'Este navegador não suporta WebGL. Ative a aceleração de hardware nas configurações do aparelho ou use o Chrome/Safari atualizado.',
        );
      }
    } catch {
      /* segue o fluxo normal */
    }
  }, []);

  // Flushing do squad pendente: se o usuário mexeu em classe/posição e saiu
  // da arena antes do debounce (350ms), grava agora em vez de descartar.
  useEffect(() => {
    return () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current = [];
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
      if (partyConfigTimer.current) window.clearTimeout(partyConfigTimer.current);
      const pending = pendingPartyConfig.current;
      const cid = characterRef.current?.id;
      if (pending && cid && cid !== 'demo') {
        void supabase.from('characters').update({ party_config: pending }).eq('id', cid);
        pendingPartyConfig.current = null;
      }
    };
  }, []);

  const persist = useCallback(() => {
    if (characterId === 'demo' || typeof window === 'undefined') return;
    const value = {
      floor: floorRef.current,
      highestClearedFloor: highestClearedRef.current,
      mode: modeRef.current,
    };
    window.localStorage.setItem(`${STORAGE_PREFIX}${characterId}`, JSON.stringify(value));
  }, [characterId]);

  // Sincroniza o andar mais alto no banco (mesmo campo usado pelo jogo principal)
  const syncTowerFloor = useCallback(
    async (value: number) => {
      if (characterId === 'demo' || !value) return;
      try {
        await supabase.from('characters').update({ tower_floor: value }).eq('id', characterId);
      } catch (error) {
        console.error('[arena] falha ao sincronizar tower_floor', error);
      }
    },
    [characterId],
  );

  const pushLabel = useCallback(
    (position: [number, number, number], amount: number, tone: DamageLabel['tone']) => {
      const id = labelId();
      setLabels((previous) => [
        ...previous,
        { id, position, amount: Math.max(1, Math.round(amount)), tone },
      ]);
      timers.current.push(
        window.setTimeout(() => {
          setLabels((previous) => previous.filter((label) => label.id !== id));
        }, 950),
      );
    },
    [],
  );

  /**
   * Progresso próprio de andar: grava no ESTADO local e no BANCO o último
   * andar conquistado (recorde pessoal — nunca rebaixa). Usado pelo co-op
   * convidado (o mundo do host avança) e válido em qualquer papel fecha a
   * aba e volta depois — o andar fica salvo na conta individual.
   */
  const progressOwnFloor = useCallback((newFloor: number) => {
    const char = characterRef.current;
    if (!char || newFloor <= (char.tower_floor ?? 1)) return; // nunca rebaixa
    const updated = { ...char, tower_floor: newFloor };
    setCharacter(updated);
    characterRef.current = updated;
    if (newFloor > highestClearedRef.current) {
      highestClearedRef.current = newFloor;
      setHighestCleared(newFloor);
    }
    persist();
    void syncTowerFloor(newFloor);
  }, [persist, syncTowerFloor]);

  // Ao fechar o painel da party (criar/entrar/sair), recarrega o roster e
  // religa o co-op (papel 'peer') ou volta ao solo.
  useEffect(() => {
    if (partyOpen || !characterId || characterId === 'demo') return;
    let cancelled = false;
    const refreshMembership = async () => {
      try {
        const { data } = await supabase.rpc('party_roster', { p_character_id: characterId });
        if (cancelled) return;
        const payload = (data ?? null) as RosterPayload | null;
        if (payload?.party) {
          handleRosterLoaded(
            {
              id: payload.party.id,
              leader_id: payload.party.leader_id,
              max_floor: payload.party.max_floor ?? 1,
            },
            mapRosterMembers(payload.members ?? []),
            characterId,
          );
        } else if (coopRoleRef.current !== 'none') {
          endCoop('Você saiu da party — modo solo restaurado.');
        }
      } catch {
        /* mantém o estado atual em caso de falha de rede */
      }
    };
    void refreshMembership();
    return () => {
      cancelled = true;
    };
  }, [partyOpen, characterId, handleRosterLoaded, endCoop]);

  // ---------------------------------------------------------------
  // Co-op: mudança de membros (entrar/sair) durante o jogo —
  // recarrega o roster em tempo real.
  // ---------------------------------------------------------------
  useEffect(() => {
    if (!livePartyId || characterId === 'demo' || coopRole === 'none') return;

    const channel = supabase.channel(`coop-roster-${livePartyId}`);
    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'party_members',
          filter: `party_id=eq.${livePartyId}`,
        },
        () => {
          void (async () => {
            const { data } = await supabase.rpc('party_roster', { p_character_id: characterId });
            const payload = (data ?? null) as RosterPayload | null;
            if (!payload?.party) {
              endCoop('Party encerrada — modo solo restaurado.');
              return;
            }
            const members = mapRosterMembers(payload.members ?? []);
            const previous = coopRosterRef.current;
            if (
              previous &&
              previous.members.length === members.length &&
              previous.leaderId === payload.party.leader_id
            ) {
              coopRosterRef.current = {
                leaderId: payload.party.leader_id,
                maxFloor: Math.max(1, payload.party.max_floor ?? 1),
                members,
              };
              return;
            }
            handleRosterLoaded(
              {
                id: payload.party.id,
                leader_id: payload.party.leader_id,
                max_floor: payload.party.max_floor ?? 1,
              },
              members,
              characterId,
            );
          })();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [livePartyId, characterId, coopRole, handleRosterLoaded, endCoop]);


  const startFloor = useCallback((nextFloor: number, options: { heal?: boolean; healAmount?: number; resumeWave?: number } = {}) => {
    const nextWaves = buildFloorWaves(nextFloor);
    const nextHeroes = heroesRef.current;
    const healAmount = options.healAmount ?? 1;
    // resumeWave: mantém o progresso ao trocar de modo (FARM/AVANÇO) —
    // só o objetivo muda, não recomeça da wave 1.
    const resumeIndex = Math.max(
      0,
      Math.min(options.resumeWave ?? 0, nextWaves.length - 1),
    );

    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
    bossAoeAt.current = 0;
    // P1: reseta telegrafia/cooldowns/buff do boss ao iniciar andar.
    bossSkillUsedAt.current = {};
    bossBuffUntil.current = 0;
    setBossTelegraph(null);

    setFloor(nextFloor);
    setWaves(nextWaves);
    setWaveIndex(resumeIndex);
    setWaveKey((current) => current + 1);
    setEnemyHp(enemyHpMap(nextWaves[resumeIndex]));
    setLabels([]);
    setBolts([]);
    setBossDefeated(false);
    bossDefeatedRef.current = false;
    setMeter(Object.fromEntries(nextHeroes.map((hero) => [hero.id, blankMeter()])));
    setElapsedMs(0);

    if (options.heal === false) {
      setHeroHp((previous) => {
        const next = { ...previous };
        for (const hero of nextHeroes) {
          const ratio = (next[hero.id] ?? hero.maxHp) / hero.maxHp;
          next[hero.id] = Math.min(hero.maxHp, Math.round(hero.maxHp * ratio * healAmount));
        }
        return next;
      });
      return;
    }

    setHeroHp(Object.fromEntries(nextHeroes.map((hero) => [hero.id, hero.maxHp])));
    setHeroSd(Object.fromEntries(nextHeroes.map((hero) => [hero.id, hero.sd])));
    setHeroMp(Object.fromEntries(nextHeroes.map((hero) => [hero.id, hero.mp])));
    setAlive(Object.fromEntries(nextHeroes.map((hero) => [hero.id, true])));

    // Anuncia imediatamente o novo andar (peer alerta os demais mais rápido
    // do que o ciclo de 2s dos vitais).
    window.setTimeout(coopSendVitals, 60);
  }, [coopSendVitals]);

  // ---------------------------------------------------------------
  // Co-op peer: canal único — vitais a cada 2s (HUD "PARTY · AO VIVO")
  // + alinhamento de andar: o membro que conquistar o andar mais alto
  // anuncia e os demais pulam para cima. Combate roda 100% local em
  // cada tela (minimizar/fechar NÃO congela os outros).
  // ---------------------------------------------------------------
  useEffect(() => {
    if (coopRole !== 'peer' || !livePartyId || characterId === 'demo' || !dataReady) {
      return;
    }

    const matesCache = new Map<string, LiveMate & { seenAt: number }>();

    const channel = supabase.channel(`party-coop-${livePartyId}`);
    channel
      .on('broadcast', { event: 'vitals' }, ({ payload }) => {
        const vitals = payload as CoopVitalsPayload | null;
        if (!vitals?.i || vitals.i === characterId || !dataReadyRef.current) return;

        matesCache.set(vitals.i, {
          id: vitals.i,
          name: vitals.n,
          level: vitals.l,
          hp: vitals.h,
          maxHp: vitals.hm > 0 ? vitals.hm : 1,
          mp: vitals.m,
          maxMp: vitals.mm > 0 ? vitals.mm : 1,
          towerFloor: vitals.f,
          seenAt: Date.now(),
        });
        setLiveMates(Array.from(matesCache.values()));

        // Andar compartilhado: o colega está num andar mais alto → pula para
        // cima. O recorde individual continua salvo por cada tela, quando
        // conquistar o chefe na tela dela.
        const announced = Math.max(1, Math.floor(vitals.f ?? 1));
        if (announced > floorRef.current) {
          pushNotice(`👥 ${vitals.n} está no Andar ${announced} — party alinhou.`);
          startFloor(announced);
          window.setTimeout(coopSendVitals, 300);
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') coopSendVitals();
      });

    coopChannelRef.current = channel;

    const vitalsTimer = window.setTimeout(coopSendVitals, 500);
    const interval = window.setInterval(() => {
      // Vitais próprios a cada 2s + prune dos mates silenciosos
      // (> 8s sem sinal = fechou/minimizou — some do "AO VIVO").
      coopSendVitals();
      const now = Date.now();
      let pruned = false;
      for (const [key, mate] of matesCache) {
        if (now - mate.seenAt > 8000) {
          matesCache.delete(key);
          pruned = true;
        }
      }
      if (pruned) setLiveMates(Array.from(matesCache.values()));
    }, 2000);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(vitalsTimer);
      if (coopChannelRef.current === channel) coopChannelRef.current = null;
      void supabase.removeChannel(channel);
      setLiveMates([]);
    };
  }, [coopRole, livePartyId, characterId, dataReady, coopSend, coopSendVitals, startFloor, pushNotice]);

  // ---------------------------------------------------------------
  // Dano real: usa rollDamage (ATK - DEF/2, crítico) do Aetheria
  // ---------------------------------------------------------------
  // Credita o XP/ouro ganho com monstros mortos ao personagem (idempotente via
  // lastCredited refs). Chama ao morrer cada monstro, nao apenas no final da wave.
  const creditArenaRewards = useCallback(() => {
    const char = characterRef.current;
    if (!char) return;
    const deltaExp = Math.max(0, expGainedRef.current - lastCreditedExpRef.current);
    const deltaGold = Math.max(0, goldGainedRef.current - lastCreditedGoldRef.current);
    if (deltaExp === 0 && deltaGold === 0) return;

    const progression = applyExperience(
      { level: char.level, exp: char.exp || 0, statPoints: char.stat_points || 0 },
      deltaExp,
      5,
    );
    const levelsGained = progression.levelsGained;
    const newTalentPoints = (char.talent_points || 0) + levelsGained * 3;
    const updated = {
      ...char,
      level: progression.level,
      exp: progression.exp,
      stat_points: progression.statPoints,
      talent_points: newTalentPoints,
      gold: (char.gold || 0) + deltaGold,
    };

    characterRef.current = updated;
    setCharacter(updated);
    // Atualiza o heroi do partido para o HUD refletir o novo nivel imediatamente,
    // sem precisar recarregar a pagina ou abrir o menu de status.
    setHeroes((previous) =>
      previous.map((hero) =>
        hero.isPlayer ? { ...hero, level: updated.level } : hero,
      ),
    );
    lastCreditedExpRef.current = expGainedRef.current;
    lastCreditedGoldRef.current = goldGainedRef.current;
    setCreditedExp(expGainedRef.current);
    setCreditedGold(goldGainedRef.current);

    if (characterId !== 'demo') {
      void supabase
        .from('characters')
        .update({
          level: updated.level,
          exp: updated.exp,
          gold: updated.gold,
          stat_points: updated.stat_points,
          talent_points: updated.talent_points,
          // Piggyback: refresh do relógio da liquidação offline (Fase P2).
          last_settled_at: new Date().toISOString(),
        })
        .eq('id', char.id)
        .then(({ error }) => {
          if (error) console.error('[arena] falha ao salvar XP/ouro:', error.message);
          else console.log('[arena] XP/ouro salvos:', updated.level, updated.exp, updated.gold);
        });
    }
  }, [characterId]);

  const damageEnemy = useCallback(
    (enemy: EnemyDef, amount: number) => {
      const previousHp = enemyHpRef.current[enemy.id] ?? 0;
      if (previousHp <= 0) return;

      const nextHp = Math.max(0, previousHp - amount);
      const justDied = nextHp <= 0 && previousHp > 0;

      setEnemyHp((previous) => ({
        ...previous,
        [enemy.id]: nextHp,
      }));

      // XP e ouro são computados apenas quando o monstro morre (não por dano causado).
      // Cada monstro gera o seu exp/gold definidos na tabela de monstros.
      if (justDied) {
        // Co-op v2: cada tela ganha XP/ouro dos PRÓPRIOS kills (régua
        // integral — o modelo espelhado com divisão por squad saiu).
        setExpGained((previous) => previous + enemy.exp);
        setGoldGained((previous) => previous + enemy.gold);
        creditArenaRewards();

        // P1 item 7: rolar drops estruturados com pity (drops próprios do
        // jogador que matou).
        const { drops, newPity } = rollDrops(
          enemy.kind,
          floorRef.current,
          pityState.current,
        );
        pityState.current = newPity;

        if (drops.length > 0) {
          // Adiciona os drops ao inventário local; em conta real, persiste no banco.
          if (characterId !== 'demo') {
            for (const drop of drops) {
              void supabase
                .from('inventory')
                .insert({
                  character_id: characterRef.current?.id,
                  item_name: drop.itemId,
                  item_type: 'consumable',
                  refine_level: 0,
                  is_equipped: false,
                  is_in_stash: false,
                })
                .then(({ data, error }) => {
                  if (error) {
                    console.error('[arena] falha ao registrar drop:', error.message);
                    return;
                  }
                  if (data) {
                    const next = [...inventoryRef.current, data as InventoryItem];
                    setInventory(next);
                  }
                });
            }
          } else {
            // Modo demo: adiciona drops fictícios ao inventário local.
            const demoDrops: InventoryItem[] = drops.map((drop, i) => ({
              id: `demo-drop-${Date.now()}-${i}`,
              character_id: 'demo',
              item_name: drop.itemId,
              item_type: 'consumable',
              refine_level: 0,
              is_equipped: false,
              is_in_stash: false,
              quantity: drop.qty,
            } as unknown as InventoryItem));
            setInventory((prev) => [...prev, ...demoDrops]);
          }
        }
      }

      pushLabel(
        [enemy.position[0], enemy.kind === 'boss' ? 4.4 : 2.1, enemy.position[2]],
        amount,
        'enemy',
      );
    },
    [pushLabel, creditArenaRewards],
  );

  /**
   * Monta o `party_config` atual (posição, auto-cast e classe dos bots)
   * a partir do estado local — é o mesmo formato salvo pelo jogo principal.
   */
  const buildPartyConfig = useCallback(
    (
      changes: Array<{
        id: string;
        position?: Position;
        autoCast?: boolean;
        classId?: string;
      }> = [],
    ): PartyConfig => {
      const config: PartyConfig = {};

      for (const hero of heroesRef.current) {
        const key = PARTY_CONFIG_KEYS[hero.id];
        const change = changes.find((item) => item.id === hero.id);

        const entry: { position: Position; autoCast: boolean; classId?: string } = {
          position: change?.position ?? positionsRef.current[hero.id] ?? hero.positionRole,
          autoCast: change?.autoCast ?? autoCastMapRef.current[hero.id] ?? hero.autoCast,
        };

        if (!hero.isPlayer) {
          entry.classId = change?.classId ?? hero.classId;
        }

        config[key] = entry;
      }

      return config;
    },
    [],
  );

  /**
   * Salva as alterações do squad no `characters.party_config` — o mesmo
   * registro usado pelo jogo principal. Assim vale a última alteração,
   * venha ela da arena ou do jogo original.
   *
   * As escritas são debounced para que a última mudança seja sempre a
   * gravada por último (evita corrida entre salvamentos).
   */
  const persistPartyConfig = useCallback(
    (
      changes: Array<{
        id: string;
        position?: Position;
        autoCast?: boolean;
        classId?: string;
      }>,
    ) => {
      if (characterId === 'demo' || typeof window === 'undefined') return;

      pendingPartyConfig.current = buildPartyConfig(changes);

      if (partyConfigTimer.current) window.clearTimeout(partyConfigTimer.current);
      partyConfigTimer.current = window.setTimeout(() => {
        const payload = pendingPartyConfig.current;
        if (!payload) return;
        supabase
          .from('characters')
          .update({ party_config: payload })
          .eq('id', characterId)
          .then(({ error }) => {
            if (error) console.error('[arena] erro ao salvar party_config:', error.message);
          });
      }, 350);
    },
    [characterId, buildPartyConfig],
  );

  /** Recria a party com o inventário atual, preservando o HP比例 de cada um. */
  const rebuildParty = useCallback(
    (nextInventory: InventoryItem[]) => {
      const activeCharacter = characterRef.current;
      if (!activeCharacter) return;

      const current = heroesRef.current;
      const next = buildArenaParty(activeCharacter, nextInventory, buildPartyConfig());

      setHeroes(next);
      setHeroHp((previous) => {
        const map = { ...previous };
        for (const hero of next) {
          const old = current.find((candidate) => candidate.id === hero.id);
          const ratio = old && old.maxHp > 0 ? (previous[old.id] ?? old.maxHp) / old.maxHp : 1;
          map[hero.id] = Math.max(1, Math.min(hero.maxHp, Math.round(hero.maxHp * ratio)));
        }
        return map;
      });
      setHeroMp((previous) => {
        const map = { ...previous };
        for (const hero of next) map[hero.id] = hero.mp;
        return map;
      });
    },
    [buildPartyConfig],
  );

  // ---------------------------------------------------------------
  // Cidade (Andar 0): alquimista, mercador e forja
  // ---------------------------------------------------------------
  const buyPotion = useCallback(
    async (tplId: string, price: number) => {
      const current = characterRef.current;
      if (!current) return;

      if ((current.gold ?? 0) < price) {
        pushNotice('🧪 Ouro insuficiente.');
        return;
      }

      const template = ITEM_DATABASE[tplId];
      if (!template) return;

      const { data, error } = await supabase
        .from('inventory')
        .insert([
          {
            character_id: current.id,
            item_name: template.name,
            item_type: template.type,
            refine_level: 0,
            is_equipped: false,
            is_in_stash: false,
          },
        ])
        .select()
        .single();

      if (error) {
        console.error('[arena] erro ao comprar item:', error.message);
        return;
      }

      if (data) {
        const next = [...inventoryRef.current, data as InventoryItem];
        setInventory(next);
        rebuildParty(next);
      }

      const newGold = (current.gold ?? 0) - price;
      const updated = { ...current, gold: newGold };
      setCharacter(updated);
      characterRef.current = updated;
      await supabase.from('characters').update({ gold: newGold }).eq('id', current.id);

      pushNotice(`🧪 ${template.name} comprada por ${price} ouro`);
    },
    [pushNotice, rebuildParty],
  );

  const sellItems = useCallback(
    async (items: InventoryItem[]) => {
      const current = characterRef.current;
      if (!current || items.length === 0) {
        pushNotice('💰 Sem itens para vender.');
        return;
      }

      const ids = items.map((item) => item.id);
      const { error } = await supabase.from('inventory').delete().in('id', ids);

      if (error) {
        console.error('[arena] erro ao vender itens:', error.message);
        return;
      }

      const gain = items.reduce(
        (acc, item) => acc + (TEMPLATE_BY_NAME.get(item.item_name)?.sellValue ?? 5),
        0,
      );

      const next = inventoryRef.current.filter((item) => !ids.includes(item.id));
      setInventory(next);
      rebuildParty(next);

      const newGold = (current.gold ?? 0) + gain;
      const updated = { ...current, gold: newGold };
      setCharacter(updated);
      characterRef.current = updated;
      await supabase.from('characters').update({ gold: newGold }).eq('id', current.id);

      pushNotice(`💰 ${items.length} item(ns) vendido(s) por ${gain} ouro`);
    },
    [pushNotice, rebuildParty],
  );

  const refineItem = useCallback(
    async (item: InventoryItem) => {
      const current = characterRef.current;
      if (!current) return;

      const stone = inventoryRef.current.find((entry) => entry.item_type === 'refine_stone');
      if (!stone) {
        pushNotice('💎 Sem Joia de Refino na bolsa.');
        return;
      }

      await supabase.from('inventory').delete().eq('id', stone.id);

      const race = getRace((current.race ?? 'humano') as RaceId);
      const chance = 0.65 * (race.economy.refineCostMultiplier || 1);
      const success = Math.random() < chance;

      if (success) {
        const newLevel = item.refine_level + 1;
        await supabase.from('inventory').update({ refine_level: newLevel }).eq('id', item.id);

        const next = inventoryRef.current
          .filter((entry) => entry.id !== stone.id)
          .map((entry) =>
            entry.id === item.id ? { ...entry, refine_level: newLevel } : entry,
          );
        setInventory(next);
        rebuildParty(next);
        pushNotice(`💎 Refino +${newLevel} com sucesso!`);
        return;
      }

      const next = inventoryRef.current.filter((entry) => entry.id !== stone.id);
      setInventory(next);
      rebuildParty(next);
      pushNotice('💎 Refino falhou. A joia foi consumida.');
    },
    [pushNotice, rebuildParty],
  );

  const addStatPoint = useCallback(
    async (statKey: 'str' | 'agi' | 'vit' | 'int_stat' | 'dex' | 'luk') => {
      const current = characterRef.current;
      if (!current || (current.stat_points ?? 0) <= 0) return;

      const updated: Character = {
        ...current,
        [statKey]: (current[statKey] ?? 10) + 1,
        stat_points: (current.stat_points ?? 0) - 1,
      };

      setCharacter(updated);
      characterRef.current = updated;

      const { error } = await supabase
        .from('characters')
        .update({
          [statKey]: updated[statKey],
          stat_points: updated.stat_points,
        } as Record<string, number>)
        .eq('id', current.id);

      if (error) {
        console.error('[arena] erro ao alocar ponto de atributo:', error.message);
        return;
      }

      rebuildParty(inventoryRef.current);
    },
    [rebuildParty],
  );

  const toggleEquip = useCallback(
    async (item: InventoryItem) => {
      const equipping = !item.is_equipped;
      let next = inventoryRef.current;

      if (equipping) {
        // Um item por slot: o que já estava neste tipo volta para a bolsa.
        const conflicts = next.filter(
          (entry) => entry.is_equipped && entry.item_type === item.item_type && entry.id !== item.id,
        );

        if (conflicts.length > 0) {
          await Promise.all(
            conflicts.map((entry) =>
              supabase
                .from('inventory')
                .update({ is_equipped: false, is_in_stash: false })
                .eq('id', entry.id),
            ),
          );

          next = next.map((entry) =>
            conflicts.some((conflict) => conflict.id === entry.id)
              ? { ...entry, is_equipped: false, is_in_stash: false }
              : entry,
          );
        }
      }

      const newStatus = equipping;
      const { error } = await supabase
        .from('inventory')
        .update({ is_equipped: newStatus, is_in_stash: false })
        .eq('id', item.id);

      if (error) {
        console.error('[arena] erro ao equipar item:', error.message);
        return;
      }

      const finalList = next.map((entry) =>
        entry.id === item.id
          ? { ...entry, is_equipped: newStatus, is_in_stash: false }
          : entry,
      );
      setInventory(finalList);
      rebuildParty(finalList);
    },
    [rebuildParty],
  );

  const toggleStash = useCallback(
    async (target: InventoryItem | InventoryItem[]) => {
      const items = Array.isArray(target) ? target : [target];
      if (items.length === 0) return;

      const toStash = !items[0].is_in_stash;

      await Promise.all(
        items.map((entry) =>
          supabase
            .from('inventory')
            .update({ is_in_stash: toStash, is_equipped: false })
            .eq('id', entry.id),
        ),
      );

      const ids = new Set(items.map((entry) => entry.id));
      const next = inventoryRef.current.map((entry) =>
        ids.has(entry.id) ? { ...entry, is_in_stash: toStash, is_equipped: false } : entry,
      );
      setInventory(next);
      rebuildParty(next);
    },
    [rebuildParty],
  );

  // ---------------------------------------------------------------
  // Damage Meter: acumula dano/tomado/cura por membro em tempo real
  // ---------------------------------------------------------------
  const registerDamage = useCallback(
    (heroId: string, amount: number, crit: boolean, skillName: string | null) => {
      setMeter((previous) => {
        const current = previous[heroId] ?? blankMeter();
        const next: MemberMeter = {
          ...current,
          damage: current.damage + amount,
          skills: { ...current.skills },
        };

        if (skillName) {
          const stat = next.skills[skillName] ?? { name: skillName, total: 0, hits: 0, crits: 0 };
          next.skills[skillName] = {
            name: skillName,
            total: stat.total + amount,
            hits: stat.hits + 1,
            crits: stat.crits + (crit ? 1 : 0),
          };
        } else {
          next.autoHits = current.autoHits + 1;
          next.autoCrits = current.autoCrits + (crit ? 1 : 0);
          next.autoDamage = current.autoDamage + amount;
        }

        return { ...previous, [heroId]: next };
      });
    },
    [],
  );

  const registerTaken = useCallback((heroId: string, amount: number) => {
    setMeter((previous) => {
      const current = previous[heroId] ?? blankMeter();
      return {
        ...previous,
        [heroId]: { ...current, taken: current.taken + amount, takenHits: current.takenHits + 1 },
      };
    });
  }, []);

  const registerHealed = useCallback((heroId: string, amount: number) => {
    setMeter((previous) => {
      const current = previous[heroId] ?? blankMeter();
      return {
        ...previous,
        [heroId]: { ...current, healed: current.healed + amount, healHits: current.healHits + 1 },
      };
    });
  }, []);

  const onHeroAttack = useCallback(
    (hero: HeroDef) => {
      const current = wavesRef.current[waveIndexRef.current];
      const living = current.enemies.filter((enemy) => (enemyHpRef.current[enemy.id] ?? 0) > 0);
      if (living.length === 0) return;

      // --- Auto-cast: as skills dos 4 slots são sempre lançadas ---
      const slots = skillSlotsRef.current[hero.id] ?? [];
      let castSkill: SkillDefinition | null = null;

      if (slots.length > 0) {
        const mp = heroMpRef.current[hero.id] ?? 0;
        const now = Date.now();

        const ready = slots
          .map((id) => getSkill(id))
          .filter((skill): skill is SkillDefinition => Boolean(skill))
          .filter((skill) => skill.mpCost <= mp)
          .filter((skill) => (skillCooldowns.current[`${hero.id}:${skill.id}`] ?? 0) <= now)
          .filter((skill) => skill.power > 0 || /cura/i.test(skill.effect));

        if (ready.length > 0) {
          castSkill = ready[Math.floor(Math.random() * ready.length)];
          skillCooldowns.current[`${hero.id}:${castSkill.id}`] = now + castSkill.cooldownMs;
          setHeroMp((previous) => ({
            ...previous,
            [hero.id]: Math.max(0, (previous[hero.id] ?? 0) - castSkill!.mpCost),
          }));
        }
      }

      // Skills de cura não atacam: curam o aliado mais ferido
      if (castSkill && castSkill.power === 0) {
        const members = heroesRef.current.filter(
          (member) =>
            (aliveRef.current[member.id] ?? true) && (heroHpRef.current[member.id] ?? 0) > 0,
        );
        const wounded = members.filter(
          (member) => (heroHpRef.current[member.id] ?? 0) < member.maxHp * 0.8,
        );
        const pool = wounded.length > 0 ? wounded : members;

        if (pool.length > 0) {
          const receiver = pool.reduce((a, b) =>
            (heroHpRef.current[a.id] / a.maxHp) <= (heroHpRef.current[b.id] / b.maxHp) ? a : b,
          );
          const healAmount = Math.max(1, Math.floor(receiver.maxHp * 0.3));

          setHeroHp((previous) => ({
            ...previous,
            [receiver.id]: Math.min(receiver.maxHp, (previous[receiver.id] ?? 0) + healAmount),
          }));
          registerHealed(hero.id, healAmount);
          pushLabel([receiver.position[0], 2.2, receiver.position[2]], healAmount, 'heal');
        }
        return;
      }

      const target = living[Math.floor(Math.random() * living.length)];
      const power = castSkill ? Math.max(1, castSkill.power) : 1;

      // Com AUTO desligado o membro só age pelas skills dos slots.
      if (!hero.autoCast && !castSkill) return;

      const result = rollDamage(
        {
          physicalAttack: Math.floor(hero.atk * power),
          critChance: hero.critChance,
          critDamage: hero.critDamage,
        },
        target.defense,
      );
      const amount = Math.max(1, Math.round(result.damage));

      registerDamage(hero.id, amount, result.critical, castSkill ? castSkill.name : null);

      if (hero.id === 'mage') {
        const id = labelId();
        const from: [number, number, number] = [hero.position[0], 1.45, hero.position[2]];
        const to: [number, number, number] = [
          target.position[0],
          target.kind === 'boss' ? 2.6 : 1.05,
          target.position[2],
        ];
        setBolts((previous) => [...previous, { id, from, to }]);
        timers.current.push(
          window.setTimeout(() => {
            damageEnemy(target, amount);
            setBolts((previous) => previous.filter((bolt) => bolt.id !== id));
          }, 480),
        );
        return;
      }

      damageEnemy(target, amount);
    },
    [damageEnemy, registerDamage, registerHealed, pushLabel],
  );

  /** Aplica dano ao herói (dano vai direto para o HP, como no jogo principal). */
  const applyHeroDamage = useCallback(
    (id: string, amount: number) => {
      const hero = heroesRef.current.find((candidate) => candidate.id === id);
      if (!hero) return;

      registerTaken(id, amount);

      setHeroHp((previous) => ({
        ...previous,
        [id]: Math.max(0, (previous[id] ?? 0) - amount),
      }));
      setHitNonce((previous) => ({ ...previous, [id]: (previous[id] ?? 0) + 1 }));
      pushLabel([hero.position[0], 2.2, hero.position[2]], amount, 'hero');
    },
    [pushLabel, registerTaken],
  );

  const onEnemyAttack = useCallback(
    (enemy: EnemyDef) => {
      const members = heroesRef.current;
      const living = members.filter((hero) => (aliveRef.current[hero.id] ?? true) && (heroHpRef.current[hero.id] ?? 0) > 0);
      if (living.length === 0) return;

      // Linha de frente recebe mais ataques (como no jogo).
      const weights = living.map((hero) => (hero.positionRole === 'front' ? 3 : hero.positionRole === 'mid' ? 2 : 1));
      const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
      let roll = Math.random() * totalWeight;
      let target = living[0];
      for (let i = 0; i < living.length; i += 1) {
        roll -= weights[i];
        if (roll <= 0) {
          target = living[i];
          break;
        }
      }

      const result = rollDamage(
        { physicalAttack: enemy.atk, critChance: 0.03, critDamage: 1.4 },
        target.defense,
      );
      const amount = Math.max(1, Math.round(result.damage));

      applyHeroDamage(target.id, amount);
    },
    [applyHeroDamage],
  );

  // Cura automática do suporte (como no Aetheria) — consome MP e respeita AUTO
  // (roda 100% local em cada tela — combate individual).
  useEffect(() => {
    if (!auto) return;

    const interval = window.setInterval(() => {
      const members = heroesRef.current;

      // Se algum membro tem skill de cura no auto-cast, quem cura é a skill.
      const hasHealSkill = members.some((hero) =>
        (skillSlotsRef.current[hero.id] ?? []).some((id) =>
          /cura/i.test(getSkill(id)?.effect ?? ''),
        ),
      );
      if (hasHealSkill) return;

      const healers = members.filter(
        (hero) =>
          hero.isHealer &&
          (autoCastMapRef.current[hero.id] ?? true) &&
          (aliveRef.current[hero.id] ?? true) &&
          (heroHpRef.current[hero.id] ?? 0) > 0 &&
          (heroMpRef.current[hero.id] ?? 0) >= 20,
      );
      if (healers.length === 0) return;

      const healer = healers[0];
      const hpMap = heroHpRef.current;
      const aliveMap = aliveRef.current;
      const candidates = members.filter(
        (hero) =>
          (aliveMap[hero.id] ?? true) &&
          (hpMap[hero.id] ?? 0) > 0 &&
          (hpMap[hero.id] ?? 0) < hero.maxHp * 0.8,
      );
      if (candidates.length === 0) return;

      const target = candidates.reduce((a, b) =>
        (hpMap[a.id] / a.maxHp) <= (hpMap[b.id] / b.maxHp) ? a : b,
      );
      const amount = Math.max(1, Math.floor(target.maxHp * 0.25));

      setHeroHp((previous) => ({
        ...previous,
        [target.id]: Math.min(target.maxHp, (previous[target.id] ?? 0) + amount),
      }));
      setHeroMp((previous) => ({
        ...previous,
        [healer.id]: Math.max(0, (previous[healer.id] ?? 0) - 20),
      }));
      registerHealed(healer.id, amount);
      pushLabel([target.position[0], 2.2, target.position[2]], amount, 'heal');
    }, 4000);

    return () => window.clearInterval(interval);
  }, [auto, pushLabel, registerHealed]);

  // Regeneração de MP
  useEffect(() => {
    if (!auto) return;

    const interval = window.setInterval(() => {
      setHeroMp((previous) => {
        const next = { ...previous };
        for (const hero of heroesRef.current) {
          if (!(aliveRef.current[hero.id] ?? true)) continue;
          const current = next[hero.id] ?? hero.mp;
          if (current < hero.maxMp) next[hero.id] = Math.min(hero.maxMp, current + 3);
        }
        return next;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [auto]);

  // Cronômetro do Damage Meter
  useEffect(() => {
    if (!dataReady) return;
    const interval = window.setInterval(() => {
      setElapsedMs((current) => current + 1000);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [dataReady]);

  // P1 item 6: executor de boss skills com telegrafia. Cada skill do tema
  // respeita o gatilho (hp/timer/random/always) e cooldown próprios. Ao
  // disparar, mostra a telegrafia (barra no HUD) e só então aplica o efeito.
  // summon_minion ainda sem executor (fase futura).
  useEffect(() => {
    if (!auto) return;

    let telegraphStart = 0;
    let telegraphDuration = 0;
    let pendingSkill: BossSkill | null = null;
    let stunRestoreTimer: number | null = null;
    let stunSnapshot: Record<string, boolean> | null = null;

    const clearStun = () => {
      if (!stunApplied) return;
      stunApplied = false;
      if (stunSnapshot) {
        autoCastMapRef.current = { ...stunSnapshot };
        setAutoCastMap({ ...stunSnapshot });
        stunSnapshot = null;
      }
    };
    let stunApplied = false;

    const applyBossSkill = (skill: BossSkill, boss: EnemyDef) => {
      pushNotice(`${boss.name}: ${skill.skillName}!`);

      if (skill.effect === 'aoe_damage') {
        const buffActive = Date.now() < bossBuffUntil.current;
        const base = calculateBossSkillDamage(boss.atk, skill);
        const amount = Math.max(1, Math.floor(base * (buffActive ? bossBuffMult.current : 1)));
        const members = heroesRef.current.filter(
          (hero) => (aliveRef.current[hero.id] ?? true) && (heroHpRef.current[hero.id] ?? 0) > 0,
        );
        members.forEach((hero) => {
          // Cap de AOE (P0): nunca tira mais que 40% do maxHp em um único hit.
          const capped = Math.min(amount, Math.max(1, Math.floor(hero.maxHp * 0.4)));
          applyHeroDamage(hero.id, capped);
        });
        return;
      }

      if (skill.effect === 'heal_self') {
        let drained = 0;
        if (skill.damageMultiplier > 0) {
          const members = heroesRef.current.filter(
            (hero) => (aliveRef.current[hero.id] ?? true) && (heroHpRef.current[hero.id] ?? 0) > 0,
          );
          members.forEach((hero) => {
            const drain = Math.floor(hero.maxHp * 0.08);
            if (drain > 0) {
              applyHeroDamage(hero.id, drain);
              drained += drain;
            }
          });
        }
        const healAmount = Math.max(drained, Math.floor(boss.maxHp * 0.1));
        const currentHp = enemyHpRef.current[boss.id] ?? 0;
        if (currentHp > 0) {
          setEnemyHp((previous) => ({
            ...previous,
            [boss.id]: Math.min(boss.maxHp, (previous[boss.id] ?? 0) + healAmount),
          }));
        }
        return;
      }

      if (skill.effect === 'stun_party') {
        // Congela o auto-cast dos heróis por durationSec.
        stunApplied = true;
        stunSnapshot = { ...autoCastMapRef.current };
        const frozen: Record<string, boolean> = {};
        for (const hero of heroesRef.current) frozen[hero.id] = false;
        autoCastMapRef.current = frozen;
        setAutoCastMap(frozen);
        if (stunRestoreTimer !== null) window.clearTimeout(stunRestoreTimer);
        stunRestoreTimer = window.setTimeout(clearStun, Math.max(1000, skill.durationSec * 1000));
        return;
      }

      if (skill.effect === 'buff_attack') {
        bossBuffUntil.current = Date.now() + skill.durationSec * 1000;
        bossBuffMult.current = skill.damageMultiplier || 1.3;
        return;
      }
    };

    const interval = window.setInterval(() => {
      const current = wavesRef.current[waveIndexRef.current];
      const boss = current.enemies.find((enemy) => enemy.kind === 'boss');
      const now = Date.now();

      if (!boss) {
        // Wave sem chefe: limpa telegrafia e atordoamento pendentes.
        if (pendingSkill) {
          pendingSkill = null;
          setBossTelegraph(null);
        }
        clearStun();
        return;
      }

      // Conclui a telegrafia em andamento antes de avaliar novas skills.
      if (pendingSkill) {
        const progress = telegraphDuration > 0 ? (now - telegraphStart) / telegraphDuration : 1;
        if (progress >= 1) {
          const skill = pendingSkill;
          pendingSkill = null;
          setBossTelegraph(null);
          applyBossSkill(skill, boss);
        } else {
          setBossTelegraph({ skillName: pendingSkill.skillName, progress });
        }
        return;
      }

      const hp = enemyHpRef.current[boss.id] ?? 0;
      const bossPercent = (hp / boss.maxHp) * 100;
      const theme = getTowerTheme(floorRef.current);
      const skills = getBossSkills(theme.id);

      for (const skill of skills) {
        if (skill.effect === 'summon_minion') continue;
        if (!shouldTriggerSkill(skill, bossPercent)) continue;
        const last = bossSkillUsedAt.current[skill.skillId] ?? 0;
        if (now - last < skill.cooldownSec * 1000) continue;

        bossSkillUsedAt.current[skill.skillId] = now;
        pendingSkill = skill;
        telegraphStart = now;
        telegraphDuration = Math.max(1200, skill.durationSec * 1000);
        setBossTelegraph({ skillName: skill.skillName, progress: 0 });
        break;
      }
    }, 300);

    return () => {
      window.clearInterval(interval);
      if (stunRestoreTimer !== null) window.clearTimeout(stunRestoreTimer);
      clearStun();
    };
  }, [auto, applyHeroDamage, pushNotice]);

  // Sincroniza mortes
  useEffect(() => {
    setAlive((previous) => {
      const next = { ...previous };
      let changed = false;
      for (const hero of heroesRef.current) {
        const should = (heroHp[hero.id] ?? 0) > 0;
        if ((next[hero.id] ?? true) !== should) {
          next[hero.id] = should;
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [heroHp]);

  // Derrota: no farm o loop recomeça; na progressão espera 60s (para analisar
  // DPS/dano recebido/cura) e depois volta sozinho para o modo farm.
  // (combate individual: cada tela resolve a própria derrota)
  useEffect(() => {
    const leader = heroesRef.current.find((hero) => hero.isPlayer);
    if (!leader) return;
    if (aliveRef.current[leader.id] !== false) return;

    if (modeRef.current === 'farm') {
      const timer = window.setTimeout(() => startFloor(floorRef.current), 1600);
      timers.current.push(timer);
      return;
    }

    if (defeatCountdownRef.current !== null) return;

    defeatCountdownRef.current = 60;
    setDefeatCountdown(60);
  }, [alive, mode, startFloor]);

  // Contagem regressiva da derrota
  useEffect(() => {
    if (defeatCountdown === null) return;

    if (defeatCountdown <= 0) {
      defeatCountdownRef.current = null;
      setDefeatCountdown(null);
      setMode('farm');
      modeRef.current = 'farm';
      persist();
      const timer = window.setTimeout(() => startFloor(floorRef.current), 200);
      timers.current.push(timer);
      return;
    }

    const timer = window.setTimeout(() => {
      setDefeatCountdown((current) => (current === null ? null : current - 1));
    }, 1000);
    timers.current.push(timer);
    return () => window.clearTimeout(timer);
  }, [defeatCountdown, persist, startFloor]);

  const skipDefeatWait = useCallback(() => {
    if (defeatCountdownRef.current === null) return;
    defeatCountdownRef.current = 0;
    setDefeatCountdown(0);
  }, []);

  const allDead = wave.enemies.every((enemy) => (enemyHp[enemy.id] ?? 0) <= 0);



  // Fim de wave / chefe derrotado / loop de farm — roda em CADA tela
  // (combate individual: cada um simula as próprias waves).
  useEffect(() => {
    if (!allDead || resolvedWave.current === waveKey) return;
    resolvedWave.current = waveKey;

    // Credita XP/ouro da wave (idempotente por wave via resolvedWave guard)
    creditArenaRewards();

    const isBossWave = wave.enemies.some((enemy) => enemy.kind === 'boss');

    if (!isBossWave) {
      const nextIndex = waveIndex + 1;
      const farmEnded = mode === 'farm' && nextIndex >= FARM_WAVES;

      if (farmEnded) {
        // Farm: nunca enfrenta o chefe — reinicia na wave 1 (loop)
        const timer = window.setTimeout(() => startFloor(floorRef.current), 2400);
        timers.current.push(timer);
        return () => window.clearTimeout(timer);
      }

      const timer = window.setTimeout(() => {
        setWaveIndex(nextIndex);
        setWaveKey((current) => current + 1);
        setEnemyHp(enemyHpMap(waves[nextIndex]));
        setHeroHp((previous) => {
          const next = { ...previous };
          for (const hero of heroesRef.current) {
            if (!(aliveRef.current[hero.id] ?? true)) continue;
            next[hero.id] = Math.min(hero.maxHp, (next[hero.id] ?? 0) + hero.maxHp * 0.25);
          }
          return next;
        });
      }, 2400);
      timers.current.push(timer);
      return () => window.clearTimeout(timer);
    }

    // Chefe derrotado — só acontece na progressão
    const timer = window.setTimeout(() => {
      setBossDefeated(true);
      bossDefeatedRef.current = true;
      setCheerNonce((current) => current + 1);

      const newHighest = Math.max(highestCleared, floor);
      setHighestCleared(newHighest);
      highestClearedRef.current = newHighest;
      persist();
      // Recorde pessoal: nunca rebaixa (co-op pode ter andar menor que o
      // melhor solo do próprio personagem — ex.: líder forte farmando junto).
      if (newHighest > (characterRef.current?.tower_floor ?? 1)) {
        void syncTowerFloor(newHighest);
      }
      const bossName = wave.enemies.find((enemy) => enemy.kind === 'boss')?.name ?? 'Chefe';
      pushNotice(`🏆 ${bossName} derrotado — Andar ${floor} concluído`);

      if (mode === 'advance') {
        // Portal abre junto com a vitória; espera 5s (para ver a animação e o
        // painel de dano) antes de subir de andar.
        const delay = window.setTimeout(() => startFloor(floorRef.current + 1), 5000);
        timers.current.push(delay);
      }
    }, 1300);
    timers.current.push(timer);
    return () => window.clearTimeout(timer);
  }, [allDead, waveKey, waveIndex, waves, highestCleared, floor, mode, persist, syncTowerFloor, startFloor, pushNotice, creditArenaRewards]);

  // Farm: loop das waves 1–9 no mesmo andar
  const handleFarmHere = useCallback(() => {
    setMode('farm');
    modeRef.current = 'farm';
    pushNotice('🌿 Farm ativado — loop das waves 1–9');
    // Continua da wave atual; se estava na wave do chefe (fora do alcance do
    // farm), retoma na última wave do farm.
    const current = waveIndexRef.current;
    const resume = Math.min(current, FARM_WAVES - 1);
    startFloor(floorRef.current, { resumeWave: Math.max(0, resume) });
    persist();
  }, [persist, startFloor, pushNotice]);

  // Progressão: segue até o chefe e sobe de andar
  // Progressão a partir da wave atual (não recomeça o andar)
  const handleStartAdvance = useCallback(() => {
    setMode('advance');
    modeRef.current = 'advance';
    pushNotice('⚔️ Avanço ativado — a party vai até o chefe e sobe de andar');
    startFloor(floorRef.current, { resumeWave: waveIndexRef.current });
    persist();
  }, [persist, startFloor, pushNotice]);

  /** Salva os 4 slots de auto-cast de cada membro no banco (operation_keys). */
  const saveSkillSlotsToDb = useCallback(
    async (slots: Record<string, string[]>) => {
      if (characterId === 'demo') return;

      const { error } = await supabase
        .from('operation_keys')
        .upsert(
          {
            idempotency_key: skillSlotsKey(characterId),
            character_id: characterId,
            kind: SKILL_SLOTS_KIND,
            result_json: { slots },
          },
          { onConflict: 'idempotency_key' },
        );

      if (error) console.error('[arena] erro ao salvar slots de skill:', error.message);
    },
    [characterId],
  );

  const setSkillSlot = useCallback(
    (memberId: string, index: number, skillId: string | null) => {
      const current = [...(skillSlotsRef.current[memberId] ?? [])];
      while (current.length < SKILL_SLOTS) current.push('');

      if (skillId) current[index] = skillId;
      else current[index] = '';

      const next = { ...skillSlotsRef.current, [memberId]: current };
      skillSlotsRef.current = next;
      setSkillSlots(next);

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(
          `aetheria_arena_skills_${characterId}`,
          JSON.stringify(next),
        );
      }

      void saveSkillSlotsToDb(next);
    },
    [characterId],
  );

  const handleSelectCharacter = useCallback(
    async (chosen: Character) => {
      setSelectBusy(chosen.id);
      try {
        window.localStorage.setItem('aetheria_char_id', chosen.id);
        const params = new URLSearchParams(window.location.search);
        await applyCharacterData(chosen, params, () => false);
        setShowSelect(false);
        setShowCreate(false);
      } catch (err) {
        console.error('[arena] falha ao entrar com o personagem', err);
        try {
          window.localStorage.setItem(
            'aetheria_last_error',
            JSON.stringify({
              type: 'select-character',
              message: String((err as Error)?.message ?? err),
              stack: (err as Error)?.stack,
              url: window.location.href,
              ts: new Date().toISOString(),
            }),
          );
        } catch {}
        alert('Não foi possível carregar este personagem. Tente novamente.');
      } finally {
        setSelectBusy(null);
      }
    },
    [applyCharacterData],
  );

  const handleCreateCharacter = useCallback(async () => {
    const cleanName = createName.trim().replace(/[^a-zA-Z0-9]/g, '');
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
      const raced = applyRaceModifiers(baseStats, createRace as RaceId);
      const { data, error } = await supabase
        .from('characters')
        .insert([
          {
            account_id: account.id,
            name: cleanName,
            class_name: 'Aprendiz',
            race: createRace,
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
        window.localStorage.setItem('aetheria_char_id', data.id);
        const created = data as Character;
        setAvailableCharacters((prev) => [...prev, created]);
        setCreateName('');
        setShowCreate(false);
        setShowSelect(false);
        await handleSelectCharacter(created);
      }
    } catch (err) {
      console.error('Erro inesperado ao criar personagem:', err);
      alert('Erro de conexão ao criar personagem.');
    } finally {
      setCreating(false);
    }
  }, [createName, createRace, router, handleSelectCharacter]);

  const handleDeleteCharacter = useCallback(async (id: string) => {
    if (!window.confirm('Deletar este personagem? Esta ação não pode ser desfeita.')) return;
    try {
      await supabase.from('inventory').delete().eq('character_id', id);
      await supabase.from('operation_keys').delete().eq('character_id', id);
      await supabase.from('characters').delete().eq('id', id);
      const wasActive = id === characterId;
      if (wasActive) {
        window.localStorage.removeItem('aetheria_char_id');
      }
      // Na tela de seleção a lista é atualizada no lugar (sem recarregar).
      if (showSelect) {
        const remaining = availableCharacters.filter((entry) => entry.id !== id);
        setAvailableCharacters(remaining);
        if (remaining.length === 0) {
          setShowSelect(false);
          setShowCreate(true);
        }
        return;
      }
      window.location.reload();
    } catch (err) {
      console.error('Erro ao deletar personagem:', err);
      alert('Erro ao deletar personagem.');
    }
  }, [characterId, showSelect, availableCharacters]);

  const handleSwitchCharacter = useCallback((id: string) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('aetheria_char_id', id);
    window.location.reload();
  }, []);

  const handleLogout = useCallback(async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      pushNotice('⚠️ Não foi possível sair da conta.');
      return;
    }

    clearLocalSession();
    router.replace('/login');
  }, [pushNotice, router]);

  const setPosition = useCallback(
    (id: string, position: Position) => {
      setPositions((previous) => ({ ...previous, [id]: position }));
      setHeroes((previous) =>
        previous.map((hero) => {
          if (hero.id !== id) return hero;
          return {
            ...hero,
            positionRole: position,
            position: fieldPosition(hero.position[0], position),
          };
        }),
      );
      persistPartyConfig([{ id, position }]);
    },
    [persistPartyConfig],
  );

  const toggleAutoCast = useCallback(
    (id: string) => {
      const next = !(autoCastMapRef.current[id] ?? true);
      setAutoCastMap((previous) => ({ ...previous, [id]: next }));
      setHeroes((previous) =>
        previous.map((hero) => (hero.id === id ? { ...hero, autoCast: next } : hero)),
      );
      persistPartyConfig([{ id, autoCast: next }]);
    },
    [persistPartyConfig],
  );

  const changeBotClass = useCallback(
    (id: string, classId: string) => {
      const template = getBotTemplates().find((candidate) => candidate.classId === classId);
      const current = heroesRef.current.find((hero) => hero.id === id);
      if (!template || !current) return;

      const rebuilt = buildBotHero(
        template,
        current.level,
        id as HeroId,
        positionsRef.current[id] ?? current.positionRole,
        autoCastMapRef.current[id] ?? true,
      );
      const ratio = current.maxHp > 0 ? (heroHpRef.current[id] ?? current.maxHp) / current.maxHp : 1;

      setHeroes((previous) => previous.map((hero) => (hero.id === id ? rebuilt : hero)));
      setHeroHp((previous) => ({
        ...previous,
        [id]: Math.max(1, Math.round(rebuilt.maxHp * ratio)),
      }));
      setHeroSd((previous) => ({ ...previous, [id]: rebuilt.sd }));
      setHeroMp((previous) => ({ ...previous, [id]: rebuilt.mp }));
      setBotClasses((previous) => ({ ...previous, [id]: classId }));
      persistPartyConfig([{ id, classId }]);
    },
    [persistPartyConfig],
  );

  // Herói local: combate individual — o "eu" é sempre o knight do próprio
  // personagem (o squad de cada tela é o do dono da tela).
  const localHero = selfHero();
  const selfHeroId = localHero?.id ?? 'knight';

  const anyEnemyAlive = wave.enemies.some((enemy) => (enemyHp[enemy.id] ?? enemy.maxHp) > 0);
  const anyHeroAlive = heroes.some((hero) => (alive[hero.id] ?? true) && (heroHp[hero.id] ?? 0) > 0);
  const combat = anyEnemyAlive && anyHeroAlive && defeatCountdown === null;
  const boss = wave.enemies.find((enemy) => enemy.kind === 'boss') ?? null;
  const bossHp = boss ? (enemyHp[boss.id] ?? boss.maxHp) : 0;
  const portalOpen = bossDefeated || preview;
  const floorName = `Andar ${floor}`;
  const biome = getFloor(floor).biome;

  if (showSelect) {
    const RACE_LABEL: Record<string, string> = {
      humano: 'Humano',
      anao: 'Anão',
      elfo: 'Elfo',
      goblin: 'Goblin',
      orc: 'Orc',
      morto_vivo: 'Morto-vivo',
      troll: 'Troll',
      tauren: 'Tauren',
      pandaren: 'Pandaren',
    };
    const activeId =
      typeof window !== 'undefined' ? window.localStorage.getItem('aetheria_char_id') : null;
    return (
      <ErrorBoundary>
        <div
          className={styles.loading}
          style={{ padding: 24, overflow: 'auto', pointerEvents: 'auto' }}
        >
          <div
            style={{
              maxWidth: 560,
              margin: '0 auto',
              background: 'rgba(10,14,24,0.92)',
              border: '1px solid #334155',
              borderRadius: 16,
              padding: 24,
            }}
          >
            <div className={styles.loadingTitle} style={{ marginBottom: 8 }}>
              SELECIONAR PERSONAGEM
            </div>
            <div className={styles.loadingSub} style={{ marginBottom: 16 }}>
              Escolha um herói para entrar na arena.
            </div>

            <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
              {availableCharacters.map((char) => {
                const busy = selectBusy === char.id;
                const active = char.id === activeId;
                return (
                  <div
                    key={char.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: active ? '2px solid #f59e0b' : '1px solid #334155',
                      background: active ? 'rgba(245,158,11,0.12)' : 'rgba(15,23,42,0.6)',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#e2e8f0' }}>
                        {char.name}
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.7, color: '#94a3b8' }}>
                        {char.class_name} · Nv. {char.level} · {RACE_LABEL[char.race] ?? char.race}
                        {active ? ' · ativo' : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleSelectCharacter(char)}
                      disabled={selectBusy !== null}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 8,
                        border: 'none',
                        background: busy ? '#475569' : '#22c55e',
                        color: '#04120c',
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: selectBusy ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {busy ? 'ENTRANDO...' : 'JOGAR'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteCharacter(char.id)}
                      disabled={selectBusy !== null}
                      title="Deletar personagem"
                      style={{
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid #7f1d1d',
                        background: 'transparent',
                        color: '#f87171',
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: selectBusy ? 'not-allowed' : 'pointer',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => {
                setShowSelect(false);
                setShowCreate(true);
              }}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 8,
                border: 'none',
                background: '#f59e0b',
                color: '#0b0f1a',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              + CRIAR PERSONAGEM
            </button>
            <button
              type="button"
              onClick={handleLogout}
              style={{
                width: '100%',
                marginTop: 8,
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid #334155',
                background: 'transparent',
                color: '#94a3b8',
                cursor: 'pointer',
              }}
            >
              Sair da conta
            </button>
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  if (showCreate) {
    const RACES = [
      { id: 'humano', name: 'Humano', desc: 'Versátil, ganho extra de ouro e XP.' },
      { id: 'anao', name: 'Anão', desc: 'Alta defesa e bônus na forja de itens.' },
      { id: 'elfo', name: 'Elfo', desc: 'Foco em agilidade, esquiva e crítico.' },
      { id: 'goblin', name: 'Goblin', desc: 'Vantagens comerciais e bônus de venda.' },
      { id: 'orc', name: 'Orc', desc: 'Poder de ataque físico e dano crítico elevados.' },
      { id: 'morto_vivo', name: 'Morto-vivo', desc: 'Regenera vida drenando os inimigos.' },
      { id: 'troll', name: 'Troll', desc: 'Velocidade de ataque extrema em momentos críticos.' },
      { id: 'tauren', name: 'Tauren', desc: 'Vida máxima colossal e força física bruta.' },
      { id: 'pandaren', name: 'Pandaren', desc: 'Equilíbrio espiritual, regeneração de MP e poções.' },
    ];
    return (
      <ErrorBoundary>
      <div className={styles.loading} style={{ padding: 24, overflow: 'auto', pointerEvents: 'auto' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', background: 'rgba(10,14,24,0.92)', border: '1px solid #334155', borderRadius: 16, padding: 24 }}>
          <div className={styles.loadingTitle} style={{ marginBottom: 8 }}>CRIAR PERSONAGEM</div>
          <div className={styles.loadingSub} style={{ marginBottom: 16 }}>Crie seu herói para entrar na arena.</div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 320px', minWidth: 280 }}>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 6, opacity: 0.8 }}>Nome do Herói</label>
          <input
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="Ex: Arthas"
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0b0f1a', color: '#e2e8f0', marginBottom: 16 }}
          />
          <label style={{ display: 'block', fontSize: 12, marginBottom: 6, opacity: 0.8 }}>Escolha a Raça</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))', gap: 8, marginBottom: 16 }}>
            {RACES.map((race) => (
              <button
                key={race.id}
                type="button"
                onClick={() => setCreateRace(race.id)}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  border: createRace === race.id ? '2px solid #f59e0b' : '1px solid #334155',
                  background: createRace === race.id ? 'rgba(245,158,11,0.15)' : 'rgba(15,23,42,0.6)',
                  color: '#e2e8f0',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 12 }}>{race.name}</div>
                <div style={{ fontSize: 9, opacity: 0.7, marginTop: 2 }}>{race.desc}</div>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleCreateCharacter}
            disabled={creating}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: 8,
              border: 'none',
              background: creating ? '#475569' : '#f59e0b',
              color: '#0b0f1a',
              fontWeight: 700,
              cursor: creating ? 'not-allowed' : 'pointer',
            }}
          >
            {creating ? 'Criando...' : 'CRIAR E ENTRAR NA ARENA'}
          </button>
          {availableCharacters.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setShowSelect(true);
              }}
              style={{ width: '100%', marginTop: 8, padding: '8px 16px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#e2e8f0', cursor: 'pointer' }}
            >
              ← Voltar para seleção
            </button>
          )}
          <button
            type="button"
            onClick={() => { window.localStorage.removeItem('aetheria_char_id'); router.replace('/login'); }}
            style={{ width: '100%', marginTop: 8, padding: '8px 16px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}
          >
            Voltar ao login
          </button>
          </div>
          <div style={{ flex: '1 1 320px', minWidth: 280 }}>
            <RacePreview3D raceId={createRace} />
            <div style={{ marginTop: 8, fontSize: 10, color: '#64748b', textAlign: 'center' }}>
              {RACES.find((r) => r.id === createRace)?.name ?? createRace}
              {getRaceHeroAsset(createRace)
                ? ` · modelo real · ${(getRaceHeroAsset(createRace)?.height ?? 1.8).toFixed(2)} m`
                : ' · avatar estilizado'}
            </div>
          </div>
          </div>
        </div>
      </div>
      </ErrorBoundary>
    );
  }

  return (
    <div className={styles.shell}>
      <div className={styles.stage}>
        <ArenaErrorBoundary onError={(message) => setFatal(message)}>
          <ArenaExperience
          auto={auto}
          speed={speed}
          waveKey={waveKey}
          heroes={heroes}
          alive={alive}
          autoCast={autoCastMap}
          hitNonce={hitNonce}
          enemies={wave.enemies}
          enemyHp={enemyHp}
          labels={labels}
          bolts={bolts}
          combat={combat}
          frozen={defeatCountdown !== null}
          victory={bossDefeated}
          portalOpen={portalOpen}
          cheerNonce={cheerNonce}
          // Combate individual: cada tela anima os PRÓPRIOS ataques.
          onHeroAttack={onHeroAttack}
          onEnemyAttack={onEnemyAttack}
          />
        </ArenaErrorBoundary>
      </div>

      <Hud
        heroes={heroes}
        heroHp={heroHp}
        heroMp={heroMp}
        alive={alive}
        positions={positions}
        autoCastMap={autoCastMap}
        botClasses={botClasses}
        floor={floor}
        floorName={floorName}
        biome={biome}
        wave={wave}
        totalWaves={waves.length}
        boss={bossHp > 0 ? boss : null}
        bossHp={bossHp}
        enemyHp={enemyHp}
        bossDefeated={bossDefeated}
        mode={mode}
        auto={auto}
        speed={speed}
        expGained={expGained}
        goldGained={goldGained}
        characterLevel={character?.level ?? heroes[0]?.level ?? 1}
        characterExp={character?.exp ?? 0}
        creditedExp={creditedExp}
        preview={preview}
        dataReady={dataReady}
        meter={meter}
        elapsedMs={elapsedMs}
        notice={notice}
        defeatCountdown={defeatCountdown}
        bossTelegraph={bossTelegraph}
        onSkipDefeatWait={skipDefeatWait}
        onToggleAuto={() => setAuto((current) => !current)}
        onCycleSpeed={() => setSpeed((current) => (current === 1 ? 2 : current === 2 ? 3 : 1))}
        onOpenMenu={() => setMenuOpen(true)}
        onSetPosition={setPosition}
        onToggleAutoCast={toggleAutoCast}
        onChangeBotClass={changeBotClass}
        onFarmHere={handleFarmHere}
        onStartAdvance={handleStartAdvance}
        availableCharacters={availableCharacters}
        onSwitchCharacter={handleSwitchCharacter}
        onDeleteCharacter={handleDeleteCharacter}
        onCreateCharacter={() => setShowCreate(true)}
        onLogout={handleLogout}
        onOpenParty={characterId !== 'demo' ? () => setPartyOpen(true) : undefined}
        // Co-op: mates reais aparecem ao vivo via vitals (HP/MP em tempo real).
        liveMates={liveMates}
        selfHeroId={selfHeroId}
      />

      {/* Modal do ganho offline (Fase P2): comprovante da liquidação no servidor. */}
      {offlineSettlement && (
        <div
          className={styles.menuOverlay}
          onClick={() => setOfflineSettlement(null)}
        >
          <div className={styles.menuPanel} onClick={(event) => event.stopPropagation()}>
            <div className={styles.menuHeader}>
              <span className={styles.combatTitle}>ENQUANTO VOCÊ ESTAVA FORA…</span>
              <button
                type="button"
                className={styles.menuClose}
                onClick={() => setOfflineSettlement(null)}
                title="Fechar"
              >
                ✕
              </button>
            </div>
            <div className={styles.menuBody}>
              <p
                style={{
                  textAlign: 'center',
                  fontSize: 15,
                  margin: '0 0 14px',
                  opacity: 0.85,
                }}
              >
                Seu herói lutou sozinho por{' '}
                <b style={{ color: '#7ec8ff' }}>
                  {formatOfflineDuration(offlineSettlement.seconds)}
                </b>
                .
              </p>
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  justifyContent: 'center',
                  marginBottom: 14,
                  flexWrap: 'wrap',
                }}
              >
                <span
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.08)',
                    fontSize: 13,
                  }}
                >
                  ⚔️ +{offlineSettlement.xp.toLocaleString('pt-BR')} XP
                </span>
                <span
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.08)',
                    fontSize: 13,
                  }}
                >
                  🪙 +{offlineSettlement.gold.toLocaleString('pt-BR')} ouro
                </span>
                {offlineSettlement.levelAfter > offlineSettlement.levelBefore && (
                  <span
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      background: 'rgba(60,140,255,0.25)',
                      border: '1px solid rgba(126,200,255,0.6)',
                      fontSize: 13,
                    }}
                  >
                    🆙 Nível {offlineSettlement.levelBefore} → {offlineSettlement.levelAfter} 🔥
                    {offlineSettlement.levelAfter - offlineSettlement.levelBefore} níveis
                  </span>
                )}
              </div>
              <button
                type="button"
                className={styles.defeatButton}
                onClick={() => setOfflineSettlement(null)}
              >
                COLETAR
                <span>recompensas já creditadas</span>
              </button>
              <p style={{ textAlign: 'center', opacity: 0.55, fontSize: 11, marginTop: 10 }}>
                Cap offline: 12h (24h com assinatura premium)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Painel de party/squad multiplayer (Fase P2). */}
      <PartyPanel
        open={partyOpen}
        onClose={() => setPartyOpen(false)}
        characterId={characterId}
        characterName={character?.name ?? heroes[0]?.name ?? ''}
        towerFloor={character?.tower_floor ?? 1}
      />

      <ArenaMenu
        open={menuOpen}
        tab={menuTab}
        onTab={setMenuTab}
        onClose={() => setMenuOpen(false)}
        character={character}
        inventory={inventory}
        heroes={heroes}
        onToggleEquip={toggleEquip}
        onToggleStash={toggleStash}
        onAddStat={addStatPoint}
        onBuyPotion={buyPotion}
        onSellItems={sellItems}
        onRefine={refineItem}
        skillSlots={skillSlots}
        onSetSlot={setSkillSlot}
      />

      <LoadingVeil
        visible
        fatal={fatal}
        onRetry={() => window.location.reload()}
      />
    </div>
  );
}
