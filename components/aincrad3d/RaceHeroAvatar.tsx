'use client';

/**
 * RaceHeroAvatar — avatar de combate do JOGADOR usando o MODELO REAL da raça
 * (public/racas). A leitura de combate é procedural (ver AvatarMotion): os GLB
 * são estáticos e o FBX do orc tem rig, mas só é usado para a pose A.
 *
 * Bots e raças sem modelo usam ProceduralHeroAvatar / herói padrão (Hero.tsx).
 */

import { Suspense } from 'react';
import type { RaceHeroAsset } from '@/lib/racesAssets';
import RaceAssetModel from '../RaceAssetModel';
import AvatarMotion from './AvatarMotion';
import type { HeroProps } from './Hero';

/** Placeholder enquanto o GLB/FBX carrega. */
function AvatarSkeleton() {
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

export default function RaceHeroAvatar({
  asset,
  ...props
}: HeroProps & { asset: RaceHeroAsset }) {
  return (
    <AvatarMotion {...props}>
      <Suspense fallback={<AvatarSkeleton />}>
        <RaceAssetModel asset={asset} />
      </Suspense>
    </AvatarMotion>
  );
}
