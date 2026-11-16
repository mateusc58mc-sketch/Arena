'use client';

/**
 * RacePreview3D — prévia 3D ESTILIZADA (procedural) das raças.
 *
 * Não usa nenhum asset externo: o corpo é montado com geometrias primitivas
 * (components/RaceBody.tsx). Funciona em dev e em produção e dá a cada raça
 * uma silhueta/cores próprias.
 */

import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import RaceBody from './RaceBody';

export default function RacePreview3D({ raceId }: { raceId: string }) {
  return (
    <div style={{ width: '100%', height: 380, position: 'relative' }}>
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 1.4, 3.4], fov: 40, near: 0.05, far: 100 }}
        gl={{ antialias: true }}
        style={{ width: '100%', height: '100%' }}
      >
        <color attach="background" args={['#0b0f1a']} />
        <hemisphereLight intensity={1.1} groundColor="#1a2033" />
        <directionalLight position={[3, 5, 2]} intensity={2.1} color="#ffe9c9" />
        <directionalLight position={[-4, 2, -2]} intensity={0.9} color="#6aa8ff" />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]}>
          <circleGeometry args={[1.5, 48]} />
          <meshStandardMaterial color="#131a2b" roughness={0.95} metalness={0} />
        </mesh>
        <gridHelper args={[4, 24, 0x24314b, 0x1a2338]} position={[0, 0.001, 0]} />
        <RaceBody raceId={raceId} />
        <OrbitControls
          target={[0, 0.95, 0]}
          enablePan={false}
          minDistance={1.6}
          maxDistance={7}
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
        prévia estilizada · drag gira · scroll aproxima
      </div>
    </div>
  );
}
