'use client';

import { useMemo, useState } from 'react';
import type { HeroDef, MemberMeter } from './data';
import styles from './Arena.module.css';

type Tab = 'dps' | 'taken' | 'healed';

type DamageMeterProps = {
  heroes: HeroDef[];
  meter: Record<string, MemberMeter>;
  elapsedMs: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return '0';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return `${Math.round(value)}`;
}

function formatTime(ms: number) {
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

const EMPTY: MemberMeter = {
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

export default function DamageMeter({
  heroes,
  meter,
  elapsedMs,
  collapsed,
  onToggleCollapsed,
}: DamageMeterProps) {
  const [tab, setTab] = useState<Tab>('dps');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const seconds = Math.max(1, elapsedMs / 1000);

  const rows = useMemo(() => {
    const totalDamage = heroes.reduce((sum, hero) => sum + (meter[hero.id]?.damage ?? 0), 0);
    return heroes
      .map((hero) => {
        const data = meter[hero.id] ?? EMPTY;
        const hits = data.autoHits + Object.values(data.skills).reduce((sum, skill) => sum + skill.hits, 0);
        const crits = data.autoCrits + Object.values(data.skills).reduce((sum, skill) => sum + skill.crits, 0);
        return {
          hero,
          data,
          damage: data.damage,
          dps: data.damage / seconds,
          share: totalDamage > 0 ? (data.damage / totalDamage) * 100 : 0,
          crit: hits > 0 ? (crits / hits) * 100 : 0,
          hits,
          crits,
        };
      })
      .sort((a, b) => b.damage - a.damage);
  }, [heroes, meter, seconds]);

  const totalDamage = rows.reduce((sum, row) => sum + row.damage, 0);
  const totalDps = totalDamage / seconds;
  const selected = rows.find((row) => row.hero.id === selectedId) ?? null;

  const skillRows = selected
    ? [
        ...(selected.data.autoHits > 0
          ? [
              {
                name: 'Auto Ataque',
                total: selected.data.autoDamage,
                hits: selected.data.autoHits,
                crits: selected.data.autoCrits,
                auto: true,
              },
            ]
          : []),
        ...Object.values(selected.data.skills)
          .map((skill) => ({ ...skill, auto: false }))
          .sort((a, b) => b.total - a.total),
      ]
    : [];

  return (
    <div className={styles.meterPanel}>
      <div className={styles.meterHeader}>
        <button
          type="button"
          className={styles.meterToggle}
          onClick={onToggleCollapsed}
          title={collapsed ? 'Expandir damage meter' : 'Recolher damage meter'}
        >
          <span className={styles.meterTitle}>
            Damage Meter <em>({formatTime(elapsedMs)})</em>
          </span>
          <span className={collapsed ? styles.chevDown : styles.chevUp}>▾</span>
        </button>
      </div>

      <div className={styles.meterSummary}>
        <span>Total {formatNumber(totalDamage)}</span>
        <b>{formatNumber(totalDps)} DPS</b>
      </div>

      {!collapsed && (
        <>
        <div className={styles.meterTabs}>
        <button
          type="button"
          className={tab === 'dps' ? styles.meterTabOn : ''}
          onClick={() => setTab('dps')}
        >
          DPS
        </button>
        <button
          type="button"
          className={tab === 'taken' ? styles.meterTabOn : ''}
          onClick={() => setTab('taken')}
        >
          Dano Recebido
        </button>
        <button
          type="button"
          className={tab === 'healed' ? styles.meterTabOn : ''}
          onClick={() => setTab('healed')}
        >
          Cura
        </button>
      </div>

      {tab === 'dps' ? (
        <>
          <div className={styles.meterTable}>
            <div className={styles.meterRowHead}>
              <span>Player</span>
              <span>DPS</span>
              <span>Share</span>
              <span>Damage</span>
              <span>Crit</span>
            </div>

            {rows.map((row) => (
              <button
                type="button"
                key={row.hero.id}
                className={`${styles.meterRow} ${selectedId === row.hero.id ? styles.meterRowOn : ''}`}
                onClick={() => setSelectedId(selectedId === row.hero.id ? null : row.hero.id)}
              >
                <span className={styles.meterName}>
                  <i style={{ background: row.hero.color }} />
                  {row.hero.name}
                </span>
                <span>{formatNumber(row.dps)}</span>
                <span>{row.share.toFixed(1)}%</span>
                <span>{formatNumber(row.damage)}</span>
                <span className={row.crit >= 40 ? styles.meterCritHigh : ''}>{row.crit.toFixed(0)}%</span>
              </button>
            ))}
          </div>

          {selected && (
            <div className={styles.meterDetail}>
              <div className={styles.meterDetailHead}>
                <span className={styles.meterDetailName}>{selected.hero.name}</span>
                <span className={styles.meterDetailClass}>{selected.hero.className}</span>
              </div>

              <div className={styles.meterDetailStats}>
                <div>
                  <span>DPS</span>
                  <b>{formatNumber(selected.dps)}</b>
                </div>
                <div>
                  <span>Damage</span>
                  <b>{formatNumber(selected.damage)}</b>
                </div>
                <div>
                  <span>Share</span>
                  <b>{selected.share.toFixed(1)}%</b>
                </div>
                <div>
                  <span>Crit</span>
                  <b>{selected.crit.toFixed(0)}%</b>
                </div>
              </div>

              <div className={styles.meterSkills}>
                <div className={styles.meterSkillHead}>
                  <span>Skill</span>
                  <span>Damage</span>
                  <span>DPS</span>
                  <span>Crit</span>
                </div>
                {skillRows.length === 0 && <div className={styles.meterEmpty}>Sem acertos registrados</div>}
                {skillRows.map((skill) => (
                  <div className={styles.meterSkillRow} key={skill.name}>
                    <span className={styles.meterSkillName}>
                      {skill.auto ? '⚔️' : '✨'} {skill.name}
                    </span>
                    <span>{formatNumber(skill.total)}</span>
                    <span>{formatNumber(skill.total / seconds)}</span>
                    <span>
                      {skill.hits > 0 ? ((skill.crits / skill.hits) * 100).toFixed(0) : '0'}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className={styles.meterTable}>
          <div className={styles.meterRowHead}>
            <span>Player</span>
            <span>{tab === 'taken' ? 'Recebido' : 'Curado'}</span>
            <span>Share</span>
            <span>Total</span>
            <span>Hits</span>
          </div>
          {rows.map((row) => {
            const value = tab === 'taken' ? row.data.taken : row.data.healed;
            const total = rows.reduce((sum, item) => sum + (tab === 'taken' ? item.data.taken : item.data.healed), 0);
            return (
              <div className={styles.meterRow} key={row.hero.id}>
                <span className={styles.meterName}>
                  <i style={{ background: row.hero.color }} />
                  {row.hero.name}
                </span>
                <span>{formatNumber(value)}</span>
                <span>{total > 0 ? ((value / total) * 100).toFixed(1) : '0.0'}%</span>
                <span>{formatNumber(total)}</span>
                <span>{tab === 'taken' ? row.data.takenHits : row.data.healHits}</span>
              </div>
            );
          })}
        </div>
      )}
        </>
      )}
    </div>
  );
}
