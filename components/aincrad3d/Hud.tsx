'use client';

import { useEffect, useMemo, useState } from 'react';
import { getBotTemplates } from '@/lib/aiSquad';
import type { Character } from '@/lib/types/core';
import type { EnemyDef, HeroDef, MemberMeter, WaveDef } from './data';
import DamageMeter from './DamageMeter';
import styles from './Arena.module.css';

type Mode = 'farm' | 'advance';
type Position = 'front' | 'mid' | 'back';

// Integrante real da party, sincronizado ao vivo via Supabase Realtime
// (presence): HP/MP do combate DELE, nível e andar atual.
export type LiveMate = {
  id: string;
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  towerFloor: number;
};

type HudProps = {
  heroes: HeroDef[];
  heroHp: Record<string, number>;
  heroMp: Record<string, number>;
  alive: Record<string, boolean>;
  positions: Record<string, Position>;
  autoCastMap: Record<string, boolean>;
  botClasses: Record<string, string>;
  floor: number;
  floorName: string;
  biome: string;
  wave: WaveDef;
  totalWaves: number;
  boss: EnemyDef | null;
  bossHp: number;
  enemyHp: Record<string, number>;
  bossDefeated: boolean;
  mode: Mode;
  auto: boolean;
  speed: number;
  expGained: number;
  goldGained: number;
  characterLevel: number;
  characterExp: number;
  creditedExp: number;
  preview: boolean;
  dataReady: boolean;
  meter: Record<string, MemberMeter>;
  elapsedMs: number;
  notice: string | null;
  defeatCountdown: number | null;
  bossTelegraph?: { skillName: string; progress: number } | null;
  onSkipDefeatWait: () => void;
  onToggleAuto: () => void;
  onCycleSpeed: () => void;
  onOpenMenu: () => void;
  onSetPosition: (id: string, position: Position) => void;
  onToggleAutoCast: (id: string) => void;
  onChangeBotClass: (id: string, classId: string) => void;
  onFarmHere: () => void;
  onStartAdvance: () => void;
  availableCharacters: Character[];
  onSwitchCharacter: (id: string) => void;
  onDeleteCharacter?: (id: string) => void;
  onCreateCharacter?: () => void;
  onLogout: () => void;
  onOpenParty?: () => void;
  liveMates?: LiveMate[];
  /** Herói do jogador LOCAL (marcação "(você)" no squad). */
  selfHeroId?: string;
};

function Bar({
  label,
  value,
  max,
  className,
}: {
  label: string;
  value: number;
  max: number;
  className: string;
}) {
  const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={styles.statBar}>
      <div className={`${styles.statBarTrack} ${className}`}>
        <i style={{ width: `${percent}%` }} />
      </div>
      <span className={styles.statBarText}>
        {label} {Math.round(value)} / {Math.round(max)}
      </span>
    </div>
  );
}

function SquadRow({
  hero,
  hp,
  mp,
  position,
  autoCast,
  classId,
  isSelf,
  onSetPosition,
  onToggleAutoCast,
  onChangeBotClass,
}: {
  hero: HeroDef;
  hp: number;
  mp: number;
  position: Position;
  autoCast: boolean;
  classId: string;
  isSelf?: boolean;
  onSetPosition: (id: string, position: Position) => void;
  onToggleAutoCast: (id: string) => void;
  onChangeBotClass: (id: string, classId: string) => void;
}) {
  const dead = hp <= 0;
  const hpPercent = dead ? 0 : Math.max(0, Math.min(100, (hp / hero.maxHp) * 100));
  const mpPercent = dead ? 0 : Math.max(0, Math.min(100, (mp / hero.maxMp) * 100));

  return (
    <div className={`${styles.squadRow} ${dead ? styles.squadRowDead : ''}`}>
      <span className={styles.squadIcon}>{isSelf ? '👑' : hero.isPlayer ? '⭐' : '🤖'}</span>
      <div className={styles.squadMain}>
        <div className={styles.squadHead}>
          <span className={styles.squadName}>
            {hero.name}
            {isSelf ? ' (você)' : ''}
          </span>
          <span className={styles.squadNumbers}>{dead ? '☠️ KO' : `${Math.round(hp)}/${hero.maxHp}`}</span>
        </div>

        <div className={styles.squadBars}>
          <div className={styles.squadBarTrack}>
            <i
              className={
                hpPercent > 50 ? styles.squadHp : hpPercent > 25 ? styles.squadHpMid : styles.squadHpLow
              }
              style={{ width: `${hpPercent}%` }}
            />
          </div>
          <div className={styles.squadMpTrack}>
            <i style={{ width: `${mpPercent}%` }} />
          </div>
        </div>

        <div className={styles.squadControls}>
          {!hero.isPlayer && (
            <select
              className={styles.squadSelect}
              value={classId}
              onChange={(event) => onChangeBotClass(hero.id, event.target.value)}
              title="Classe do bot"
            >
              {getBotTemplates().map((template) => (
                <option key={template.classId} value={template.classId}>
                  {template.className}
                </option>
              ))}
            </select>
          )}

          <select
            className={styles.squadSelect}
            value={position}
            onChange={(event) => onSetPosition(hero.id, event.target.value as Position)}
            title="Posição na formação"
          >
            <option value="front">⚔️ Front</option>
            <option value="mid">🛡️ Mid</option>
            <option value="back">✨ Back</option>
          </select>

          <button
            type="button"
            className={`${styles.autoCastBtn} ${autoCast ? styles.autoCastOn : ''}`}
            onClick={() => onToggleAutoCast(hero.id)}
            title={autoCast ? 'Auto-cast ATIVADO' : 'Auto-cast DESATIVADO'}
          >
            {autoCast ? 'AUTO' : 'MANUAL'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Hud({
  heroes,
  heroHp,
  heroMp,
  alive,
  positions,
  autoCastMap,
  botClasses,
  floor,
  floorName,
  biome,
  wave,
  totalWaves,
  boss,
  bossHp,
  enemyHp,
  bossDefeated,
  mode,
  auto,
  speed,
  expGained,
  characterLevel,
  characterExp,
  creditedExp,
  preview,
  dataReady,
  meter,
  elapsedMs,
  notice,
  defeatCountdown,
  bossTelegraph,
  onSkipDefeatWait,
  onToggleAuto,
  onCycleSpeed,
  onOpenMenu,
  onSetPosition,
  onToggleAutoCast,
  onChangeBotClass,
  onFarmHere,
  onStartAdvance,
  availableCharacters,
  onSwitchCharacter,
  onDeleteCharacter,
  onCreateCharacter,
  onLogout,
  onOpenParty,
  liveMates,
  selfHeroId,
}: HudProps) {
  const bossPercent = boss ? Math.max(0, Math.min(100, (bossHp / boss.maxHp) * 100)) : 0;
  // XP da barra: usa o nivel PERSISTIDO (igual ao HUD/menu/DB) + o XP de
  // sessao ainda nao creditado. Evita "nivel simulado" que nao persiste.
  const uncreditedExp = Math.max(0, expGained - creditedExp);
  const need = Math.max(1, characterLevel) * 100;
  const effectiveExp = Math.min(need - 1, Math.max(0, characterExp) + uncreditedExp);
  const xpProgress = {
    level: Math.max(1, Math.floor(characterLevel)),
    exp: effectiveExp,
    need,
    pct: Math.max(0, Math.min(100, (effectiveExp / need) * 100)),
  };
  // Jogador LOCAL: no co-op guest o squad vem do host, então o card e o chip
  // de conta mostram o herói do própio personagem (cópia no squad), não o líder.
  const player =
    heroes.find((hero) => hero.id === selfHeroId) ??
    heroes.find((hero) => hero.isPlayer) ??
    heroes[0];
  const displayTotalWaves = mode === 'farm' ? 9 : totalWaves;
  const [squadCollapsed, setSquadCollapsed] = useState(false);
  const [meterCollapsed, setMeterCollapsed] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [pickingCharacter, setPickingCharacter] = useState(false);

  useEffect(() => {
    if (window.innerWidth < 720) {
      setSquadCollapsed(true);
      setMeterCollapsed(true);
    }
  }, []);

  // Na derrota no avanço (janela de análise de 60s) abre o painel de dano
  useEffect(() => {
    if (defeatCountdown !== null) setMeterCollapsed(false);
  }, [defeatCountdown]);

  return (
    <div className={styles.hud}>
      <div className={styles.topbar}>
        <a className={styles.brand} href="/" title="Voltar ao jogo">
          <span className={styles.brandMark}>A</span>
          <span className={styles.brandText}>
            <span className={styles.brandTitle}>AINCRAD</span>
            <span className={styles.brandSub}>
              {floorName.toUpperCase()} · {biome.toUpperCase()}
            </span>
          </span>
        </a>

        <div className={styles.wavePill}>
          {/* andar sempre visível (no mobile a brandSub some) */}
          <span className={styles.waveFloor}>ANDAR {floor}</span>
          {boss ? 'CHEFE' : 'WAVE'} <b>{wave.index}</b>
          <span>/ {displayTotalWaves}</span>
        </div>

        <div className={styles.controls}>
          <div className={styles.accountWrap}>
            <button
              type="button"
              className={styles.accountButton}
              onClick={() => setAccountOpen((current) => !current)}
              title="Conta e personagem"
            >
              👤 <span className={styles.accountLabel}>{player?.name?.slice(0, 10) ?? '—'}</span>
            </button>
            {accountOpen && (
              <div className={styles.accountMenu}>
                <span className={styles.accountName}>
                  {player?.name} · Lv. {player?.level} · {player?.className}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAccountOpen(false);
                    setPickingCharacter(true);
                  }}
                >
                  Trocar personagem
                </button>
                <a href="/">Voltar ao jogo</a>
                <button type="button" className={styles.logoutButton} onClick={onLogout}>
                  Sair da conta
                </button>
              </div>
            )}
          </div>

          {onOpenParty && (
            <button
              type="button"
              className={styles.menuButton}
              onClick={onOpenParty}
              title="Party / squad multiplayer"
            >
              👥 PARTY
            </button>
          )}
          <button
            type="button"
            className={styles.menuButton}
            onClick={onOpenMenu}
            title="Status, bolsa, depósito e combate"
          >
            ☰ MENU
          </button>
          <button type="button" className={auto ? styles.on : ''} onClick={onToggleAuto}>
            {auto ? 'AUTO' : 'PAUSAR'}
          </button>
          <button type="button" onClick={onCycleSpeed}>
            {speed}×
          </button>
        </div>
      </div>

      {bossTelegraph && (
        <div
          style={{
            position: 'absolute',
            top: '56px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'min(420px, 80vw)',
            zIndex: 20,
            background: 'rgba(30,0,0,0.85)',
            border: '1px solid #ff5555',
            borderRadius: '8px',
            padding: '6px 10px',
            textAlign: 'center',
            color: '#ffaaaa',
            fontWeight: 600,
            fontSize: '12px',
          }}
        >
          <div style={{ marginBottom: 4 }}>
            ⚠️ {bossTelegraph.skillName} — telegrafia em andamento
          </div>
          <div
            style={{
              height: 6,
              width: '100%',
              background: 'rgba(255,255,255,0.15)',
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, bossTelegraph.progress * 100)}%`,
                background: '#ff5555',
                transition: 'width 0.1s linear',
              }}
            />
          </div>
        </div>
      )}

      <div className={styles.leftStack}>
        <div className={styles.ordersPanel}>
          <div className={styles.ordersHeader}>
            <span className={styles.ordersTitle}>ORDENS DE BATALHA</span>
          </div>
          <div className={styles.modeSwitch}>
            <button
              type="button"
              className={`${styles.modeBtn} ${mode === 'farm' ? styles.modeBtnOn : ''}`}
              onClick={onFarmHere}
              disabled={mode === 'farm'}
            >
              FARM
            </button>
            <button
              type="button"
              className={`${styles.modeBtn} ${mode === 'advance' ? styles.modeBtnOn : ''}`}
              onClick={onStartAdvance}
              disabled={mode === 'advance'}
              title="Avanço: waves 1–10 com chefe, sobe de andar até ser derrotada"
            >
              AVANÇO
            </button>
          </div>
        </div>

        <DamageMeter
          heroes={heroes}
          meter={meter}
          elapsedMs={elapsedMs}
          collapsed={meterCollapsed}
          onToggleCollapsed={() => setMeterCollapsed((current) => !current)}
        />
      </div>

      <div className={styles.squadPanel}>
        {player && (
          <div className={styles.playerCard}>
            <div className={styles.playerAvatar} style={{ background: player.color }}>
              {player.name.slice(0, 1)}
            </div>
            <div className={styles.playerBars}>
              <div className={styles.playerHead}>
                <span>{player.name}</span>
                <span>Lv. {player.level}</span>
                <span className={styles.playerCp}>CP {(player.cp / 1000).toFixed(1)} mil</span>
              </div>
              <Bar
                label="HP"
                value={heroHp[player.id] ?? player.maxHp}
                max={player.maxHp}
                className={styles.barHp}
              />
              <Bar
                label="MP"
                value={heroMp[player.id] ?? player.mp}
                max={player.maxMp}
                className={styles.barMp}
              />
            </div>
          </div>
        )}

        <div className={styles.squadTitle}>
          <button
            type="button"
            className={styles.squadToggle}
            onClick={() => setSquadCollapsed((current) => !current)}
            title={squadCollapsed ? 'Mostrar squad' : 'Ocultar squad'}
          >
            SQUAD
            <span className={squadCollapsed ? styles.chevDown : styles.chevUp}>▾</span>
          </button>
        </div>

        {!squadCollapsed &&
          heroes.map((hero) => (
            <SquadRow
              key={hero.id}
              hero={hero}
              hp={heroHp[hero.id] ?? hero.maxHp}
              mp={heroMp[hero.id] ?? hero.mp}
              position={positions[hero.id] ?? hero.positionRole}
              autoCast={autoCastMap[hero.id] ?? hero.autoCast}
              classId={botClasses[hero.id] ?? hero.classId ?? ''}
              isSelf={hero.id === selfHeroId}
              onSetPosition={onSetPosition}
              onToggleAutoCast={onToggleAutoCast}
              onChangeBotClass={onChangeBotClass}
            />
          ))}

        {(liveMates?.length ?? 0) > 0 && (
          <>
            <div className={styles.squadTitle}>
              <span className={styles.squadToggle} style={{ opacity: 0.85, cursor: 'default' }}>
                👥 PARTY · AO VIVO
              </span>
            </div>
            {!squadCollapsed &&
              liveMates!.map((mate) => {
                const dead = mate.hp <= 0;
                const hpPercent = mate.maxHp > 0 ? Math.max(0, Math.min(100, (mate.hp / mate.maxHp) * 100)) : 0;
                const mpPercent = mate.maxMp > 0 ? Math.max(0, Math.min(100, (mate.mp / mate.maxMp) * 100)) : 0;
                return (
                  <div key={mate.id} className={`${styles.squadRow} ${dead ? styles.squadRowDead : ''}`}>
                    <span className={styles.squadIcon}>👤</span>
                    <div className={styles.squadMain}>
                      <div className={styles.squadHead}>
                        <span className={styles.squadName}>
                          {mate.name} · Nv. {mate.level} · A{mate.towerFloor}
                        </span>
                        <span className={styles.squadNumbers}>
                          {dead ? '☠️ KO' : `${Math.round(mate.hp)}/${mate.maxHp}`}
                        </span>
                      </div>
                      <div className={styles.squadBars}>
                        <div className={styles.squadBarTrack}>
                          <i
                            className={
                              hpPercent > 50
                                ? styles.squadHp
                                : hpPercent > 25
                                  ? styles.squadHpMid
                                  : styles.squadHpLow
                            }
                            style={{ width: `${hpPercent}%` }}
                          />
                        </div>
                        <div className={styles.squadMpTrack}>
                          <i style={{ width: `${mpPercent}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </>
        )}
      </div>

      {boss && (
        <div className={styles.bossWrap}>
          <div className={styles.bossLabel}>
            <b>{boss.name}</b>
            <span>Chefe do andar</span>
            <em>
              {Math.ceil(bossHp)} / {boss.maxHp}
            </em>
          </div>
          <div className={styles.bossBar}>
            <i style={{ width: `${bossPercent}%` }} />
          </div>
        </div>
      )}

      <div className={styles.waveBanner} key={`${floor}-${wave.index}`}>
        <span className={styles.waveKicker}>
          {boss ? 'BOSS FIGHT' : `WAVE ${wave.index}/${displayTotalWaves}`}
        </span>
        {(wave.index === 1 || boss) && <h2>{boss ? boss.name : floorName}</h2>}
      </div>

      {notice && <div className={styles.notice}>{notice}</div>}

      {defeatCountdown !== null && (
        <div className={styles.defeatOverlay}>
          <div className={styles.defeatCard}>
            <span className={styles.defeatKicker}>☠️ Derrota no desafio do chefe</span>
            <h3>
              Voltando para o modo farm em <b>{defeatCountdown}s</b>
            </h3>
            <p>
              Use este tempo para analisar o painel de batalha: DPS, participação, crítico, dano
              recebido e cura de cada membro da party.
            </p>
            <button type="button" className={styles.defeatButton} onClick={onSkipDefeatWait}>
              VOLTAR PARA O FARM AGORA
              <span>voltar em {defeatCountdown}s</span>
            </button>
          </div>
        </div>
      )}

      <div className={styles.bottomStack}>
        {/* Barra de XP — mesma régua do jogo original (level*100) */}
        <div
          className={styles.xpBar}
          role="progressbar"
          aria-label="Experiência"
          aria-valuenow={Math.round(xpProgress.pct)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className={styles.xpFill} style={{ width: `${xpProgress.pct}%` }} />
          <span className={styles.xpText}>
            NV {xpProgress.level} · XP {xpProgress.exp}/{xpProgress.need}
            {expGained > 0 ? ` (+${expGained.toLocaleString('pt-BR')} sessão)` : ''}
          </span>
        </div>

        <div className={styles.bottomHint} aria-live="polite">
          {!dataReady
            ? 'Carregando party...'
            : bossDefeated
              ? 'Chefe derrotado · portal aberto'
              : `Auto-battle · ${auto ? 'em andamento' : 'pausado'} · ${
                  mode === 'advance' ? 'avanço automático' : 'farm em loop'
                }`}
        </div>
      </div>

      {pickingCharacter && (
        <div className={styles.menuOverlay} onClick={() => setPickingCharacter(false)}>
          <div className={styles.menuPanel} onClick={(event) => event.stopPropagation()}>
            <div className={styles.menuHeader}>
              <span className={styles.combatTitle}>TROCAR PERSONAGEM</span>
              <button
                type="button"
                className={styles.menuClose}
                onClick={() => setPickingCharacter(false)}
                title="Fechar"
              >
                ✕
              </button>
            </div>
            <div className={styles.menuBody}>
              {availableCharacters.length === 0 && (
                <p className={styles.menuEmpty}>Nenhum personagem na conta.</p>
              )}
              {availableCharacters.map((option) => (
                <div key={option.id} style={{ display: 'flex', gap: 6, alignItems: 'stretch', marginBottom: 6 }}>
                  <button
                    type="button"
                    className={styles.charCard}
                    style={{ flex: 1, marginBottom: 0 }}
                    onClick={() => onSwitchCharacter(option.id)}
                  >
                    <span className={styles.charAvatar}>{(option.name ?? '?').slice(0, 1)}</span>
                    <span className={styles.charInfo}>
                      <b>{option.name}</b>
                      <em>
                        {option.class_name} · Nv. {option.level} · {option.race}
                      </em>
                    </span>
                    <span className={styles.charAction}>JOGAR</span>
                  </button>
                  {onDeleteCharacter && (
                    <button
                      type="button"
                      title="Deletar personagem"
                      onClick={() => onDeleteCharacter(option.id)}
                      style={{
                        padding: '0 12px',
                        background: 'rgba(180,40,40,0.25)',
                        border: '1px solid rgba(220,80,80,0.5)',
                        color: '#ff9a9a',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {onCreateCharacter && (
                <button
                  type="button"
                  className={styles.charCard}
                  style={{ justifyContent: 'center', marginTop: 8, background: 'rgba(60,140,255,0.15)', border: '1px dashed rgba(126,200,255,0.5)' }}
                  onClick={onCreateCharacter}
                >
                  <span className={styles.charAvatar}>+</span>
                  <span className={styles.charInfo}>
                    <b>Criar personagem</b>
                    <em>Novo herói na conta</em>
                  </span>
                  <span className={styles.charAction}>NOVO</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {preview && !bossDefeated && (
        <div className={styles.previewNote}>Prévia do portal · o vazio só abre ao derrotar o chefe</div>
      )}
    </div>
  );
}
