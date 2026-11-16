'use client';

/**
 * RiggedRaceAvatar — avatar de combate do JOGADOR usando um modelo RIGADO com
 * clipes reais (ver `lib/raceRigs.ts` + `riggedCharacter.ts`).
 *
 * O timing de combate continua no AvatarMotion (`procedural={false}`): ele
 * publica `attackNonce`, `hitNonce` e `alive` no contexto, e este componente
 * traduz esses sinais em clipes:
 *   idle (loop) · attack (one-shot no ataque) · hit (one-shot no dano) ·
 *   death (one-shot, congela no último quadro).
 *
 * Sem rig para a raça, o Hero cai no avatar estático/procedural.
 */

import { Suspense, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { getRaceRig, type RaceRig, type RaceRigAttachment } from '@/lib/raceRigs';
import { useRiggedCharacter } from './riggedCharacter';
import AvatarMotion, { useAvatarMotionSignal } from './AvatarMotion';
import type { HeroProps } from './Hero';

/** Personalização modular (equipamentos futuros). */
export type RiggedRaceAvatarOptions = {
  /** Geosets escondidos (ex.: `['047']` esconde as manoplas). */
  hiddenGeosets?: string[];
  /** Objetos presos a bones (arma na mão, escudo no braço...). */
  attachments?: RaceRigAttachment[];
};

/** Placeholder enquanto o rig/clipes carregam. */
function RiggedSkeleton() {
  return (
    <group position={[0, 0.9, 0]}>
      <mesh position={[0, 0.45, 0]}>
        <capsuleGeometry args={[0.3, 0.5, 4, 12]} />
        <meshToonMaterial color="#7f8fa6" />
      </mesh>
      <mesh position={[0, 0.95, 0]}>
        <sphereGeometry args={[0.24, 16, 16]} />
        <meshToonMaterial color="#7f8fa6" />
      </mesh>
    </group>
  );
}

function RiggedBody({
  rig,
  paused,
  speed,
  hiddenGeosets,
  attachments,
}: {
  rig: RaceRig;
  paused: boolean;
  speed: number;
} & RiggedRaceAvatarOptions) {
  const { root, mixer, actions } = useRiggedCharacter(rig, { hiddenGeosets, attachments });
  const { attackNonce, hitNonce, alive } = useAvatarMotionSignal();

  const idleRef = useRef<THREE.AnimationAction | null>(null);
  const oneShotRef = useRef<THREE.AnimationAction | null>(null);
  const lastAttack = useRef(attackNonce);
  const lastHit = useRef(hitNonce);
  const died = useRef(false);
  const aliveRef = useRef(alive);

  aliveRef.current = alive;

  // ---- idle em loop ----
  useEffect(() => {
    const idle = actions.idle;
    if (!idle) return;
    idle.reset();
    idle.setLoop(THREE.LoopRepeat, Infinity);
    idle.clampWhenFinished = false;
    idle.fadeIn(0.2).play();
    idleRef.current = idle;
    return () => {
      idle.fadeOut(0.2);
    };
  }, [actions]);

  // ---- pausa/velocidade do combate ----
  useEffect(() => {
    mixer.timeScale = paused ? 0 : speed;
  }, [mixer, paused, speed]);

  // ---- volta ao idle quando um clipe de ação termina ----
  useEffect(() => {
    const onFinished = (event: { action: THREE.AnimationAction }) => {
      if (event.action !== oneShotRef.current) return;
      oneShotRef.current = null;
      if (!aliveRef.current) return; // morte fica congelada no último quadro
      event.action.fadeOut(0.15);
      idleRef.current?.reset().fadeIn(0.15).play();
    };
    mixer.addEventListener('finished', onFinished);
    return () => mixer.removeEventListener('finished', onFinished);
  }, [mixer]);

  /** Troca o clipe de ação atual (ataque/dano) com crossfade. */
  const playOneShot = (kind: 'attack' | 'hit') => {
    const action = actions[kind];
    if (!action) return;
    const previous = oneShotRef.current;
    if (previous && previous !== action) previous.fadeOut(0.12);

    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.timeScale = kind === 'attack' ? (rig.attackTimeScale ?? 1) : 1;
    action.fadeIn(0.08).play();
    idleRef.current?.fadeOut(0.08);
    oneShotRef.current = action;
  };

  // ---- ataque (sincronizado pelo nonce do AvatarMotion) ----
  useEffect(() => {
    if (attackNonce === lastAttack.current) return;
    lastAttack.current = attackNonce;
    if (!aliveRef.current) return;
    playOneShot('attack');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attackNonce, actions, rig.attackTimeScale]);

  // ---- dano ----
  useEffect(() => {
    if (hitNonce <= 0 || hitNonce === lastHit.current) return;
    lastHit.current = hitNonce;
    if (!aliveRef.current) return;
    playOneShot('hit');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hitNonce, actions]);

  // ---- morte / renascimento ----
  useEffect(() => {
    const death = actions.death;

    if (alive) {
      if (!died.current) return;
      died.current = false;
      death?.stop();
      actions.attack?.stop();
      actions.hit?.stop();
      oneShotRef.current = null;
      idleRef.current?.reset().fadeIn(0.25).play();
      return;
    }

    if (died.current) return;
    died.current = true;
    if (!death) return;

    oneShotRef.current?.fadeOut(0.12);
    death.reset();
    death.setLoop(THREE.LoopOnce, 1);
    death.clampWhenFinished = true;
    death.timeScale = 1;
    death.fadeIn(0.12).play();
    idleRef.current?.fadeOut(0.2);
    oneShotRef.current = death;
  }, [alive, actions]);

  useFrame((_, delta) => {
    mixer.update(delta);
  });

  return <primitive object={root} />;
}

export default function RiggedRaceAvatar({
  hiddenGeosets,
  attachments,
  ...props
}: HeroProps & RiggedRaceAvatarOptions) {
  const rig = getRaceRig(props.def.race);
  if (!rig) return null;

  return (
    <AvatarMotion {...props} procedural={false}>
      <Suspense fallback={<RiggedSkeleton />}>
        <RiggedBody
          rig={rig}
          paused={props.paused}
          speed={props.speed}
          hiddenGeosets={hiddenGeosets}
          attachments={attachments}
        />
      </Suspense>
    </AvatarMotion>
  );
}
