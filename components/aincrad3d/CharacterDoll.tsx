'use client';

import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { toonify } from './toonify';
import styles from './Arena.module.css';

function DollModel({ url }: { url: string }) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(url);
  const { actions } = useAnimations(animations, group);

  const model = useMemo(() => {
    const copy = skeletonClone(scene);
    toonify(copy);
    return copy;
  }, [scene]);

  useMemo(() => {
    const idle = actions.Idle ?? actions.idle ?? Object.values(actions)[0];
    idle?.reset().fadeIn(0.2).play();
  }, [actions]);

  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.35;
  });

  return (
    <group ref={group} position={[0, -1.1, 0]}>
      <primitive object={model} />
    </group>
  );
}

/** Boneco 3D do personagem usado no paper doll do inventário. */
export default function CharacterDoll({ url }: { url: string }) {
  return (
    <div className={styles.doll}>
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 5], fov: 30 }}
        gl={{ alpha: true, antialias: true }}
        style={{ pointerEvents: 'none' }}
      >
        <ambientLight intensity={1.1} />
        <hemisphereLight args={['#cfe8ff', '#2b3a30', 0.9]} />
        <directionalLight position={[3, 5, 4]} intensity={2.1} color="#fff3dd" />
        <directionalLight position={[-4, 2, -3]} intensity={1.1} color="#7ad7ff" />
        <Suspense fallback={null}>
          <DollModel url={url} />
        </Suspense>
      </Canvas>
    </div>
  );
}
