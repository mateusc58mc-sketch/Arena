'use client';

/**
 * RaceModelPreview — prévia 3D do MODELO REAL da raça (arquivos em
 * `public/racas/`). A câmera enquadra conforme a altura da raça (o tauren é
 * bem maior que o anão). Quando a raça não tem modelo, a escolha cai para a
 * prévia estilizada (ver RacePreviewSwitch).
 *
 * Raças com rig (ver `lib/raceRigs.ts`) aparecem ANIMADAS (clipe idle) usando
 * o mesmo personagem modular do combate; as demais seguem no modelo estático.
 */

import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { getRaceHeroAsset, STANDARD_HEIGHT } from '@/lib/racesAssets';
import { getRaceRig } from '@/lib/raceRigs';
import RaceAssetModel from './RaceAssetModel';
import RaceRigPreview from './RaceRigPreview';
import RaceBody from './RaceBody';
import ModelBoundary from './aincrad3d/ModelBoundary';

export default function RaceModelPreview({
  raceId,
  attackNonce,
}: {
  raceId: string;
  attackNonce?: number;
}) {
  const asset = getRaceHeroAsset(raceId);
  const rig = getRaceRig(raceId);
  if (!asset && !rig) return null;

  const height = rig?.height ?? asset?.height ?? STANDARD_HEIGHT;
  const distance = Math.max(3.4, height * 2.1);

  return (
    <div style={{ width: '100%', height: 380, position: 'relative' }}>
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, height * 0.55, distance], fov: 40, near: 0.05, far: 200 }}
        gl={{ antialias: true }}
        style={{ width: '100%', height: '100%' }}
      >
        <color attach="background" args={['#0b0f1a']} />
        <hemisphereLight intensity={1} groundColor="#1a2033" />
        <directionalLight position={[3, 5, 2]} intensity={2.2} color="#ffe9c9" />
        <directionalLight position={[-4, 2, -2]} intensity={0.9} color="#6aa8ff" />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]}>
          <circleGeometry args={[Math.max(1.5, height * 0.85), 48]} />
          <meshStandardMaterial color="#131a2b" roughness={0.95} />
        </mesh>
        <gridHelper
          args={[Math.max(4, height * 2.4), 24, 0x24314b, 0x1a2338]}
          position={[0, 0.001, 0]}
        />
        <Suspense fallback={null}>
          {rig ? (
            <ModelBoundary
              resetKey={rig.model}
              fallback={asset ? <RaceAssetModel asset={asset} /> : <RaceBody raceId={raceId} />}
            >
              <RaceRigPreview rig={rig} attackNonce={attackNonce} />
            </ModelBoundary>
          ) : asset ? (
            <ModelBoundary resetKey={asset.model} fallback={<RaceBody raceId={raceId} />}>
              <RaceAssetModel asset={asset} />
            </ModelBoundary>
          ) : (
            <RaceBody raceId={raceId} />
          )}
        </Suspense>
        <OrbitControls
          target={[0, height * 0.5, 0]}
          enablePan={false}
          minDistance={height * 0.9}
          maxDistance={height * 4}
          maxPolarAngle={Math.PI / 2 + 0.04}
        />
      </Canvas>
      <div
        style={{
          position: 'absolute',
          right: 8,
          bottom: 8,
          background: 'rgba(15,20,35,0.8)',
          color: '#93a6c7',
          fontSize: 9,
          padding: '4px 8px',
          borderRadius: 6,
        }}
      >
        {rig ? 'modelo animado' : 'modelo real'} · {height.toFixed(2)} m · drag gira · scroll
        aproxima
      </div>
    </div>
  );
}
