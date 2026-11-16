'use client';

/**
 * RaceAssetModel — renderiza o MODELO REAL de uma raça (public/racas).
 *
 * Pipeline único da prévia de criação e do avatar de combate:
 *  1. carrega GLB ou FBX;
 *  2. normaliza para a altura da raça (asset.height) com pivô nos pés;
 *  3. material:
 *     - modelo com textura embutida → material toon do projeto;
 *     - modelo sem material (FBX do orc) → PBR com os mapas de
 *       albedo/normal/roughness/metalness de /racas/orc/tex.
 */

import * as THREE from 'three';
import { useEffect, useMemo, useState } from 'react';
import { useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three-stdlib';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { buildRaceModel } from '@/lib/raceModel';
import { STANDARD_HEIGHT, type RaceHeroAsset } from '@/lib/racesAssets';
import { toonify } from './aincrad3d/toonify';

type Maps = {
  albedo?: THREE.Texture;
  normal?: THREE.Texture;
  roughness?: THREE.Texture;
  metalness?: THREE.Texture;
};

/** Carrega os mapas externos (só quando o manifesto indica algum). */
function useMaps(asset: RaceHeroAsset): Maps {
  const [maps, setMaps] = useState<Maps>({});

  useEffect(() => {
    const urls = {
      albedo: asset.albedo,
      normal: asset.normal,
      roughness: asset.roughness,
      metalness: asset.metalness,
    };
    if (!urls.albedo && !urls.normal && !urls.roughness && !urls.metalness) return;

    let alive = true;
    const loader = new THREE.TextureLoader();
    const loaded: Maps = {};

    const keys = Object.keys(urls) as (keyof Maps)[];
    let pending = keys.length;

    for (const key of keys) {
      const url = urls[key];
      if (!url) {
        pending -= 1;
        continue;
      }
      loader.load(
        url,
        (texture) => {
          if (key === 'albedo') texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = 4;
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          loaded[key] = texture;
          pending -= 1;
          if (alive && pending <= 0) setMaps({ ...loaded });
        },
        undefined,
        () => {
          pending -= 1;
          if (alive && pending <= 0) setMaps({ ...loaded });
        },
      );
    }

    return () => {
      alive = false;
    };
  }, [asset.albedo, asset.normal, asset.roughness, asset.metalness]);

  return maps;
}

/** Converte as malhas para MeshStandardMaterial usando os mapas externos. */
function applyMaps(root: THREE.Object3D, maps: Maps) {
  if (!maps.albedo && !maps.normal && !maps.roughness && !maps.metalness) return;

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;

    const asArray = Array.isArray(mesh.material);
    const materials = asArray ? mesh.material : [mesh.material];

    const next = (materials as THREE.Material[]).map((material) => {
      const standard = new THREE.MeshStandardMaterial({
        map: maps.albedo ?? (material as THREE.MeshPhongMaterial).map ?? null,
        normalMap: maps.normal ?? null,
        roughnessMap: maps.roughness ?? null,
        metalnessMap: maps.metalness ?? null,
        color: 0xffffff,
        roughness: maps.roughness ? 1 : 0.8,
        metalness: maps.metalness ? 1 : 0.12,
        side: material.side,
        transparent: material.transparent,
        opacity: material.opacity,
        alphaTest: material.alphaTest,
      });
      standard.name = material.name;
      return standard;
    });

    mesh.material = asArray ? next : next[0];
  });
}

/**
 * Abaixa os braços de rigs exportados em T-pose (FK por nome de bone).
 * O orc da pasta racas é um rig do WoW com 41 cópias do esqueleto (uma por
 * geoset); todas as cópias recebem a mesma rotação para o corpo ficar coeso.
 */
function relaxArms(root: THREE.Object3D) {
  root.traverse((object) => {
    if (object.name === 'ork_LeftArm') object.rotateZ(-0.85);
    else if (object.name === 'ork_RightArm') object.rotateZ(0.85);
  });
  root.updateMatrixWorld(true);
}

function Prepared({
  source,
  asset,
}: {
  source: THREE.Object3D;
  asset: RaceHeroAsset;
}) {
  const height = asset.height ?? STANDARD_HEIGHT;
  const externalMaps = Boolean(asset.albedo || asset.normal || asset.roughness || asset.metalness);
  const maps = useMaps(asset);

  const object = useMemo(() => {
    const group = buildRaceModel(skeletonClone(source), height);
    if (asset.lowerArms) relaxArms(group);
    // Modelos com material próprio (GLB) recebem o material toon do projeto;
    // os que dependem de mapas externos (orc) ficam em PBR para preservar
    // normal/roughness/metalness.
    if (!externalMaps) toonify(group);
    if (asset.flip) group.rotation.y = Math.PI;
    return group;
  }, [source, asset.flip, asset.lowerArms, height, externalMaps]);

  useEffect(() => {
    applyMaps(object, maps);
  }, [object, maps]);

  return <primitive object={object} />;
}

function GlbModel({ asset }: { asset: RaceHeroAsset }) {
  const gltf = useLoader(GLTFLoader, asset.model) as { scene: THREE.Group };
  return <Prepared source={gltf.scene} asset={asset} />;
}

function FbxModel({ asset }: { asset: RaceHeroAsset }) {
  const fbx = useLoader(FBXLoader, asset.model) as THREE.Group;
  return <Prepared source={fbx} asset={asset} />;
}

export default function RaceAssetModel({ asset }: { asset: RaceHeroAsset }) {
  if (asset.kind === 'fbx') return <FbxModel asset={asset} />;
  return <GlbModel asset={asset} />;
}
