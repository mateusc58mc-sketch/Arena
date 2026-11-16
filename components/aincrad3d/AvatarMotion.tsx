'use client';

/**
 * AvatarMotion — animação compartilhada pelos avatares do jogador (modelo real
 * da raça ou corpo estilizado). A leitura de combate vem daqui: respiração,
 * avanço no ataque, tremor ao levar dano e queda na morte.
 *
 * Raças com rig e clipes (`RACE_RIGS`) usam `procedural={false}`: o corpo é
 * animado pelos clipes (RiggedRaceAvatar) e este componente só mantém o timing
 * de ataque/dano e publica os sinais via `AvatarMotionSignal`.
 */

import * as THREE from 'three';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useFrame } from '@react-three/fiber';
import { calculateRagnarokASPD } from '@/lib/systems/stats';
import type { HeroDef } from './data';

export type AvatarMotionProps = {
  def: HeroDef;
  index: number;
  paused: boolean;
  speed: number;
  combat: boolean;
  alive: boolean;
  autoCast: boolean;
  hitNonce: number;
  onAttack: (hero: HeroDef) => void;
  /**
   * `true` (padrão) anima o corpo proceduralmente. `false` deixa a animação
   * por conta dos clipes do rig (ver RiggedRaceAvatar), mantendo só o timing
   * de ataque/dano do combate.
   */
  procedural?: boolean;
  children: ReactNode;
};

/** Sinal compartilhado com avatares que animam por clipes. */
export type AvatarMotionSignal = {
  attackNonce: number;
  hitNonce: number;
  alive: boolean;
};

const AvatarMotionSignalContext = createContext<AvatarMotionSignal>({
  attackNonce: 0,
  hitNonce: 0,
  alive: true,
});

export function useAvatarMotionSignal() {
  return useContext(AvatarMotionSignalContext);
}

export default function AvatarMotion({
  def,
  index,
  paused,
  speed,
  combat,
  alive,
  autoCast,
  hitNonce,
  onAttack,
  procedural = true,
  children,
}: AvatarMotionProps) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const time = useRef(0);
  const nextAttack = useRef(1.4 + index * 0.4 + Math.random() * 1.2);
  const attacking = useRef(false);
  const attackStart = useRef(0);
  const attackDuration = useRef(0.5);
  const lastHit = useRef(-99);
  const deathStart = useRef(-1);
  const onAttackRef = useRef(onAttack);
  const aliveRef = useRef(alive);
  const autoCastRef = useRef(autoCast);
  const [attackNonce, setAttackNonce] = useState(0);

  onAttackRef.current = onAttack;
  aliveRef.current = alive;
  autoCastRef.current = autoCast;

  const aspd = useMemo(() => {
    const baseAspd =
      def.id === 'rogue' ? 156 : def.id === 'mage' ? 140 : def.id === 'knight' ? 150 : 148;
    const agi = def.agi ?? Math.floor(40 + def.level * 1.18);
    const dex = def.dex ?? Math.floor(35 + def.level * 1.05);
    return calculateRagnarokASPD({ baseAspd, agi, dex });
  }, [def.id, def.level, def.agi, def.dex]);

  useEffect(() => {
    if (hitNonce > 0) lastHit.current = time.current;
  }, [hitNonce]);

  useEffect(() => {
    if (!alive) deathStart.current = time.current;
  }, [alive]);

  useFrame((_, delta) => {
    if (paused) return;

    time.current += delta * speed;
    const t = time.current;
    const r = root.current;
    const b = body.current;
    if (!r || !b) return;

    // ---- morte: tomba para o lado (só no modo procedural) ----
    if (!aliveRef.current) {
      if (procedural) {
        const start = deathStart.current < 0 ? t : deathStart.current;
        const p = Math.min(1, Math.max(0, (t - start) / 0.7));
        r.rotation.z = -(Math.PI / 2) * p;
        r.position.y = (def.position[1] ?? 0) + 0.12 * p;
      }
      return;
    }

    if (procedural) {
      r.rotation.z = 0;
      r.position.y = def.position[1] ?? 0;
    }

    // ---- ataque: avanço curto + inclinação ----
    if (attacking.current) {
      const p = Math.min(1, (t - attackStart.current) / attackDuration.current);
      if (procedural) {
        const lunge = Math.sin(Math.PI * p);
        b.position.z = -0.55 * lunge;
        b.rotation.x = 0.32 * lunge;
      }
      if (p >= 1) {
        attacking.current = false;
        if (procedural) {
          b.position.z = 0;
          b.rotation.x = 0;
        }
        if (combat && aliveRef.current) onAttackRef.current(def);
      }
    } else {
      if (procedural) {
        b.position.z = 0;
        b.rotation.x = 0;
      }
      if (combat && autoCastRef.current && t >= nextAttack.current) {
        attacking.current = true;
        attackStart.current = t;
        setAttackNonce((value) => value + 1);
        attackDuration.current = Math.max(0.38, Math.min(0.6, aspd.attackIntervalSec * 0.6));
        nextAttack.current = t + aspd.attackIntervalSec + Math.random() * 0.25;
      }
    }

    if (procedural) {
      // ---- idle: respiração + leve balanço ----
      b.position.y = Math.sin(t * 2.1) * 0.02;
      b.rotation.y = Math.sin(t * 0.8) * 0.08;

      // ---- dano: tremor curto ----
      const sinceHit = t - lastHit.current;
      if (sinceHit >= 0 && sinceHit < 0.25) {
        const k = 1 - sinceHit / 0.25;
        b.position.x = Math.sin(sinceHit * 90) * 0.07 * k;
      } else {
        b.position.x = 0;
      }
    }
  });

  const signal = useMemo(
    () => ({ attackNonce, hitNonce, alive }),
    [attackNonce, hitNonce, alive],
  );

  return (
    <AvatarMotionSignalContext.Provider value={signal}>
      <group
        ref={root}
        position={def.position}
        rotation={[0, Math.PI, 0]}
        scale={0.78}
        userData={{ hero: def.id }}
      >
        <group ref={body}>{children}</group>
      </group>
    </AvatarMotionSignalContext.Provider>
  );
}
