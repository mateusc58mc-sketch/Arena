'use client';

/**
 * RacePreviewCanvas — viewport 3D de TESTE para a tela de criação de
 * personagem (LOCAL_TEST_ONLY). Cada raça com modelo em `public/racas/`
 * (manifesto race-assets.json) é normalizada para 1,80 m com pivô nos
 * pés e recebe o material mestre (MeshStandardMaterial) do projeto.
 *
 * Simulação de combate (botão "SIMULAR COMBATE" no painel):
 *  - orc            → clips REAIS (atack1/2/3 alternando sobre idle1)
 *  - humano         → clipe único embutido no FBX (reexecuta 1x)
 *  - anao / tauren  → procedural (anticipação → golpe → recuperação)
 *
 * NÃO integra nada ao combate real do jogo — visualização apenas.
 */

import * as THREE from 'three';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls, useProgress } from '@react-three/drei';
// three-stdlib: GLTFLoader com suporte a KHR_materials_pbrSpecularGlossiness
// (usado pelos GLBs Sketchfab do anão/tauren — sem suporte no GLTFLoader
// moderno do three).
import { GLTFLoader } from 'three-stdlib';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { TextureLoader } from 'three';
import {
  loadRacesManifest,
  STANDARD_HEIGHT,
  type RaceAsset,
  type RacesManifest,
} from '@/lib/racesAssets';

// ---------------------------------------------------------------
// helpers de padronização
// ---------------------------------------------------------------

/** Encaixa qualquer modelo em 1,80 m com pivô alinhado aos pés. */
function standardize(obj: THREE.Object3D, scaleH = STANDARD_HEIGHT): THREE.Group {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  // guard NaN: alguns assets (humano pós-cirurgia) podem ter vértices
  // inválidos que vazam no bounding box e envenenam escala/posição
  const sizeY = Number.isFinite(size.y) && size.y > 0.0001 ? size.y : 1.8;
  const scale = scaleH / sizeY;
  const container = new THREE.Group();
  if (Number.isFinite(scale)) {
    // recenter X/Z no eixo do personagem; pés no chão
    const centerX = ((box.min.x + size.x / 2) * scale) || 0;
    const centerZ = ((box.min.z + size.z / 2) * scale) || 0;
    obj.position.set(-centerX, (-box.min.y * scale) || 0, -centerZ);
    obj.scale.setScalar(scale);
  } else {
    console.warn('[racas-preview] bbox não-finita — mantendo escala original');
  }
  container.add(obj);
  return container;
}

/** Cache 1:1 gltf.scene → container normalizado.
 *  Evita que o duplo-render do StrictMode crie dois containers e deixe o
 *  que foi anexado à cena vazio (o gltf.scene é reparentado no segundo). */
const standardizedCache = new WeakMap<THREE.Object3D, THREE.Group>();

const orcBuiltCache = new WeakMap<
  THREE.Object3D,
  { container: THREE.Group; base: THREE.Group }
>();

function getStandardized(source: THREE.Object3D): THREE.Group {
  const cached = standardizedCache.get(source);
  if (cached) return cached;
  const built = standardize(source);
  standardizedCache.set(source, built);
  return built;
}

/** Material mestre do projeto — uniformiza resposta à luz. */
function masterMaterial(opts: {
  map?: THREE.Texture | null;
  normalMap?: THREE.Texture | null;
  roughnessMap?: THREE.Texture | null;
  metalnessMap?: THREE.Texture | null;
}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: opts.map ?? null,
    normalMap: opts.normalMap ?? null,
    roughnessMap: opts.roughnessMap ?? null,
    metalnessMap: opts.metalnessMap ?? null,
    roughness: 0.65,
    metalness: opts.metalnessMap ? 1 : 0.05,
  });
}

function srgb(t: THREE.Texture | null | undefined): THREE.Texture | null {
  if (t) t.colorSpace = THREE.SRGBColorSpace;
  return t ?? null;
}

// ---------------------------------------------------------------
// GLB simples (anao / tauren — sem rig, simulação procedural)
// ---------------------------------------------------------------
function SimpleGlb({ asset, attackNonce }: { asset: RaceAsset; attackNonce: number }) {
  const gltf = useLoader(GLTFLoader, asset.model) as { scene: THREE.Group };
  const object = useMemo(() => getStandardized(gltf.scene), [gltf]);
  // XXX DIAGNÓSTICO TEMPORÁRIO — remover após validação visual
  useEffect(() => {
    try {
      const meshes = (() => { let n = 0; object.traverse((c) => { if ((c as THREE.Mesh).isMesh) n++; }); return n; })();
      console.log(`[racas-preview] simple ${asset.model} MOUNTED meshes=${meshes} box=${JSON.stringify(object.children[0]?.children?.length ?? '?')}`);
    } catch (e) { console.warn('[racas-preview] simple diag falhou', e); }
  }, [object, asset.model]);
  const simRef = useRef({ active: false, t: 0 });

  // material mestre (uniformiza materiais sketchfab spec-gloss)
  useEffect(() => {
    object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const old = mesh.material as THREE.MeshPhysicalMaterial;
      const next = new THREE.MeshStandardMaterial();
      if (old && old.map) {
        next.map = srgb(old.map);
        next.normalMap = (old as THREE.MeshStandardMaterial).normalMap ?? null;
      }
      if (old && old.color) next.color.copy(old.color);
      next.roughness = 0.65;
      mesh.material = next;
    });
  }, [object]);

  // aciona a simulação de combate procedural a cada nonce
  useEffect(() => {
    if (attackNonce > 0) simRef.current = { active: true, t: 0 };
  }, [attackNonce]);

  useFrame((state, dt) => {
    const g = object;
    if (!g) return;
    const t = state.clock.elapsedTime;
    if (simRef.current.active) {
      simRef.current.t += dt;
      const p = simRef.current.t / 1.1; // 1.1s de simulação
      if (p >= 1) {
        simRef.current = { active: false, t: 0 };
        g.rotation.set(0, 0, 0);
        g.position.set(0, 0, 0);
        return;
      }
      // anticipação (0–0.25) → golpe (0.25–0.6) → recuperação (0.6–1)
      const wind = Math.min(1, p / 0.25);
      const swing = p < 0.25 ? 0 : Math.max(0, Math.min(1, (p - 0.25) / 0.35));
      const recover = p < 0.6 ? 0 : Math.max(0, Math.min(1, (p - 0.6) / 0.4));
      g.rotation.y = 0.35 * wind - 1.15 * swing + 0.8 * recover;
      g.rotation.z = -0.18 * swing + 0.18 * recover;
      g.position.z = 0.25 * swing - 0.25 * recover;
      g.position.y = 0.02 * Math.sin(p * Math.PI);
      return;
    }
    // idle procedural: respiração leve
    g.position.y = Math.sin(t * 1.6) * 0.012;
    g.rotation.y = Math.sin(t * 0.7) * 0.05;
  });

  // FIX ATIVO — montar via scene.add (o <primitive> não estava anexando)
  const { scene: previewScene } = useThree();
  useEffect(() => {
    previewScene.add(object);
    console.log('[racas-preview] ADDED simple ' + asset.model + ' uuid=' + object.uuid + ' sceneChildren=' + previewScene.children.length);
    return () => { previewScene.remove(object); };
  }, [object, previewScene]);

  return null;
}

// ---------------------------------------------------------------
// HUMANO — GLTF convertido (1 clipe embutido; reexecuta como sim)
// ---------------------------------------------------------------
function HumanoModel({ asset, attackNonce }: { asset: RaceAsset; attackNonce: number }) {
  const gltf = useLoader(GLTFLoader, asset.model) as {
    scene: THREE.Group;
    animations: THREE.AnimationClip[];
  };
  const container = useMemo(() => getStandardized(gltf.scene), [gltf]);

  // Raiz do mixer = a cena do glTF DIRETO. Evita depender de container[]
  // (StrictMode duplo-invoke do useMemo pode reparentar a cena para um
  // segundo container e deixar o primeiro vazio, enraizando o mixer numa
  // árvore sem nós → PropertyBinding "No target node found").
  // Robustez: se o clipe real não amarrar os bindings (nodes não encontrados)
  // nem puder ser criado (exceção no clipAction), cai no idle procedural —
  // evita página estática e corta os warnings repetitivos do three.
  const proceduralFallback = useRef(false);

  // idle: clipe único em loop
  const mixer = useMemo(() => {
    const scene = gltf.scene;
    const m = new THREE.AnimationMixer(scene);
    const clip = gltf.animations?.[0];
    try {
      if (clip) m.clipAction(clip, scene).play();
    } catch (e) {
      proceduralFallback.current = true;
      console.warn('[racas-preview] humano: clipAction falhou (idle procedural ativado)', e);
    }
    return m;
  }, [gltf]);
  const framesSinceMount = useRef(0);
  // XXX DIAGNÓSTICO TEMPORÁRIO — remover após validação visual
  useEffect(() => {
    try {
      const meshes = (() => { let n = 0; gltf.scene.traverse((c) => { if ((c as THREE.Mesh).isMesh) n++; }); return n; })();
      console.log(`[racas-preview] humano ${asset.model} MOUNTED meshes=${meshes}`);
    } catch (e) { console.warn('[racas-preview] humano diag falhou', e); }
  }, [gltf, asset.model]);

  // simulação: reexecuta o clipe uma vez (botão ⚔️)
  const lastNonce = useRef(attackNonce);
  useEffect(() => {
    if (attackNonce === lastNonce.current) return;
    lastNonce.current = attackNonce;
    const scene = gltf.scene;
    const clip = gltf.animations?.[0];
    if (proceduralFallback.current || !clip || attackNonce === 0) return;
    try {
      const action = mixer.clipAction(clip, scene);
      action.reset();
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = false;
      action.play();
    } catch (e) {
      console.warn('[racas-preview] humano: ataque falhou', e);
    }
  }, [attackNonce, mixer, gltf]);

  useFrame((_, dt) => {
    if (proceduralFallback.current) {
      // respiração leve no CONTAINER (base em 0,0,0 nos pés) — não mexe no
      // position.y da cena, que carrega o offset de encaixe da standardize
      container.position.y = Math.sin(performance.now() * 0.0016) * 0.012;
      container.rotation.y = Math.sin(performance.now() * 0.0007) * 0.05;
      return;
    }
    mixer.update(dt);
    // após ~6 frames confere se o binding amarrou; se não, troca para o
    // fallback procedural e desliga o mixer (para de emitir warnings)
    framesSinceMount.current += 1;
    if (framesSinceMount.current === 6) {
      const bindings = (mixer as unknown as { _bindings?: Array<{ binding?: { node?: unknown } }>; bindings?: Array<{ binding?: { node?: unknown } }> })._bindings ?? (mixer as unknown as { bindings?: Array<{ binding?: { node?: unknown } }> }).bindings ?? [];
      if (bindings.length > 0 && bindings.every((b) => !b.binding?.node)) {
        mixer.stopAllAction();
        proceduralFallback.current = true;
        console.warn('[racas-preview] humano: tracks do clipe não encontraram os nós — usando idle procedural');
      }
    }
  });
  // material mestre (uniformiza com o roughness 0.65 do projeto)
  useEffect(() => {
    const scene = gltf.scene;
    scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const old = mesh.material as THREE.MeshPhysicalMaterial | THREE.MeshStandardMaterial | null;
      const next = new THREE.MeshStandardMaterial();
      if (old && (old as THREE.MeshStandardMaterial).map) {
        next.map = srgb((old as THREE.MeshStandardMaterial).map);
        next.normalMap = (old as THREE.MeshStandardMaterial).normalMap ?? null;
      }
      if (old && (old as THREE.MeshStandardMaterial).color) next.color.copy((old as THREE.MeshStandardMaterial).color);
      next.roughness = 0.65;
      mesh.material = next;
    });
  }, [gltf]);
  // XXX FIX ATIVO — montar via scene.add (o <primitive> não estava anexando)
  const { scene: previewScene } = useThree();
  useEffect(() => {
    previewScene.add(container);
    console.log('[racas-preview] ADDED humano container uuid=' + container.uuid + ' sceneChildren=' + previewScene.children.length);
    return () => { previewScene.remove(container); };
  }, [container, previewScene]);
  return null;
}
// HUMANO fim

// ---------------------------------------------------------------
// ORC — FBX com clips reais + machado + texturas convertidas
// ---------------------------------------------------------------
function OrcModel({ asset, attackNonce }: { asset: RaceAsset; attackNonce: number }) {
  const urls = useMemo(() => {
    const list: string[] = [asset.model];
    if (asset.axe) list.push(asset.axe);
    for (const path of Object.values(asset.anims ?? {})) list.push(path);
    return list;
  }, [asset]);

  const fbxs = useLoader(FBXLoader, urls) as THREE.Group[];

  const texUrls = [
    '/racas/orc/tex/ork_Albedo-hd.jpg',
    '/racas/orc/tex/ork_Normal.png',
    '/racas/orc/tex/ork_Roughness.jpg',
    '/racas/orc/tex/ork_Metallic.jpg',
    '/racas/orc/tex/axe_Albedo.jpg',
    '/racas/orc/tex/axe_Normal.png',
    '/racas/orc/tex/axe_Roughness.jpg',
    '/racas/orc/tex/axe_Metallic.jpg',
  ];
  const texs = useLoader(TextureLoader, texUrls) as THREE.Texture[];
  const [albedo, normal, rough, metal, axeAlbedo, axeNormal, axeRough, axeMetal] = texs;

  const built = useMemo(() => {
    const [base, axe] = fbxs;
    const cached = orcBuiltCache.get(base);
    if (cached) return cached;
    const container = new THREE.Group();

    // material mestre no corpo (ork_*)
    base.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.material = masterMaterial({
          map: srgb(albedo),
          normalMap: normal,
          roughnessMap: rough,
          metalnessMap: metal,
        });
        mesh.castShadow = true;
      }
    });

    // normalização (1.80 m, pés no chão, centrado)
    const box = new THREE.Box3().setFromObject(base);
    const size = box.getSize(new THREE.Vector3());
    const scale = STANDARD_HEIGHT / Math.max(0.0001, size.y);
    const inner = new THREE.Group();
    inner.add(base);
    inner.scale.setScalar(scale);
    inner.position.y = -box.min.y * scale;
    inner.position.x = -(box.min.x + size.x / 2) * scale;
    inner.position.z = -(box.min.z + size.z / 2) * scale;
    container.add(inner);

    // machado (axe_*): prende na mão direita; fallback ao lado do corpo
    if (axe) {
      axe.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.isMesh) {
          m.material = masterMaterial({
            map: srgb(axeAlbedo),
            normalMap: axeNormal,
            roughnessMap: axeRough,
            metalnessMap: axeMetal,
          });
        }
      });
      const axeUnit = new THREE.Group();
      axeUnit.add(axe);
      const axeBox = new THREE.Box3().setFromObject(axe);
      const axeSize = axeBox.getSize(new THREE.Vector3());
      const target = 1.1; // ~1.1 m proporcional ao corpo de 1.8 m
      axeUnit.scale.setScalar(target / Math.max(0.0001, axeSize.y));
      let bone: THREE.Object3D | null = null;
      base.traverse((n) => {
        const name = String(n.name).toLowerCase();
        if (!bone && /hand/.test(name) && (name.includes('right') || /r\b|_r|\.r/.test(name)) && !/left|_l\b|\.l\b/.test(name)) {
          bone = n;
        }
      });
      if (bone) {
        (bone as THREE.Object3D).add(axeUnit);
        axeUnit.position.set(0, 0, 0);
      } else {
        axeUnit.position.set(0.55, 0.9, 0);
        axeUnit.rotation.y = -0.4;
        container.add(axeUnit);
      }
      void axeSize;
    }

    const result = { container, base };
    orcBuiltCache.set(base, result);
    return result;
  }, [fbxs, albedo, normal, rough, metal, axeAlbedo, axeNormal, axeRough, axeMetal]);

  // mixer: idle1 em loop; clips vindos dos FBX @ (mesmo rig da base)
  const mixer = useMemo(() => {
    const m = new THREE.AnimationMixer(built.base);
    const anims = asset.anims ?? {};
    const clipOf = (name: string): THREE.AnimationClip | null => {
      const path = anims[name];
      if (!path) return null;
      const index = urls.indexOf(path);
      if (index < 0) return null;
      const fbxObj = fbxs[index];
      return fbxObj.animations?.[0] ?? null;
    };
    const idle = clipOf('idle1');
    if (idle) m.clipAction(idle).play();
    (m as unknown as { __clipOf?: typeof clipOf }).__clipOf = clipOf;
    return m;
  }, [built, asset, fbxs, urls]);

  /** ciclo de ataque: atack1 → atack2 → atack3 → volta pro idle1 */
  const attackIdx = useRef(0);
  useEffect(() => {
    if (attackNonce === 0) return; // mount inicial
    const clipOf = (mixer as unknown as { __clipOf?: (n: string) => THREE.AnimationClip | null }).__clipOf;
    if (!clipOf) return;
    const prevBack = mixer as unknown as { __backTimer?: number };
    if (prevBack.__backTimer) window.clearTimeout(prevBack.__backTimer);

    attackIdx.current = (attackIdx.current % 3) + 1;
    const clip = clipOf(`atack${attackIdx.current}`);
    if (!clip) return;
    mixer.stopAllAction();
    const action = mixer.clipAction(clip);
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    const back = window.setTimeout(() => {
      mixer.stopAllAction();
      const idle = clipOf('idle1');
      if (idle) mixer.clipAction(idle).reset().play();
    }, clip.duration * 1000 + 120);
    (mixer as unknown as { __backTimer?: number }).__backTimer = back;
  }, [attackNonce, mixer]);

  useFrame((_, dt) => mixer.update(dt));
  // FIX ATIVO — montar via scene.add (o <primitive> não estava anexando)
  const { scene: previewScene } = useThree();
  useEffect(() => {
    previewScene.add(built.container);
    console.log('[racas-preview] ADDED orc container uuid=' + built.container.uuid + ' sceneChildren=' + previewScene.children.length);
    return () => { previewScene.remove(built.container); };
  }, [built, previewScene]);
  return null;
}

// ---------------------------------------------------------------
// dispatch + cena
// ---------------------------------------------------------------
function RaceModel({ raceId, asset, attackNonce }: { raceId: string; asset: RaceAsset; attackNonce: number }) {
  if (raceId === 'orc') return <OrcModel asset={asset} attackNonce={attackNonce} />;
  if (raceId === 'humano') return <HumanoModel asset={asset} attackNonce={attackNonce} />;
  return <SimpleGlb key={raceId} asset={asset} attackNonce={attackNonce} />;
}

function BoxPlaceholder() {
  return (
    <mesh position={[0, 0.9, 0]}>
      <boxGeometry args={[0.55, 1.5, 0.3]} />
      <meshStandardMaterial color="#334155" roughness={0.85} />
    </mesh>
  );
}

function PreviewScene({ raceId, asset, attackNonce }: { raceId: string; asset: RaceAsset; attackNonce: number }) {
  const { scene } = useThree();
  // XXX DIAGNÓSTICO TEMPORÁRIO — remover após validação visual
  useEffect(() => {
    let nMeshes = 0;
    let nSkinned = 0;
    let nLights = 0;
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        nMeshes++;
        if ((o as THREE.SkinnedMesh).isSkinnedMesh) nSkinned++;
      }
      if ((o as THREE.Light) !== undefined) nLights++;
    });
    console.log(`[racas-preview][scene] race=${raceId} meshes=${nMeshes} skinned=${nSkinned} lights=${nLights} children=${scene.children.length}`);
  }, [scene, raceId]);
  // XXX DIAGNÓSTICO TEMPORÁRIO — mede a cena DEPOIS do modelo entrar
  useEffect(() => {
    const id = window.setTimeout(() => {
      let meshes = 0;
      let skinned = 0;
      let visible = 0;
      scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          meshes++;
          if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned++;
          if (o.visible && o.parent?.visible !== false) visible++;
        }
      });
      const box = new THREE.Box3().setFromObject(scene);
      console.log(
        `[racas-preview][after] race=${raceId} meshes=${meshes} skinned=${skinned} visible=${visible} min=${box.min.x.toFixed(2)},${box.min.y.toFixed(2)},${box.min.z.toFixed(2)} max=${box.max.x.toFixed(2)},${box.max.y.toFixed(2)},${box.max.z.toFixed(2)}`,
      );
    }, 1500);
    return () => window.clearTimeout(id);
  }, [scene, raceId]);
  return (
    <>
      <color attach="background" args={['#0b0f1a']} />
      <hemisphereLight intensity={0.75} groundColor="#1a2033" />
      <directionalLight position={[3, 5, 2]} intensity={2.2} color="#ffe9c9" />
      <directionalLight position={[-4, 2, -2]} intensity={0.8} color="#6aa8ff" />
      {/* piso de referência (altura normalizada) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <circleGeometry args={[1.35, 40]} />
        <meshStandardMaterial color="#131a2b" roughness={0.95} metalness={0} />
      </mesh>
      <gridHelper args={[3.6, 24, 0x24314b, 0x1a2338]} position={[0, 0.001, 0]} />
      {/* O modelo fica isolado no Suspense: luzes/piso continuam visíveis
          enquanto o GLB/FBX carrega (antes a tela ficava preta). */}
      <Suspense fallback={null}>
        {asset.status === 'missing-model' ? (
          <BoxPlaceholder />
        ) : (
          <RaceModel raceId={raceId} asset={asset} attackNonce={attackNonce} />
        )}
      </Suspense>
      <OrbitControls
        target={[0, 0.9, 0]}
        enablePan={false}
        minDistance={1.4}
        maxDistance={7}
        maxPolarAngle={Math.PI / 2 + 0.05}
      />
    </>
  );
}

/** Overlay de progresso do carregamento (GLB/FBX podem ser pesados). */
function PreviewProgress() {
  const { active, progress, item } = useProgress();
  if (!active) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: 8,
        top: 8,
        background: 'rgba(15,20,35,0.85)',
        color: '#93a6c7',
        fontSize: 10,
        padding: '4px 8px',
        borderRadius: 6,
        pointerEvents: 'none',
        maxWidth: '80%',
      }}
    >
      Carregando modelo… {Math.round(progress)}%
      {item ? (
        <div style={{ opacity: 0.6, fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {String(item).split('/').pop()}
        </div>
      ) : null}
    </div>
  );
}

function PlaceholderBox({ msg }: { msg: string }) {
  return (
    <div
      style={{
        width: '100%', height: 360, borderRadius: 12, border: '1px dashed #334155',
        background: '#0b0f1a', color: '#64748b', fontSize: 11,
        display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 16,
      }}
    >
      {msg}
    </div>
  );
}

// ---------------------------------------------------------------
// Painel exportado (page.tsx importa via next/dynamic, ssr:false)
// ---------------------------------------------------------------
export default function RacePreviewCanvas({ raceId, attackNonce }: { raceId: string | null; attackNonce: number }) {
  const [manifest, setManifest] = useState<RacesManifest | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadRacesManifest().then((m) => {
      if (!alive) return;
      if (m) setManifest(m);
      else setFailed(true);
    });
    return () => { alive = false; };
  }, []);

  if (!raceId) return <PlaceholderBox msg="Selecione uma raça para ver a prévia 3D." />;
  if (failed || !manifest) return <PlaceholderBox msg="Manifesto de raças indisponível — rode scripts/racas/normalize-races.cjs para gerar public/racas/race-assets.json." />;
  const asset = manifest.races?.[raceId];
  if (!asset) return <PlaceholderBox msg={`Sem modelo 3D local para "${raceId}".`} />;
  if (asset.status === 'missing-model') {
    return <PlaceholderBox msg={`"${raceId}": modelo em falta — ${asset.note ?? 'sem .fbx/.glb disponível'}.`} />;
  }

  return (
    <div style={{ width: '100%', height: 360, position: 'relative' }}>
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 1.35, 3.1], fov: 40, near: 0.05, far: 100 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        style={{ width: '100%', height: '100%' }}
      >
        <Suspense fallback={<BoxPlaceholder />}>
          <PreviewScene raceId={raceId} asset={asset} attackNonce={attackNonce} />
        </Suspense>
      </Canvas>
      <PreviewProgress />
      <div
        style={{
          position: 'absolute', right: 8, bottom: 8, background: 'rgba(15,20,35,0.8)',
          color: '#93a6c7', fontSize: 9, padding: '4px 8px', borderRadius: 6,
        }}
      >
        1.80 m · drag gira · scroll aproxima
      </div>
    </div>
  );
}
