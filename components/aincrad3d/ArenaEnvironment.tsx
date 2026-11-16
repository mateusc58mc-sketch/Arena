'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { makeGlowTexture } from './toonify';

const TREES = Array.from({ length: 26 }, (_, i) => {
  const angle = (i / 26) * Math.PI * 2 + (i % 3) * 0.19;
  const radius = 25 + (i % 6) * 2.6;
  return {
    position: [Math.cos(angle) * radius, 0, Math.sin(angle) * radius] as [number, number, number],
    scale: 0.85 + (i % 4) * 0.24,
    rotation: angle + (i % 2) * 0.5,
  };
});

const RUINS = Array.from({ length: 8 }, (_, i) => {
  const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
  return {
    position: [Math.cos(angle) * 20.5, 0, Math.sin(angle) * 20.5] as [number, number, number],
    rotation: -angle,
    height: 2.2 + (i % 4) * 0.85,
    broken: i % 3 === 0,
  };
});

const ROCKS = Array.from({ length: 16 }, (_, i) => {
  const angle = (i / 16) * Math.PI * 2 + 0.4;
  const radius = 19 + (i % 5) * 2.1;
  return {
    position: [Math.cos(angle) * radius, 0, Math.sin(angle) * radius] as [number, number, number],
    scale: 0.35 + (i % 4) * 0.22,
    rotation: angle * 1.7,
  };
});

const ARENA_PILLARS = Array.from({ length: 6 }, (_, i) => {
  const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
  return {
    position: [Math.cos(angle) * 17.6, 0, Math.sin(angle) * 17.6] as [number, number, number],
    rotation: -angle,
  };
});

function Tree({
  position,
  scale,
  rotation,
}: {
  position: [number, number, number];
  scale: number;
  rotation: number;
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale}>
      <mesh position={[0, 1.4, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.18, 0.34, 2.8, 6]} />
        <meshStandardMaterial color="#3a2f26" roughness={1} />
      </mesh>
      <mesh position={[0, 3.1, 0]} castShadow receiveShadow>
        <coneGeometry args={[1.28, 2.6, 7]} />
        <meshStandardMaterial color="#173a2c" roughness={0.95} />
      </mesh>
      <mesh position={[0, 4.35, 0]} castShadow receiveShadow>
        <coneGeometry args={[0.98, 2.2, 7]} />
        <meshStandardMaterial color="#1d4936" roughness={0.95} />
      </mesh>
      <mesh position={[0, 5.45, 0]} castShadow receiveShadow>
        <coneGeometry args={[0.68, 1.75, 7]} />
        <meshStandardMaterial color="#25573f" roughness={0.95} />
      </mesh>
    </group>
  );
}

function Ruin({
  position,
  rotation,
  height,
  broken,
}: {
  position: [number, number, number];
  rotation: number;
  height: number;
  broken: boolean;
}) {
  return (
    <group position={position} rotation={[0, rotation, broken ? 0.06 : 0]}>
      <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.7, 0.44, 1.7]} />
        <meshStandardMaterial color="#38403a" roughness={0.96} />
      </mesh>
      <mesh position={[0, height / 2 + 0.44, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.44, 0.58, height, 8]} />
        <meshStandardMaterial color="#4a544b" roughness={0.94} />
      </mesh>
      {broken ? (
        <mesh position={[0.08, height + 0.55, 0]} rotation={[0.3, 0.4, 0.2]} castShadow>
          <cylinderGeometry args={[0.4, 0.34, 0.4, 8]} />
          <meshStandardMaterial color="#4a544b" roughness={0.94} />
        </mesh>
      ) : (
        <mesh position={[0, height + 0.62, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.15, 0.28, 1.15]} />
          <meshStandardMaterial color="#555f53" roughness={0.9} />
        </mesh>
      )}
    </group>
  );
}

function ArenaPillar({
  position,
  rotation,
}: {
  position: [number, number, number];
  rotation: number;
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.75, 0.44, 1.75]} />
        <meshStandardMaterial color="#4c564c" roughness={0.92} />
      </mesh>
      <mesh position={[0, 2.45, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.5, 0.67, 4.1, 8]} />
        <meshStandardMaterial color="#5c675a" roughness={0.9} />
      </mesh>
      <mesh position={[0, 4.72, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.42, 0.34, 1.42]} />
        <meshStandardMaterial color="#6a7566" roughness={0.88} />
      </mesh>
      <mesh position={[0, 5.05, 0]} castShadow>
        <sphereGeometry args={[0.2, 12, 12]} />
        <meshStandardMaterial color="#ffbe6a" emissive="#ff9d3d" emissiveIntensity={1.4} />
      </mesh>
    </group>
  );
}

function Fireflies() {
  const points = useRef<THREE.Points>(null);
  const count = 110;

  const { positions, seeds } = useMemo(() => {
    const positionArray = new Float32Array(count * 3);
    const seedArray = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 4 + Math.random() * 20;
      positionArray[i * 3] = Math.cos(angle) * radius;
      positionArray[i * 3 + 1] = 0.5 + Math.random() * 5;
      positionArray[i * 3 + 2] = Math.sin(angle) * radius;
      seedArray[i] = Math.random() * Math.PI * 2;
    }
    return { positions: positionArray, seeds: seedArray };
  }, []);

  useFrame((state) => {
    if (!points.current) return;
    const t = state.clock.elapsedTime;
    const attribute = points.current.geometry.getAttribute('position') as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;

    for (let i = 0; i < count; i += 1) {
      const seed = seeds[i];
      array[i * 3 + 1] += Math.sin(t * 0.7 + seed) * 0.0025;
      array[i * 3] += Math.cos(t * 0.35 + seed) * 0.0018;
      array[i * 3 + 2] += Math.sin(t * 0.3 + seed * 1.7) * 0.0018;
      if (array[i * 3 + 1] > 6.2) array[i * 3 + 1] = 0.45;
      if (array[i * 3 + 1] < 0.35) array[i * 3 + 1] = 6.1;
    }

    attribute.needsUpdate = true;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#c8ff9e"
        size={0.11}
        sizeAttenuation
        transparent
        opacity={0.8}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

function GroundMist() {
  const texture = useMemo(() => makeGlowTexture('#a9d9c2', 256), []);
  return (
    <group>
      {[
        [0, 0.9, -4, 30, 12, 0.04],
        [-11, 0.7, 6, 24, 10, 0.032],
        [12, 0.8, 2, 24, 10, 0.03],
        [0, 0.6, 14, 26, 9, 0.028],
      ].map(([x, y, z, w, h, opacity], i) => (
        <sprite key={i} position={[x, y, z]} scale={[w, h, 1]}>
          <spriteMaterial
            map={texture}
            color="#8fc4a6"
            transparent
            opacity={opacity}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </sprite>
      ))}
    </group>
  );
}

function Moon() {
  const texture = useMemo(() => makeGlowTexture('#d8fff0', 256), []);
  return (
    <group position={[26, 30, -58]}>
      <sprite scale={[26, 26, 1]}>
        <spriteMaterial
          map={texture}
          color="#9fe6cc"
          transparent
          opacity={0.32}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
      <mesh>
        <circleGeometry args={[3.4, 40]} />
        <meshBasicMaterial color="#d7f5e6" toneMapped={false} />
      </mesh>
    </group>
  );
}

export default function ArenaEnvironment() {
  const stones = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => ({
        z: -0.8 - i * 1.12,
        x: (i % 2 === 0 ? -0.07 : 0.07) + (i % 3 === 0 ? 0.12 : -0.1),
        rotation: (i % 4) * 0.03 - 0.05,
        width: 2.35 + (i % 3) * 0.15,
      })),
    [],
  );

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow>
        <planeGeometry args={[130, 130]} />
        <meshStandardMaterial color="#1a2c22" roughness={1} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[17, 72]} />
        <meshStandardMaterial color="#2b4433" roughness={0.97} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <ringGeometry args={[16.5, 17.05, 72]} />
        <meshStandardMaterial color="#3d5842" roughness={0.9} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.016, 0]}>
        <ringGeometry args={[6.9, 7.1, 72]} />
        <meshStandardMaterial color="#47664c" roughness={0.92} />
      </mesh>

      {/* caminho de lajes até o portal */}
      {stones.map((stone, i) => (
        <mesh
          key={i}
          position={[stone.x, 0.035, stone.z]}
          rotation={[-Math.PI / 2, 0, stone.rotation]}
          receiveShadow
        >
          <planeGeometry args={[stone.width, 1.02]} />
          <meshStandardMaterial color={i % 2 === 0 ? '#505c4d' : '#465244'} roughness={0.96} />
        </mesh>
      ))}

      {ARENA_PILLARS.map((pillar, i) => (
        <ArenaPillar key={i} position={pillar.position} rotation={pillar.rotation} />
      ))}

      {RUINS.map((ruin, i) => (
        <Ruin
          key={i}
          position={ruin.position}
          rotation={ruin.rotation}
          height={ruin.height}
          broken={ruin.broken}
        />
      ))}

      {TREES.map((tree, i) => (
        <Tree key={i} position={tree.position} scale={tree.scale} rotation={tree.rotation} />
      ))}

      {ROCKS.map((rock, i) => (
        <mesh
          key={i}
          position={[rock.position[0], rock.scale * 0.35, rock.position[2]]}
          rotation={[rock.rotation, rock.rotation * 0.7, rock.rotation * 0.3]}
          scale={[rock.scale * 1.4, rock.scale, rock.scale * 1.2]}
          castShadow
          receiveShadow
        >
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#3c4a3f" roughness={1} />
        </mesh>
      ))}

      <Fireflies />
      <GroundMist />
      <Moon />
    </group>
  );
}
