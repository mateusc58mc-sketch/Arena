'use client';

import { useMemo, useState } from 'react';
import { SKILLS, getClassPassives, getSkill, type SkillDefinition } from '@/lib/content/skills';
import { getSkillIcon } from '@/lib/skillIcons';
import type { HeroDef } from './data';
import styles from './Arena.module.css';

const SLOT_COUNT = 4;

type CombatPanelProps = {
  heroes: HeroDef[];
  slots: Record<string, string[]>;
  onSetSlot: (memberId: string, index: number, skillId: string | null) => void;
};

function SkillIconBadge({
  skill,
  classId,
  size = 30,
}: {
  skill: SkillDefinition;
  classId?: string;
  size?: number;
}) {
  const { emoji, color } = getSkillIcon(skill, classId);
  return (
    <span
      className={styles.skillIcon}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.58),
        borderColor: color,
        background: `radial-gradient(circle at 50% 30%, ${color}33, rgba(4, 8, 12, 0.9))`,
        boxShadow: `0 0 12px ${color}33`,
      }}
    >
      {emoji}
    </span>
  );
}

export default function CombatPanel({ heroes, slots, onSetSlot }: CombatPanelProps) {
  const [memberId, setMemberId] = useState<string>(heroes[0]?.id ?? '');
  const [pickingSlot, setPickingSlot] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const member = heroes.find((hero) => hero.id === memberId) ?? heroes[0];
  const memberSlots = slots[member?.id ?? ''] ?? [];

  const classSkills = useMemo(
    () =>
      (member?.skills ?? [])
        .map((id) => getSkill(id))
        .filter((skill): skill is SkillDefinition => Boolean(skill)),
    [member],
  );

  const actives = classSkills.filter((skill) => skill.type === 'active');
  const classPassives = useMemo(
    () =>
      getClassPassives(member?.className)
        .map((id) => getSkill(id))
        .filter((skill): skill is SkillDefinition => Boolean(skill)),
    [member],
  );

  const allSkills = useMemo(
    () =>
      [...SKILLS].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'active' ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    [],
  );

  const activeCount = SKILLS.filter((skill) => skill.type === 'active').length;
  const passiveCount = SKILLS.filter((skill) => skill.type === 'passive').length;

  if (!member) return null;

  return (
    <div className={styles.combatWrap}>
      <div className={styles.combatHeader}>
        <span className={styles.combatTitle}>COMBATE — HABILIDADES</span>
        <span className={styles.combatCounter}>
          {activeCount} ativas · {passiveCount} passivas no jogo
        </span>
      </div>

      <div className={styles.combatMembers}>
        {heroes.map((hero) => (
          <button
            key={hero.id}
            type="button"
            className={`${styles.combatMember} ${hero.id === member.id ? styles.combatMemberOn : ''}`}
            onClick={() => {
              setMemberId(hero.id);
              setPickingSlot(null);
            }}
          >
            {hero.isPlayer ? '⭐' : '🤖'} {hero.name}
          </button>
        ))}
      </div>

      <p className={styles.combatHint}>
        Classe: <b>{member.className}</b> — clique em um slot para selecionar a skill de
        auto-cast ({memberSlots.filter(Boolean).length}/{SLOT_COUNT} definidos).
      </p>

      <div className={styles.slotGrid}>
        {Array.from({ length: SLOT_COUNT }, (_, index) => {
          const skillId = memberSlots[index];
          const skill = skillId ? getSkill(skillId) : undefined;
          const picking = pickingSlot === index;

          return (
            <button
              key={index}
              type="button"
              className={`${styles.slot} ${skill ? styles.slotFilled : ''} ${picking ? styles.slotPicking : ''}`}
              onClick={() => setPickingSlot(picking ? null : index)}
              title={skill ? `${skill.name} — clique para trocar` : 'Slot vazio'}
            >
              {skill ? (
                <>
                  <SkillIconBadge skill={skill} classId={member.classId} size={26} />
                  <span className={styles.slotName}>{skill.name}</span>
                  <span className={styles.slotCost}>{skill.mpCost} MP</span>
                </>
              ) : (
                <span className={styles.slotEmpty}>Slot {index + 1} — vazio</span>
              )}
            </button>
          );
        })}
      </div>

      {pickingSlot !== null && (
        <div className={styles.picker}>
          <span className={styles.menuCardTitle}>
            ESCOLHER SKILL PARA O SLOT {pickingSlot + 1}
          </span>
          <div className={styles.pickerList}>
            {actives.map((skill) => (
              <button
                key={skill.id}
                type="button"
                onClick={() => {
                  onSetSlot(member.id, pickingSlot, skill.id);
                  setPickingSlot(null);
                }}
              >
                <SkillIconBadge skill={skill} classId={member.classId} size={24} />
                <span>
                  <b>{skill.name}</b>
                  <em>
                    {skill.mpCost} MP · CD {(skill.cooldownMs / 1000).toFixed(0)}s · x{skill.power.toFixed(1)}
                  </em>
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.pickerClear}
            onClick={() => {
              onSetSlot(member.id, pickingSlot, null);
              setPickingSlot(null);
            }}
          >
            Limpar slot
          </button>
        </div>
      )}

      <span className={styles.menuCardTitle}>SKILLS DISPONÍVEIS</span>
      <div className={styles.skillList}>
        {actives.length === 0 && <p className={styles.menuEmpty}>Nenhuma skill ativa.</p>}
        {actives.map((skill) => (
          <div className={styles.skillRow} key={skill.id}>
            <SkillIconBadge skill={skill} classId={member.classId} />
            <div className={styles.skillInfo}>
              <b>{skill.name}</b>
              <span>{skill.description}</span>
              <em>
                {skill.mpCost} MP · CD {(skill.cooldownMs / 1000).toFixed(0)}s
              </em>
              <i>{skill.effect}</i>
            </div>
            <button
              type="button"
              className={styles.skillAssign}
              onClick={() => {
                const free = memberSlots.findIndex((id) => !id);
                onSetSlot(member.id, free === -1 ? 0 : free, skill.id);
              }}
            >
              {memberSlots.includes(skill.id) ? '✓' : '+'}
            </button>
          </div>
        ))}
      </div>

      <span className={styles.menuCardTitle}>
        PASSIVAS DA CLASSE — SEMPRE ATIVAS (não ocupam slot)
      </span>
      <div className={styles.skillList}>
        {classPassives.length === 0 && (
          <p className={styles.menuEmpty}>Esta classe não possui passivas.</p>
        )}
        {classPassives.map((skill) => (
          <div className={`${styles.skillRow} ${styles.skillRowPassive}`} key={skill.id}>
            <SkillIconBadge skill={skill} classId={member.classId} />
            <div className={styles.skillInfo}>
              <b>{skill.name}</b>
              <span>{skill.description}</span>
              <i>{skill.effect}</i>
            </div>
            <span className={styles.passiveTag}>PASSIVA</span>
          </div>
        ))}
      </div>

      <button
        type="button"
        className={styles.showAllBtn}
        onClick={() => setShowAll((current) => !current)}
      >
        {showAll ? '▾' : '▸'} TODAS AS SKILLS DO JOGO ({SKILLS.length})
      </button>

      {showAll && (
        <div className={styles.allSkills}>
          {allSkills.map((skill) => (
            <div className={styles.allSkillRow} key={skill.id}>
              <SkillIconBadge skill={skill} size={22} />
              <b>{skill.name}</b>
              <span>{skill.id}</span>
              <em className={skill.type === 'passive' ? styles.passiveTag : styles.activeTag}>
                {skill.type === 'passive' ? 'PASSIVA' : 'ATIVA'}
              </em>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
