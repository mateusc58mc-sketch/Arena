'use client';

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import ArenaEnvironment from './ArenaEnvironment';
import DamageNumber from './DamageNumber';
import Enemy from './Enemy';
import Hero from './Hero';
import PortalGate from './PortalGate';
import type { BoltData, DamageLabel, EnemyDef, HeroDef } from './data';

type ArenaExperienceProps = {
  auto: boolean;
  speed: number;
  waveKey: number;
  heroes: HeroDef[];
  alive: Record<string, boolean>;
  autoCast: Record<string, boolean>;
  hitNonce: Record<string, number>;
  enemies: EnemyDef[];
  enemyHp: Record<string, number>;
  labels: DamageLabel[];
  bolts: BoltData[];
  combat: boolean;
  frozen: boolean;
  victory: boolean;
  portalOpen: boolean;
  cheerNonce: number;
  onHeroAttack: (hero: HeroDef) => void;
  onEnemyAttack: (enemy: EnemyDef) => void;
};

function CameraRig() {
  const { camera, size } = useThree();

  useEffect(() => {
    const portrait = size.height > size.width;
    camera.position.set(0, portrait ? 12.5 : 9.5, portrait ? 21 : 15);
    camera.lookAt(0, 1, -4);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = portrait ? 58 : 50;
      camera.updateProjectionMatrix();
    }
  }, [camera, size.width, size.height]);

  return null;
}

function Bolt({ from, to }: { from: [number, number, number]; to: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null);
  const start = useRef<number | null>(null);
  const fromV = useMemo(() => new THREE.Vector3(...from), [from]);
  const toV = useMemo(() => new THREE.Vector3(...to), [to]);

  useFrame((state) => {
    if (!ref.current) return;
    if (start.current === null) start.current = state.clock.elapsedTime;
    const t = Math.min(1, (state.clock.elapsedTime - start.current) / 0.48);
    ref.current.position.lerpVectors(fromV, toV, t);
    ref.current.position.y += Math.sin(t * Math.PI) * 0.9;
    ref.current.scale.setScalar(Math.max(0.25, 1 - t * 0.4));
  });

  return (
    <mesh ref={ref} position={from}>
      <sphereGeometry args={[0.17, 14, 14]} />
      <meshBasicMaterial color="#bff5ff" toneMapped={false} />
    </mesh>
  );
}

function Scene({
  auto,
  speed,
  waveKey,
  heroes,
  alive,
  autoCast,
  hitNonce,
  enemies,
  enemyHp,
  labels,
  bolts,
  combat,
  frozen,
  victory,
  portalOpen,
  cheerNonce,
  onHeroAttack,
  onEnemyAttack,
}: ArenaExperienceProps) {
  return (
    <>
      <CameraRig />
      <color attach="background" args={['#0a171d']} />
      <fog attach="fog" args={['#0a171d', 34, 92]} />

      <hemisphereLight args={['#a9d8ff', '#22352a', 1.35]} />
      <ambientLight intensity={0.45} />
      <directionalLight
        position={[12, 18, 8]}
        color="#dff3ff"
        intensity={2.15}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-10, 7, -16]} color="#5dffb4" intensity={0.75} />

      <ArenaEnvironment />
      <PortalGate open={portalOpen} />

      {heroes.map((hero, index) => (
        <Hero
          key={hero.id}
          def={hero}
          index={index}
          paused={!auto || frozen}
          speed={speed}
          combat={combat}
          victory={victory}
          alive={alive[hero.id] ?? true}
          autoCast={autoCast[hero.id] ?? true}
          hitNonce={hitNonce[hero.id] ?? 0}
          cheerNonce={cheerNonce}
          onAttack={onHeroAttack}
        />
      ))}

      {enemies.map((enemy) => (
        <Enemy
          key={`${waveKey}-${enemy.id}`}
          def={enemy}
          hp={enemyHp[enemy.id] ?? enemy.maxHp}
          paused={!auto || frozen}
          speed={speed}
          onAttack={onEnemyAttack}
        />
      ))}

      {labels.map((label) => (
        <DamageNumber key={label.id} label={label} />
      ))}

      {bolts.map((bolt) => (
        <Bolt key={bolt.id} from={bolt.from} to={bolt.to} />
      ))}
    </>
  );
}

export default function ArenaExperience(props: ArenaExperienceProps) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [0, 9.5, 15], fov: 50 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
    >
      <Suspense fallback={null}>
        <Scene {...props} />
      </Suspense>
    </Canvas>
  );
}
