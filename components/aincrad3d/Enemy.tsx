'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Billboard, useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { EnemyDef } from './data';
import { relaxTPose, toonify } from './toonify';
import { calculateRagnarokASPD } from '@/lib/systems/stats';

type EnemyProps = {
  def: EnemyDef;
  hp: number;
  paused: boolean;
  speed: number;
  onAttack: (enemy: EnemyDef) => void;
};

export default function Enemy({ def, hp, paused, speed, onAttack }: EnemyProps) {
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(def.model);

  const model = useMemo(() => {
    const copy = skeletonClone(scene);
    if (def.kind === 'boss') {
      toonify(copy, { boost: 1.32, emissive: '#341152', emissiveIntensity: 0.62 });
    } else {
      toonify(copy, { boost: 1.45, emissive: '#160b24', emissiveIntensity: 0.55 });
    }
    // Pack GLB estático: baixa os braços do T-pose para uma pose A
    if (animations.length === 0) relaxTPose(copy);
    // Alguns packs exportam de "costas" para os heróis (ex.: demon drakon)
    copy.rotation.y += MODEL_FACING_YAW[def.model] ?? 0;
    return copy;
  }, [scene, def.kind, def.model, animations.length]);

  const { actions, mixer } = useAnimations(animations, group);
  const dead = useRef(false);
  const previousHp = useRef(hp);
  const timers = useRef<number[]>([]);
  const onAttackRef = useRef(onAttack);
  const spawn = useRef(0);
  onAttackRef.current = onAttack;

  const idle = actions.idle ?? null;
  const attack = actions.attack ?? null;
  const death = actions.death ?? null;
  const hit = actions.hit ?? null;
  // 'howl' = clip de rugido; o demon drakon chama o clip de 'roar'
  const howl = actions.howl ?? actions.roar ?? null;
  const walk = actions.walk ?? null;
  const defeated = hp <= 0;
  const barRatio = Math.max(0, Math.min(1, hp / def.maxHp));

  // Packs GLB estáticos (ex.: Bestiary Dungeon Monsters) vêm sem clips:
  // idle/ataque/morte são representados de forma procedural.
  const lunge = useRef(1);
  const fall = useRef(0);
  const defeatedRef = useRef(false);
  defeatedRef.current = defeated;

  const aspdInfo = useMemo(() => {
    const baseAspd = def.kind === 'boss' ? 140 : 148;
    const agi = Math.floor(35 + (def.maxHp / 800));
    const dex = Math.floor(30 + (def.atk / 40));
    return calculateRagnarokASPD({ baseAspd, agi, dex });
  }, [def.kind, def.maxHp, def.atk]);

  // Monstros nascem perto do portal e ANDAM até os heróis; só depois chegam
  // à distância de combate é que passam a atacar.
  const arrived = useRef(false);
  const [engaged, setEngaged] = useState(false);
  const walkTargetZ = def.position[2] + (def.kind === 'boss' ? 1.7 : 2.9);

  useEffect(() => {
    if (!idle && !walk && !howl) return;

    // Chefe com clip de roar (ex.: demon drakon): ruge na entrada e depois
    // passa a andar/idle.
    if (def.kind === 'boss' && howl && !engaged) {
      howl.reset();
      howl.setLoop(THREE.LoopOnce, 1);
      howl.clampWhenFinished = true;
      howl.fadeIn(0.2).play();
      const duration = Math.max(1.4, howl.getClip().duration / Math.max(0.5, speed)) * 1000;
      const timer = window.setTimeout(() => {
        howl.fadeOut(0.4);
        (engaged ? idle : walk ?? idle)?.reset().fadeIn(0.4).play();
      }, duration);
      return () => window.clearTimeout(timer);
    }

    // A caminho dos heróis: clip de walk (quando existir)
    if (!engaged && walk) {
      walk.reset().fadeIn(0.2).play();
      return () => {
        walk.fadeOut(0.2);
      };
    }

    idle?.reset().fadeIn(0.2).play();
    return () => {
      idle?.fadeOut(0.2);
    };
  }, [idle, walk, howl, def.kind, def.position, engaged, speed]);

  useEffect(() => {
    if (!mixer) return;
    mixer.timeScale = paused ? 0 : speed;
  }, [mixer, paused, speed]);

  useEffect(() => {
    if (defeated && !dead.current) {
      dead.current = true;
      idle?.fadeOut(0.1);
      attack?.fadeOut(0.1);
      death?.reset();
      death?.setLoop(THREE.LoopOnce, 1);
      if (death) death.clampWhenFinished = true;
      death?.fadeIn(0.1).play();
      return;
    }

    if (!defeated && dead.current) {
      dead.current = false;
      death?.fadeOut(0.1);
      idle?.reset().fadeIn(0.15).play();
    }

    if (hp < previousHp.current && !defeated && hit) {
      hit.reset();
      hit.setLoop(THREE.LoopOnce, 1);
      hit.clampWhenFinished = true;
      hit.fadeIn(0.04).play();
      const timer = window.setTimeout(() => {
        hit.fadeOut(0.12);
        if (!dead.current) idle?.reset().fadeIn(0.12).play();
      }, 220);
      previousHp.current = hp;
      return () => window.clearTimeout(timer);
    }

    previousHp.current = hp;
  }, [hp, defeated, death, hit, idle, attack]);

  useEffect(() => {
    if (paused || defeated || !attack || !engaged) return;

    const interval = Math.max(700, aspdInfo.attackIntervalSec * 1000 / Math.max(1, speed));

    // Chegou na distância de combate: o primeiro golpe sai na hora, os
    // seguintes seguem a cadência de ASPD estilo Ragnarök.
    // Aba escondida = jogo offline: congela os monstros para o tempo ausente
    // ser liquidado pelo settle_offline (não há combate "zumbi" desacelerado).
    const strike = () => {
      if (dead.current) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      attack.reset();
      attack.setLoop(THREE.LoopOnce, 1);
      attack.clampWhenFinished = true;
      attack.fadeIn(0.08).play();
      idle?.fadeOut(0.08);

      timers.current.push(window.setTimeout(() => onAttackRef.current(def), 320));
      timers.current.push(
        window.setTimeout(() => {
          attack.fadeOut(0.15);
          if (!dead.current) idle?.reset().fadeIn(0.15).play();
        }, 680),
      );
    };

    const first = window.setTimeout(strike, 120);
    const attackTimer = window.setInterval(strike, interval);

    return () => {
      window.clearTimeout(first);
      window.clearInterval(attackTimer);
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current = [];
    };
  }, [paused, defeated, attack, idle, engaged, def, speed]);

  // Ataque procedural para modelos sem clip de ataque: a investida acontece
  // no useFrame e o dano parte do mesmo timing do ataque animado.
  useEffect(() => {
    if (paused || defeated || attack || !engaged) return;

    const interval = Math.max(700, aspdInfo.attackIntervalSec * 1000 / Math.max(1, speed));

    // Primeiro golpe logo ao chegar, depois cadência normal (ASPD Ragnarök).
    const strike = () => {
      if (dead.current) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      lunge.current = 0;
      timers.current.push(window.setTimeout(() => onAttackRef.current(def), 320));
    };

    const first = window.setTimeout(strike, 120);
    const attackTimer = window.setInterval(strike, interval);

    return () => {
      window.clearTimeout(first);
      window.clearInterval(attackTimer);
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current = [];
    };
  }, [paused, defeated, attack, idle, engaged, def, speed]);

  useFrame((state, delta) => {
    if (!body.current || !group.current) return;

    if (spawn.current < 1) {
      spawn.current = Math.min(1, spawn.current + delta * (def.kind === 'boss' ? 0.9 : 1.8));
      const eased = 1 - Math.pow(1 - spawn.current, 3);
      const pop = def.kind === 'boss' ? 0.35 + 0.65 * eased : 0.72 + 0.28 * eased;
      body.current.scale.setScalar(def.scale * pop);
      body.current.position.y = -(1 - eased) * 0.45;
    } else if (!idle) {
      // Idle procedural (sem clip): bob suave para o monstro não parecer estátua
      body.current.position.y =
        Math.sin(state.clock.elapsedTime * 2.2) * (def.kind === 'boss' ? 0.07 : 0.045);
    }

    // Caminhada até os heróis (sem clip de walk: passada procedural)
    if (spawn.current >= 1 && !arrived.current && !paused &&
      !defeatedRef.current &&
      group.current.position.z < walkTargetZ
    ) {
      group.current.position.z = Math.min(
        walkTargetZ,
        group.current.position.z + delta * (def.kind === 'boss' ? 0.95 : 1.75) * speed,
      );

      if (!walk) {
        body.current.position.y = Math.abs(Math.sin(state.clock.elapsedTime * 7)) * 0.06;
        body.current.rotation.z = Math.sin(state.clock.elapsedTime * 7) * 0.045; // DEBUG BISSECT
      }

      if (group.current.position.z >= walkTargetZ) {
        arrived.current = true;
        setEngaged(true);
      }
    }

    if (lunge.current < 1) {
      lunge.current = Math.min(1, lunge.current + delta * 3.4);
      body.current.position.z = Math.sin(lunge.current * Math.PI) * 0.5; // avança em direção à party
    }

    // Morte procedural (sem clip de death): tomba para frente e levanta ao respawn
    if (!death) {
      const target = defeatedRef.current ? 1 : 0;
      fall.current += (target - fall.current) * Math.min(1, delta * 7);
      body.current.rotation.x = (Math.PI / 2) * 0.92 * fall.current;
    }
  });

  return (
    <group ref={group} position={def.position} userData={{ enemy: def.id }}>
      <group ref={body} scale={def.scale * 0.7}>
        <primitive object={model} />
      </group>
      {!defeated && (
        <Billboard
          position={[0, def.barHeight, 0]}
          scale={def.kind === 'boss' ? 1.9 : 1.25}
        >
          <mesh renderOrder={28}>
            <planeGeometry args={[1.5, 0.2]} />
            <meshBasicMaterial
              color="#020907"
              transparent
              opacity={0.8}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
          <mesh position={[0, 0, 0.01]} renderOrder={29}>
            <planeGeometry args={[1.4, 0.11]} />
            <meshBasicMaterial color="#2a0b0b" depthTest={false} depthWrite={false} />
          </mesh>
          <mesh
            position={[-(1 - barRatio) * 0.7, 0, 0.02]}
            scale={[Math.max(0.001, barRatio), 1, 1]}
            renderOrder={30}
          >
            <planeGeometry args={[1.4, 0.11]} />
            <meshBasicMaterial
              color={def.kind === 'boss' ? '#ff8a4c' : '#ff5c4c'}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </Billboard>
      )}
    </group>
  );
}

useGLTF.preload('/models/aincrad/gloam_wolf.glb');
useGLTF.preload('/models/aincrad/gloam_alpha.glb');

// Modelos exportados de "costas" (virados para -Z): yaw em radianos para
// ficar de frente para a party (+Z).
const MODEL_FACING_YAW: Record<string, number> = {
  '/models/dungeon/demon_dragon.glb': Math.PI,
};
