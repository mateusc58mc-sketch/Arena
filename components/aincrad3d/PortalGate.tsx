'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PORTAL_POSITION } from './data';
import { makeGlowTexture } from './toonify';

const CENTER_Y = 3.55;
const VOID_RADIUS = 3.3;
const ARCH_RADIUS = 3.58;
const STONE = '#5a6157';
const STONE_DARK = '#3c433d';
const STONE_LIGHT = '#767d70';
const MOSS = '#2f6b45';

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uOpen;
  uniform float uSeed;
  uniform vec3 uDeep;
  uniform vec3 uMid;
  uniform vec3 uBright;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float mask = smoothstep(1.0, 0.93, r);
    if (mask <= 0.001) discard;

    float angle = atan(p.y, p.x);
    float t = uTime * 0.3 + uSeed * 17.0;

    vec2 q = p * 2.1;
    float warp = noise(q * 1.6 + vec2(t, -t) + uSeed * 5.0);

    float spiral = sin(angle * 3.0 + r * 10.0 - uTime * 1.35 + warp * 3.4);
    float spiral2 = sin(angle * -5.0 + r * 17.0 + uTime * 0.95 + warp * 2.1);

    float vein = smoothstep(0.15, 1.0, spiral * 0.5 + 0.5);
    float vein2 = smoothstep(0.5, 1.0, spiral2 * 0.5 + 0.5);

    float core = pow(smoothstep(1.0, 0.04, r), 1.45);
    float edge = smoothstep(0.55, 1.0, r);

    vec3 color = mix(uDeep, uMid, core * 0.92 + 0.06);
    color = mix(color, uBright, vein * 0.46 * (0.35 + core));
    color += uBright * vein2 * 0.22 * edge;

    float rim = smoothstep(0.85, 0.975, r) * (1.0 - smoothstep(0.975, 1.0, r));
    color += uBright * rim * 1.9;

    float flare = smoothstep(0.28, 0.0, r) * (0.6 + 0.4 * sin(uTime * 2.1 + uSeed * 9.0));
    color += uBright * flare * 0.45;

    float alpha = mask * uOpen;
    alpha *= 0.8 + 0.2 * sin(angle * 6.0 + uTime * 1.5 + uSeed * 3.0);

    gl_FragColor = vec4(color, alpha);
  }
`;

function createVoidMaterial(seed: number) {
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms: {
      uTime: { value: 0 },
      uOpen: { value: 0 },
      uSeed: { value: seed },
      uDeep: { value: new THREE.Color('#03130c') },
      uMid: { value: new THREE.Color('#0a8354') },
      uBright: { value: new THREE.Color('#8dffc9') },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

function ArchStones({ material }: { material: THREE.Material }) {
  const stones = useMemo(() => {
    const count = 13;
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / (count - 1)) * Math.PI;
      const length = (Math.PI * ARCH_RADIUS) / (count - 1) + 0.14;
      return {
        angle,
        length,
        position: [
          Math.cos(angle) * (ARCH_RADIUS + 0.3),
          CENTER_Y + Math.sin(angle) * (ARCH_RADIUS + 0.3),
          0,
        ] as [number, number, number],
        depth: 1.42 + (i % 2) * 0.08,
        shade: i % 3,
      };
    });
  }, []);

  return (
    <group>
      {stones.map((stone, i) => (
        <mesh
          key={i}
          position={stone.position}
          rotation={[0, 0, stone.angle + Math.PI / 2]}
          material={material}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[stone.length, 0.88, stone.depth]} />
        </mesh>
      ))}
    </group>
  );
}

function Pillar({ side }: { side: 1 | -1 }) {
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: STONE,
        roughness: 0.92,
        metalness: 0.02,
      }),
    [],
  );

  const dark = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: STONE_DARK,
        roughness: 0.95,
      }),
    [],
  );

  const light = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: STONE_LIGHT,
        roughness: 0.85,
      }),
    [],
  );

  return (
    <group position={[side * 4.05, 0, 0]}>
      {/* base */}
      <mesh position={[0, 0.28, 0]} material={dark} castShadow receiveShadow>
        <boxGeometry args={[2.1, 0.56, 2.05]} />
      </mesh>
      <mesh position={[0, 0.68, 0]} material={material} castShadow receiveShadow>
        <boxGeometry args={[1.68, 0.32, 1.68]} />
      </mesh>

      {/* shaft */}
      <mesh position={[0, 2.15, 0]} material={material} castShadow receiveShadow>
        <boxGeometry args={[1.18, 2.62, 1.24]} />
      </mesh>
      <mesh position={[0, 1.22, 0]} material={dark} castShadow receiveShadow>
        <boxGeometry args={[1.32, 0.18, 1.36]} />
      </mesh>
      <mesh position={[0, 3.05, 0]} material={light} castShadow receiveShadow>
        <boxGeometry args={[1.34, 0.22, 1.38]} />
      </mesh>

      {/* capital */}
      <mesh position={[0, 3.52, 0]} material={material} castShadow receiveShadow>
        <boxGeometry args={[1.72, 0.34, 1.62]} />
      </mesh>
      <mesh position={[0, 3.78, 0]} material={light} castShadow receiveShadow>
        <boxGeometry args={[1.94, 0.24, 1.78]} />
      </mesh>

      {/* inner face carvings */}
      <mesh position={[side * -0.62, 2.2, 0.4]} material={dark} castShadow>
        <boxGeometry args={[0.09, 1.9, 0.46]} />
      </mesh>
      <mesh position={[side * -0.62, 2.2, -0.4]} material={dark} castShadow>
        <boxGeometry args={[0.09, 1.9, 0.46]} />
      </mesh>

      {/* mossy patches */}
      <mesh position={[side * 0.2, 0.95, 0.65]} material={dark}>
        <boxGeometry args={[0.7, 0.1, 0.05]} />
      </mesh>
      <mesh position={[side * -0.25, 2.75, 0.66]}>
        <boxGeometry args={[0.55, 0.08, 0.04]} />
        <meshStandardMaterial color={MOSS} roughness={1} />
      </mesh>

      {/* finial */}
      <mesh position={[0, 4.12, 0]} rotation={[0, Math.PI / 4, 0]} material={material} castShadow>
        <coneGeometry args={[0.36, 0.62, 4]} />
      </mesh>
    </group>
  );
}

function HoodedStatue({ side }: { side: 1 | -1 }) {
  const robe = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#4d574e',
        roughness: 1,
      }),
    [],
  );

  return (
    <group position={[side * 6.15, 0, 0.9]} rotation={[0, side * -0.18, 0]}>
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.18, 0.6, 1.18]} />
        <meshStandardMaterial color={STONE_DARK} roughness={0.96} />
      </mesh>
      <mesh position={[0, 1.35, 0]} material={robe} castShadow receiveShadow>
        <cylinderGeometry args={[0.34, 0.72, 1.7, 10]} />
      </mesh>
      <mesh position={[0, 2.28, 0]} material={robe} castShadow>
        <sphereGeometry args={[0.38, 16, 14]} />
      </mesh>
      <mesh position={[0, 2.2, 0.24]} rotation={[0.18, 0, 0]}>
        <circleGeometry args={[0.27, 18]} />
        <meshStandardMaterial color="#070b09" roughness={1} />
      </mesh>
      <mesh position={[-0.12, 2.21, 0.33]}>
        <sphereGeometry args={[0.045, 8, 8]} />
        <meshBasicMaterial color="#8bffca" toneMapped={false} />
      </mesh>
      <mesh position={[0.12, 2.21, 0.33]}>
        <sphereGeometry args={[0.045, 8, 8]} />
        <meshBasicMaterial color="#8bffca" toneMapped={false} />
      </mesh>
      <mesh position={[side * -0.48, 1.72, 0.12]} rotation={[0.25, 0, side * 0.5]} material={robe} castShadow>
        <cylinderGeometry args={[0.11, 0.15, 0.85, 7]} />
      </mesh>
      <mesh position={[side * -0.82, 1.32, 0.3]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshStandardMaterial color="#6f7a68" roughness={1} />
      </mesh>
    </group>
  );
}

function Brazier({ side }: { side: 1 | -1 }) {
  const flame = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const flicker = 0.86 + Math.sin(t * 9 + side) * 0.1 + Math.sin(t * 23 + side * 2) * 0.04;
    if (flame.current) {
      flame.current.scale.set(0.92 + flicker * 0.1, flicker, 0.92 + flicker * 0.1);
      flame.current.rotation.y = t * 1.4 * side;
    }
    if (light.current) light.current.intensity = 9 * flicker;
  });

  return (
    <group position={[side * 5.15, 0, 2.15]}>
      <mesh position={[0, 0.18, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.5, 0.68, 0.36, 8]} />
        <meshStandardMaterial color={STONE_DARK} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.85, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.26, 1.15, 8]} />
        <meshStandardMaterial color={STONE} roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.5, 0]} castShadow>
        <cylinderGeometry args={[0.55, 0.32, 0.38, 10]} />
        <meshStandardMaterial color="#4a4f45" roughness={0.85} metalness={0.2} />
      </mesh>

      <group ref={flame} position={[0, 1.78, 0]}>
        <mesh position={[0, 0.24, 0]}>
          <coneGeometry args={[0.25, 0.62, 8]} />
          <meshBasicMaterial color="#ffb35c" toneMapped={false} transparent opacity={0.9} />
        </mesh>
        <mesh position={[0, 0.12, 0]}>
          <coneGeometry args={[0.18, 0.42, 8]} />
          <meshBasicMaterial color="#fff0b8" toneMapped={false} />
        </mesh>
      </group>

      <pointLight
        ref={light}
        position={[0, 1.9, 0.2]}
        color="#ffa552"
        intensity={9}
        distance={9}
        decay={2}
      />
    </group>
  );
}

function VoidMotes({ openRef }: { openRef: React.MutableRefObject<number> }) {
  const count = 90;
  const points = useRef<THREE.Points>(null);
  const material = useRef<THREE.PointsMaterial>(null);

  const { positions, speeds } = useMemo(() => {
    const positionArray = new Float32Array(count * 3);
    const speedArray = new Float32Array(count);

    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * (VOID_RADIUS - 0.35);
      positionArray[i * 3] = Math.cos(angle) * radius;
      positionArray[i * 3 + 1] = CENTER_Y + Math.sin(angle) * radius;
      positionArray[i * 3 + 2] = 0.34 + Math.random() * 0.2;
      speedArray[i] = 0.22 + Math.random() * 0.75;
    }

    return { positions: positionArray, speeds: speedArray };
  }, []);

  useFrame((_, delta) => {
    if (!points.current || !material.current) return;

    const attribute = points.current.geometry.getAttribute('position') as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;

    for (let i = 0; i < count; i += 1) {
      const yIndex = i * 3 + 1;
      array[yIndex] += delta * speeds[i];
      if (array[yIndex] > CENTER_Y + VOID_RADIUS - 0.25) {
        array[yIndex] = CENTER_Y - VOID_RADIUS + 0.35;
      }
    }

    attribute.needsUpdate = true;
    material.current.opacity = openRef.current * 0.82;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        ref={material}
        color="#a8ffd6"
        size={0.085}
        sizeAttenuation
        transparent
        opacity={0}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

export default function PortalGate({ open }: { open: boolean }) {
  const root = useRef<THREE.Group>(null);
  const voidGroup = useRef<THREE.Group>(null);
  const ringMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const portalLight = useRef<THREE.PointLight>(null);
  const glowMaterial = useRef<THREE.SpriteMaterial>(null);
  const shockwave = useRef<THREE.Mesh>(null);
  const shockwaveMaterial = useRef<THREE.MeshBasicMaterial>(null);

  const openRef = useRef(0);
  const burstStart = useRef(-1);
  const wasOpen = useRef(false);

  const outerMaterial = useMemo(() => createVoidMaterial(0.13), []);
  const runesMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#79ffc0',
        transparent: true,
        opacity: 0.24,
        toneMapped: false,
      }),
    [],
  );

  const glowTexture = useMemo(() => makeGlowTexture('#6dffba', 256), []);

  const stoneMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: STONE,
        roughness: 0.93,
        metalness: 0.02,
      }),
    [],
  );

  useFrame((state, delta) => {
    const elapsed = state.clock.elapsedTime;
    openRef.current = THREE.MathUtils.damp(openRef.current, open ? 1 : 0, 2.2, delta);
    const value = openRef.current;

    outerMaterial.uniforms.uTime.value = elapsed;
    outerMaterial.uniforms.uOpen.value = value;

    if (voidGroup.current) {
      const scale = 0.08 + value * 0.92;
      voidGroup.current.scale.setScalar(scale);
      voidGroup.current.visible = value > 0.012;
    }

    if (ringMaterial.current) {
      ringMaterial.current.opacity = 0.16 + value * 0.75;
    }

    runesMaterial.opacity = 0.24 + value * 0.72;

    if (portalLight.current) {
      portalLight.current.intensity = 1.2 + value * 55;
    }

    if (glowMaterial.current) {
      glowMaterial.current.opacity = value * 0.38;
    }

    if (open && !wasOpen.current) {
      wasOpen.current = true;
      burstStart.current = elapsed;
    }
    if (!open) {
      wasOpen.current = false;
    }

    if (shockwave.current && shockwaveMaterial.current) {
      const age = elapsed - burstStart.current;
      if (burstStart.current >= 0 && age >= 0 && age < 2.4) {
        const progress = age / 2.4;
        shockwave.current.visible = true;
        shockwave.current.scale.setScalar(1 + progress * 18);
        shockwave.current.position.y = 0.06 + progress * 0.12;
        shockwaveMaterial.current.opacity = Math.pow(1 - progress, 2.2) * 0.85;
      } else {
        shockwave.current.visible = false;
      }
    }

    if (root.current) {
      root.current.position.y = PORTAL_POSITION[1] + Math.sin(elapsed * 0.55) * 0.02;
    }
  });

  useEffect(() => {
    return () => {
      outerMaterial.dispose();
      stoneMaterial.dispose();
      runesMaterial.dispose();
      glowTexture.dispose();
    };
  }, [outerMaterial, stoneMaterial, runesMaterial, glowTexture]);

  return (
    <group ref={root} position={PORTAL_POSITION}>
      {/* platform / threshold */}
      <mesh position={[0, 0.14, 0.3]} receiveShadow castShadow>
        <boxGeometry args={[9.6, 0.3, 2.5]} />
        <meshStandardMaterial color={STONE_DARK} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.32, 0.3]} receiveShadow castShadow>
        <boxGeometry args={[8.3, 0.14, 1.9]} />
        <meshStandardMaterial color={STONE} roughness={0.92} />
      </mesh>

      {/* dark sealed backing */}
      <mesh position={[0, CENTER_Y, -0.35]}>
        <circleGeometry args={[VOID_RADIUS + 0.06, 72]} />
        <meshBasicMaterial color="#03100a" />
      </mesh>

      {/* arch structure */}
      <Pillar side={-1} />
      <Pillar side={1} />
      <ArchStones material={stoneMaterial} />

      {/* keystone + crown */}
      <group position={[0, CENTER_Y + ARCH_RADIUS + 0.62, 0.05]}>
        <mesh castShadow>
          <boxGeometry args={[1.55, 1.05, 1.65]} />
          <meshStandardMaterial color={STONE_LIGHT} roughness={0.86} />
        </mesh>
        <mesh position={[0, 0.68, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <boxGeometry args={[1.05, 0.4, 1.05]} />
          <meshStandardMaterial color={STONE} roughness={0.9} />
        </mesh>

        {/* serpent horns */}
        <mesh position={[-0.72, 0.46, 0]} rotation={[0, 0, 0.62]} castShadow>
          <coneGeometry args={[0.16, 1.05, 6]} />
          <meshStandardMaterial color={STONE_DARK} roughness={0.9} />
        </mesh>
        <mesh position={[0.72, 0.46, 0]} rotation={[0, 0, -0.62]} castShadow>
          <coneGeometry args={[0.16, 1.05, 6]} />
          <meshStandardMaterial color={STONE_DARK} roughness={0.9} />
        </mesh>

        <mesh>
          <octahedronGeometry args={[0.38, 0]} />
          <meshBasicMaterial color="#8bffca" toneMapped={false} />
        </mesh>
        <pointLight color="#7dffc2" intensity={3} distance={6} position={[0, 0, 0.9]} />
      </group>

      {/* runes */}
      <mesh position={[0, CENTER_Y + ARCH_RADIUS + 0.78, 0.9]} material={runesMaterial}>
        <planeGeometry args={[0.72, 0.16]} />
      </mesh>

      {[-1, 1].map((side) =>
        [1.25, 2.0, 2.75].map((y, i) => (
          <mesh
            key={`${side}-${y}`}
            position={[side * 3.43, y, 0.66]}
            rotation={[0, 0, side * 0.05]}
            material={runesMaterial}
          >
            <planeGeometry args={[0.16, 0.42 - i * 0.03]} />
          </mesh>
        )),
      )}

      {/* void */}
      <group ref={voidGroup} position={[0, CENTER_Y, 0.18]}>
        <mesh>
          <circleGeometry args={[VOID_RADIUS, 96]} />
          <primitive object={outerMaterial} attach="material" />
        </mesh>
      </group>

      {/* glowing rim */}
      <mesh position={[0, CENTER_Y, 0.3]}>
        <torusGeometry args={[VOID_RADIUS + 0.04, 0.055, 12, 96]} />
        <meshBasicMaterial
          ref={ringMaterial}
          color="#7dffc2"
          transparent
          opacity={0.16}
          toneMapped={false}
        />
      </mesh>

      {/* halo behind the gate */}
      <sprite position={[0, CENTER_Y, -0.5]} scale={[12, 12, 1]}>
        <spriteMaterial
          ref={glowMaterial}
          map={glowTexture}
          color="#49ffab"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>

      <VoidMotes openRef={openRef} />

      <pointLight
        ref={portalLight}
        position={[0, CENTER_Y, 2.6]}
        color="#63ffb2"
        intensity={1.2}
        distance={34}
        decay={2}
      />

      {/* statues + braziers */}
      <HoodedStatue side={-1} />
      <HoodedStatue side={1} />
      <Brazier side={-1} />
      <Brazier side={1} />

      {/* opening shockwave */}
      <mesh ref={shockwave} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0.3]} visible={false}>
        <ringGeometry args={[0.92, 1.06, 64]} />
        <meshBasicMaterial
          ref={shockwaveMaterial}
          color="#7dffc2"
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

