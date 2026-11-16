'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { DamageLabel } from './data';

function makeTextTexture(text: string, color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext('2d');

  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = '900 82px Inter, Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineJoin = 'round';
    context.lineWidth = 16;
    context.strokeStyle = 'rgba(0, 0, 0, 0.92)';
    context.strokeText(text, 128, 68);
    context.fillStyle = color;
    context.fillText(text, 128, 68);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export default function DamageNumber({ label }: { label: DamageLabel }) {
  const sprite = useRef<THREE.Sprite>(null);
  const start = useRef<number | null>(null);
  const drift = useMemo(() => (Math.random() - 0.5) * 0.7, []);
  const texture = useMemo(
    () =>
      makeTextTexture(
        label.tone === 'heal' ? `+${Math.max(1, Math.round(label.amount))}` : `-${Math.max(1, Math.round(label.amount))}`,
        label.tone === 'heal' ? '#7dffc2' : label.tone === 'hero' ? '#ff9696' : '#ffd166',
      ),
    [label.amount, label.tone],
  );

  useEffect(() => () => texture.dispose(), [texture]);

  useFrame((state) => {
    if (!sprite.current) return;
    if (start.current === null) start.current = state.clock.elapsedTime;

    const progress = Math.min(1, (state.clock.elapsedTime - start.current) / 0.95);
    const scale = 0.92 + progress * 0.14;

    sprite.current.position.x = label.position[0] + drift * progress;
    sprite.current.position.y = label.position[1] + progress * 1.35;
    sprite.current.scale.set(1.55 * scale, 0.78 * scale, 1);

    const material = sprite.current.material as THREE.SpriteMaterial;
    material.opacity = 1 - Math.pow(progress, 2.4);
  });

  return (
    <sprite ref={sprite} position={label.position} scale={[1.55, 0.78, 1]}>
      <spriteMaterial
        map={texture}
        transparent
        opacity={1}
        depthWrite={false}
        depthTest={false}
        toneMapped={false}
      />
    </sprite>
  );
}
