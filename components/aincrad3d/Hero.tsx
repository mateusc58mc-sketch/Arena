'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { HeroDef } from './data';
import { toonify } from './toonify';
import { calculateRagnarokASPD } from '@/lib/systems/stats';
import { getRaceHeroAsset } from '@/lib/racesAssets';
import { getRaceRig } from '@/lib/raceRigs';
import RaceHeroAvatar from './RaceHeroAvatar';
import RiggedRaceAvatar from './RiggedRaceAvatar';
import ProceduralHeroAvatar from './ProceduralHeroAvatar';
import ModelBoundary from './ModelBoundary';

export type HeroProps = {
  def: HeroDef;
  index: number;
  paused: boolean;
  speed: number;
  combat: boolean;
  victory: boolean;
  alive: boolean;
  autoCast: boolean;
  hitNonce: number;
  cheerNonce: number;
  onAttack: (hero: HeroDef) => void;
};

export default function Hero(props: HeroProps) {
  // Jogador: modelo real da raça quando existe; senão o mesmo corpo estilizado usado na tela de criação.
  if (props.def.isPlayer) {
    // Raças com rig + clipes: personagem modular animado de verdade.
    const rig = getRaceRig(props.def.race);
    if (rig) {
      return (
        <ModelBoundary resetKey={rig.model} fallback={<ProceduralHeroAvatar {...props} />}>
          <RiggedRaceAvatar {...props} />
        </ModelBoundary>
      );
    }

    const raceAsset = getRaceHeroAsset(props.def.race);
    if (raceAsset) {
      return (
        <ModelBoundary resetKey={raceAsset.model} fallback={<ProceduralHeroAvatar {...props} />}>
          <RaceHeroAvatar {...props} asset={raceAsset} />
        </ModelBoundary>
      );
    }
    return <ProceduralHeroAvatar {...props} />;
  }
  return <StandardHero {...props} />;
}

function StandardHero({
  def,
  index,
  paused,
  speed,
  combat,
  victory,
  alive,
  autoCast,
  hitNonce,
  cheerNonce,
  onAttack,
}: HeroProps) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(def.model);

  const model = useMemo(() => {
    const copy = skeletonClone(scene);
    toonify(copy);
    return copy;
  }, [scene]);

  const { actions, mixer } = useAnimations(animations, group);
  const time = useRef(0);
  const nextAttack = useRef(1.4 + index * 0.4 + Math.random() * 1.2);
  const attacking = useRef(false);
  const attackEnd = useRef(0);
  const currentAction = useRef<THREE.AnimationAction | null>(null);
  const onAttackRef = useRef(onAttack);
  const aliveRef = useRef(alive);
  const autoCastRef = useRef(autoCast);
  const died = useRef(false);

  const aspdInfo = useMemo(() => {
    const baseAspd =
      def.id === 'rogue'
        ? 156
        : def.id === 'mage'
          ? 140
          : def.id === 'knight'
            ? 150
            : 148;
    const agi = def.agi ?? Math.floor(40 + def.level * 1.18);
    const dex = def.dex ?? Math.floor(35 + def.level * 1.05);
    return calculateRagnarokASPD({ baseAspd, agi, dex });
  }, [def.id, def.level, def.agi, def.dex]);
  onAttackRef.current = onAttack;
  aliveRef.current = alive;
  autoCastRef.current = autoCast;

  const idle = actions[def.idleClip] ?? actions.Idle ?? null;
  const cheer = actions.Cheer ?? null;

  useEffect(() => {
    if (!idle) return;
    idle.reset().fadeIn(0.25).play();
    return () => {
      idle.fadeOut(0.2);
    };
  }, [idle]);

  useEffect(() => {
    if (alive) {
      died.current = false;
      return;
    }
    if (died.current) return;
    died.current = true;
    idle?.fadeOut(0.1);
    const death = actions.Death_A ?? actions.death;
    death?.reset();
    death?.setLoop(THREE.LoopOnce, 1);
    if (death) death.clampWhenFinished = true;
    death?.fadeIn(0.1).play();
  }, [alive, actions, idle]);

  useEffect(() => {
    if (!mixer) return;
    mixer.timeScale = paused ? 0 : speed;
  }, [mixer, paused, speed]);

  useEffect(() => {
    if (!hitNonce) return;
    const hit = actions.Hit_A ?? actions.hit;
    if (!hit) return;

    hit.reset();
    hit.setLoop(THREE.LoopOnce, 1);
    hit.clampWhenFinished = true;
    hit.fadeIn(0.05).play();
    idle?.fadeOut(0.05);

    const timer = window.setTimeout(() => {
      hit.fadeOut(0.15);
      idle?.reset().fadeIn(0.15).play();
    }, 380);
    return () => window.clearTimeout(timer);
  }, [hitNonce, actions, idle]);

  useEffect(() => {
    if (!victory || !cheerNonce || !cheer) return;

    const duration = Math.max(1.4, cheer.getClip().duration / Math.max(0.5, speed));
    idle?.fadeOut(0.25);
    cheer.reset();
    cheer.setLoop(THREE.LoopOnce, 1);
    cheer.clampWhenFinished = true;
    cheer.fadeIn(0.25).play();

    const timer = window.setTimeout(() => {
      cheer.fadeOut(0.35);
      idle?.reset().fadeIn(0.35).play();
    }, (duration + 0.25) * 1000);

    return () => window.clearTimeout(timer);
  }, [victory, cheerNonce, cheer, idle, speed]);

  useFrame((_, delta) => {
    if (paused) return;
    time.current += delta * speed;
    const t = time.current;

    if (attacking.current) {
      if (t >= attackEnd.current) {
        attacking.current = false;
        currentAction.current?.fadeOut(0.14);
        idle?.reset().fadeIn(0.14).play();
        if (combat && aliveRef.current) onAttackRef.current(def);
      }
      return;
    }

    if (!aliveRef.current || !autoCastRef.current || !combat || t < nextAttack.current) return;

    const action = actions[def.attackClip] ?? actions.attack ?? null;
    if (!action) {
      nextAttack.current = t + 1;
      return;
    }

    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.fadeIn(0.08).play();
    idle?.fadeOut(0.08);

    currentAction.current = action;
    attacking.current = true;
    nextAttack.current = t + aspdInfo.attackIntervalSec + Math.random() * 0.25;
    attackEnd.current = t + Math.max(0.45, action.getClip().duration * 0.72);
  });

  return (
    <group
      ref={group}
      position={def.position}
      rotation={[0, Math.PI, 0]}
      scale={0.78}
      userData={{ hero: def.id }}
    >
      <primitive object={model} />
    </group>
  );
}

for (const hero of ['Knight', 'Barbarian', 'Rogue', 'Mage']) {
  useGLTF.preload(`/models/aincrad/${hero}.glb`);
}
