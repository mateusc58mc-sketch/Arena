'use client';

/**
 * RaceBody — corpo PROCEDURAL (primitivas do three.js) de uma raça.
 *
 * Sem assets externos: usado na prévia de criação e como avatar de combate do
 * jogador nas raças que ainda não têm modelo real (public/racas).
 *
 * Regras do projeto:
 *  - altura de referência 1,80 m (raças divergem de propósito para leitura);
 *  - pivô nos pés (y = 0 no chão);
 *  - material com roughness 0.65.
 */

import * as THREE from 'three';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';

type RaceLook = {
  height: number;
  bulk: number; // largura geral (1 = humano)
  headScale: number;
  armLen: number;
  skin: string;
  cloth: string;
  accent: string;
  ears?: 'elfo' | 'goblin' | 'panda';
  horns?: 'tauren' | 'orc';
  beard?: boolean;
  glowEyes?: boolean;
  patches?: boolean;
  tail?: boolean;
};

export const RACE_LOOKS: Record<string, RaceLook> = {
  humano: {
    height: 1.8, bulk: 1, headScale: 1, armLen: 1,
    skin: '#e3b58c', cloth: '#2563eb', accent: '#f59e0b',
  },
  anao: {
    height: 1.45, bulk: 1.4, headScale: 1.12, armLen: 0.92,
    skin: '#dfae83', cloth: '#b45309', accent: '#eab308', beard: true,
  },
  elfo: {
    height: 1.86, bulk: 0.88, headScale: 0.94, armLen: 1.08,
    skin: '#f2d3bb', cloth: '#16a34a', accent: '#a3e635', ears: 'elfo',
  },
  goblin: {
    height: 1.4, bulk: 0.95, headScale: 1.4, armLen: 1.05,
    skin: '#84bf4f', cloth: '#7c2d12', accent: '#facc15', ears: 'goblin',
  },
  orc: {
    height: 1.92, bulk: 1.45, headScale: 1.06, armLen: 1.02,
    skin: '#4f8f3f', cloth: '#7f1d1d', accent: '#d6d3d1', horns: 'orc',
  },
  morto_vivo: {
    height: 1.82, bulk: 0.85, headScale: 0.98, armLen: 1.1,
    skin: '#9aa7a3', cloth: '#334155', accent: '#22d3ee', glowEyes: true,
  },
  troll: {
    height: 2.02, bulk: 1.02, headScale: 0.96, armLen: 1.3,
    skin: '#5b93b5', cloth: '#0f766e', accent: '#fbbf24',
  },
  tauren: {
    height: 2.16, bulk: 1.62, headScale: 1.15, armLen: 1.0,
    skin: '#6d4a30', cloth: '#7c2d12', accent: '#e7e5e4', horns: 'tauren', tail: true,
  },
  pandaren: {
    height: 1.94, bulk: 1.55, headScale: 1.18, armLen: 0.96,
    skin: '#efe7dc', cloth: '#1f2937', accent: '#111827', ears: 'panda', patches: true,
  },
};

const FALLBACK: RaceLook = RACE_LOOKS.humano;

export default function RaceBody({
  raceId,
  idle = true,
}: {
  raceId: string;
  /** Animação de respiração própria (desligue quando o pai já anima). */
  idle?: boolean;
}) {
  const look = RACE_LOOKS[raceId] ?? FALLBACK;
  const group = useRef<THREE.Group>(null);

  const g = useMemo(() => {
    const h = look.height;
    const bulk = look.bulk;
    const legH = h * 0.46;
    const torsoH = h * 0.3;
    const torsoW = h * 0.2 * bulk;
    const torsoD = h * 0.12 * bulk;
    const headR = h * 0.075 * look.headScale;
    const armR = h * 0.03 * Math.min(bulk, 1.25);
    const armL = h * 0.36 * look.armLen;
    const legR = h * 0.045 * Math.min(bulk, 1.2);
    return {
      h, bulk, legH, torsoH, torsoW, torsoD, headR, armR, armL, legR,
      legX: torsoW * 0.42,
      shoulderY: legH + torsoH * 0.9,
      headY: legH + torsoH + headR * 0.92,
      armX: torsoW / 2 + armR * 0.6,
    };
  }, [look]);

  // idle: respiração + leve giro (dá vida sem animação importada)
  useFrame((state) => {
    if (!idle) return;
    const t = state.clock.elapsedTime;
    if (!group.current) return;
    group.current.position.y = Math.sin(t * 1.6) * 0.012;
    group.current.rotation.y = Math.sin(t * 0.55) * 0.16;
  });

  const skinMat = { color: look.skin, roughness: 0.65, metalness: 0.04 };
  const clothMat = { color: look.cloth, roughness: 0.65, metalness: 0.02 };
  const accentMat = { color: look.accent, roughness: 0.65, metalness: 0.06 };

  return (
    <group ref={group}>
      {/* pernas */}
      {[-1, 1].map((side) => (
        <mesh key={`leg${side}`} position={[side * g.legX, g.legH / 2, 0]} castShadow>
          <capsuleGeometry args={[g.legR, g.legH - g.legR * 2, 4, 12]} />
          <meshStandardMaterial {...clothMat} />
        </mesh>
      ))}
      {/* botas */}
      {[-1, 1].map((side) => (
        <mesh key={`boot${side}`} position={[side * g.legX, g.legR * 0.7, g.legR * 0.35]}>
          <boxGeometry args={[g.legR * 2.4, g.legR * 1.5, g.legR * 3.2]} />
          <meshStandardMaterial {...accentMat} />
        </mesh>
      ))}

      {/* torso */}
      <mesh position={[0, g.legH + g.torsoH / 2, 0]} castShadow>
        <boxGeometry args={[g.torsoW, g.torsoH, g.torsoD]} />
        <meshStandardMaterial {...clothMat} />
      </mesh>
      {/* peitoral / detalhe */}
      <mesh position={[0, g.legH + g.torsoH * 0.78, g.torsoD / 2 + 0.004]}>
        <boxGeometry args={[g.torsoW * 0.62, g.torsoH * 0.34, 0.01]} />
        <meshStandardMaterial {...accentMat} />
      </mesh>

      {/* ombros */}
      {[-1, 1].map((side) => (
        <mesh key={`shoulder${side}`} position={[side * g.torsoW * 0.56, g.shoulderY, 0]}>
          <sphereGeometry args={[g.armR * 2.1, 12, 12]} />
          <meshStandardMaterial {...skinMat} />
        </mesh>
      ))}

      {/* braços (levemente abertos) */}
      {[-1, 1].map((side) => (
        <mesh
          key={`arm${side}`}
          position={[side * (g.armX + g.armR * 0.4), g.shoulderY - g.armL / 2, 0]}
          rotation={[0, 0, side * 0.12]}
          castShadow
        >
          <capsuleGeometry args={[g.armR, g.armL - g.armR * 2, 4, 12]} />
          <meshStandardMaterial {...skinMat} />
        </mesh>
      ))}

      {/* pescoço + cabeça */}
      <mesh position={[0, g.legH + g.torsoH + g.headR * 0.25, 0]}>
        <cylinderGeometry args={[g.headR * 0.42, g.headR * 0.5, g.headR * 0.5, 12]} />
        <meshStandardMaterial {...skinMat} />
      </mesh>
      <mesh position={[0, g.headY, 0]} castShadow>
        <sphereGeometry args={[g.headR, 24, 20]} />
        <meshStandardMaterial {...skinMat} />
      </mesh>

      {/* olhos */}
      {[-1, 1].map((side) => (
        <mesh key={`eye${side}`} position={[side * g.headR * 0.36, g.headY + g.headR * 0.08, g.headR * 0.86]}>
          <sphereGeometry args={[g.headR * 0.12, 10, 10]} />
          <meshStandardMaterial
            color={look.glowEyes ? look.accent : '#0b0f1a'}
            emissive={look.glowEyes ? look.accent : '#000000'}
            emissiveIntensity={look.glowEyes ? 2 : 0}
            roughness={0.4}
          />
        </mesh>
      ))}

      {/* orelhas */}
      {look.ears === 'elfo' &&
        [-1, 1].map((side) => (
          <mesh
            key={`ear${side}`}
            position={[side * g.headR * 1.02, g.headY + g.headR * 0.28, -g.headR * 0.1]}
            rotation={[0, 0, side * -0.5]}
          >
            <coneGeometry args={[g.headR * 0.17, g.headR * 0.85, 8]} />
            <meshStandardMaterial {...skinMat} />
          </mesh>
        ))}
      {look.ears === 'goblin' &&
        [-1, 1].map((side) => (
          <mesh
            key={`ear${side}`}
            position={[side * g.headR * 1.15, g.headY + g.headR * 0.1, 0]}
            rotation={[0, 0, side * -1.1]}
          >
            <coneGeometry args={[g.headR * 0.26, g.headR * 1.25, 8]} />
            <meshStandardMaterial {...skinMat} />
          </mesh>
        ))}
      {look.ears === 'panda' &&
        [-1, 1].map((side) => (
          <mesh key={`ear${side}`} position={[side * g.headR * 0.78, g.headY + g.headR * 0.82, 0]}>
            <sphereGeometry args={[g.headR * 0.3, 12, 12]} />
            <meshStandardMaterial color={look.accent} roughness={0.65} />
          </mesh>
        ))}
      {look.patches &&
        [-1, 1].map((side) => (
          <mesh key={`patch${side}`} position={[side * g.headR * 0.38, g.headY + g.headR * 0.12, g.headR * 0.82]}>
            <sphereGeometry args={[g.headR * 0.26, 12, 12]} />
            <meshStandardMaterial color={look.accent} roughness={0.65} />
          </mesh>
        ))}

      {/* barba (anão) */}
      {look.beard && (
        <mesh position={[0, g.headY - g.headR * 0.72, g.headR * 0.45]}>
          <boxGeometry args={[g.headR * 1.05, g.headR * 0.85, g.headR * 0.5]} />
          <meshStandardMaterial color={look.accent} roughness={0.8} />
        </mesh>
      )}

      {/* chifres */}
      {look.horns === 'orc' &&
        [-1, 1].map((side) => (
          <mesh
            key={`tusk${side}`}
            position={[side * g.headR * 0.42, g.headY - g.headR * 0.55, g.headR * 0.72]}
            rotation={[-0.35, 0, side * 0.25]}
          >
            <coneGeometry args={[g.headR * 0.1, g.headR * 0.5, 6]} />
            <meshStandardMaterial {...accentMat} />
          </mesh>
        ))}
      {look.horns === 'tauren' &&
        [-1, 1].map((side) => (
          <mesh
            key={`horn${side}`}
            position={[side * g.headR * 0.92, g.headY + g.headR * 0.55, 0]}
            rotation={[0, 0, side * -0.75]}
          >
            <coneGeometry args={[g.headR * 0.17, g.headR * 1.1, 8]} />
            <meshStandardMaterial {...accentMat} />
          </mesh>
        ))}

      {/* cauda (tauren) */}
      {look.tail && (
        <mesh position={[0, g.legH * 0.85, -g.torsoD * 0.9]} rotation={[0.6, 0, 0]}>
          <capsuleGeometry args={[g.h * 0.014, g.h * 0.1, 4, 8]} />
          <meshStandardMaterial {...skinMat} />
        </mesh>
      )}
    </group>
  );
}
