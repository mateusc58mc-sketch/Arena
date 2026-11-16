'use client';

/**
 * RaceRigPreview — prévia ANIMADA (idle) de uma raça com rig, usada na tela de
 * criação. Usa exatamente o mesmo `useRiggedCharacter` do avatar de combate,
 * então o que o jogador vê aqui é o que ele recebe na arena.
 *
 * `attackNonce` (LOCAL_TEST_ONLY): a cada incremento dispara o clipe de
 * ataque one-shot — mesmo fluxo do combate real (RiggedRaceAvatar) — e volta
 * ao idle no fim. Só para validar visualmente attack/hit/death no dev.
 */

import { Suspense, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useRiggedCharacter } from './aincrad3d/riggedCharacter';
import type { RaceRig } from '@/lib/raceRigs';

function RiggedPreviewBody({ rig, attackNonce = 0 }: { rig: RaceRig; attackNonce?: number }) {
  const { root, mixer, actions } = useRiggedCharacter(rig);

  const idleRef = useRef<THREE.AnimationAction | null>(null);
  const oneShotRef = useRef<THREE.AnimationAction | null>(null);
  const lastNonce = useRef(0);

  // ---- idle em loop ----
  useEffect(() => {
    const idle = actions.idle;
    if (!idle) return;
    idle.reset();
    idle.setLoop(THREE.LoopRepeat, Infinity);
    idle.clampWhenFinished = false;
    idle.play();
    idleRef.current = idle;
    return () => {
      idle.stop();
    };
  }, [actions]);

  // ---- volta ao idle quando o one-shot termina ----
  useEffect(() => {
    const onFinished = (event: { action: THREE.AnimationAction }) => {
      if (event.action !== oneShotRef.current) return;
      oneShotRef.current = null;
      event.action.fadeOut(0.15);
      idleRef.current?.reset().fadeIn(0.15).play();
    };
    mixer.addEventListener('finished', onFinished);
    return () => mixer.removeEventListener('finished', onFinished);
  }, [mixer]);

  // ---- dispara o golpe a cada nonce (prévia local) ----
  useEffect(() => {
    if (attackNonce === lastNonce.current) return;
    lastNonce.current = attackNonce;
    if (attackNonce === 0) return;
    const action = actions.attack;
    if (!action) return;
    if (oneShotRef.current && oneShotRef.current !== action) oneShotRef.current.fadeOut(0.12);
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.timeScale = rig.attackTimeScale ?? 1;
    action.fadeIn(0.08).play();
    idleRef.current?.fadeOut(0.08);
    oneShotRef.current = action;
  }, [attackNonce, actions, rig.attackTimeScale]);

  useFrame((_, delta) => {
    mixer.update(delta);
  });

  return <primitive object={root} />;
}

export default function RaceRigPreview({
  rig,
  attackNonce,
}: {
  rig: RaceRig;
  attackNonce?: number;
}) {
  return (
    <Suspense fallback={null}>
      <RiggedPreviewBody rig={rig} attackNonce={attackNonce} />
    </Suspense>
  );
}
