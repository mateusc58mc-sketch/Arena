'use client';

/**
 * useRiggedCharacter — monta um personagem MODULAR a partir de um `RaceRig`.
 *
 * - carrega o modelo rigado e os clipes (idle/attack/hit/death);
 * - troca o material de cada geoset pela textura mapeada em `rig.textures`;
 * - normaliza a altura e o pivô nos pés (buildRaceModel);
 * - devolve os bones por nome para prender equipamentos depois.
 *
 * Modularidade: `hiddenGeosets` esconde peças (ex.: capacete do corpo base) e
 * `attachments` prende objetos a bones (arma na mão, escudo no antebraço,
 * mochila nas costas), tudo por nome — sem trocar o personagem inteiro.
 */

import * as THREE from 'three';
import { useEffect, useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { buildRaceModel } from '@/lib/raceModel';
import {
  rigClipUrls,
  rigTextureUrls,
  type RaceRig,
  type RaceRigAttachment,
  type RaceRigClipKind,
} from '@/lib/raceRigs';

export type RiggedCharacter = {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Partial<Record<RaceRigClipKind, THREE.AnimationAction>>;
  /** Malhas por número de geoset (para trocar/esconder peças). */
  geosets: Map<string, THREE.Mesh[]>;
  /** Bones por nome (pontos de encaixe de equipamento). */
  bones: Map<string, THREE.Object3D>;
};

export type RiggedCharacterOptions = {
  /** Números de geoset que devem ficar invisíveis (ex.: `['047']`). */
  hiddenGeosets?: string[];
  /** Objetos presos a bones (clonados a cada personagem). */
  attachments?: RaceRigAttachment[];
};

const CLIP_ORDER: RaceRigClipKind[] = ['idle', 'attack', 'hit', 'death'];

export function useRiggedCharacter(
  rig: RaceRig,
  options: RiggedCharacterOptions = {},
): RiggedCharacter {
  const { hiddenGeosets, attachments } = options;
  const isGlb = rig.kind === 'glb';
  const modelLoader = useMemo(
    () => (isGlb ? GLTFLoader : FBXLoader),
    [isGlb],
  ) as unknown as typeof FBXLoader;

  // GLB embutido: o próprio arquivo traz `scene` + `animations`; FBX: grupo só.
  const loaded = useLoader(
    modelLoader,
    rig.model,
  ) as unknown as THREE.Group & { scene: THREE.Group; animations: THREE.AnimationClip[] };

  const source = isGlb ? loaded.scene : loaded;
  const embeddedAnimations = isGlb ? loaded.animations : null;

  const clipUrls = useMemo(
    () => (isGlb ? [] : rigClipUrls(rig)),
    [isGlb, rig],
  );
  const clipFiles = useLoader(FBXLoader, clipUrls) as THREE.Group[];
  const textureUrls = useMemo(() => rigTextureUrls(rig), [rig]);
  const textures = useLoader(THREE.TextureLoader, textureUrls) as THREE.Texture[];

  const character = useMemo(() => {
    const textureByUrl = new Map<string, THREE.Texture>();
    textureUrls.forEach((url, i) => {
      const texture = textures[i];
      if (!texture) return;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      texture.needsUpdate = true;
      textureByUrl.set(url, texture);
    });

    const root = buildRaceModel(skeletonClone(source) as THREE.Group, rig.height);
    const geosets = new Map<string, THREE.Mesh[]>();
    const bones = new Map<string, THREE.Object3D>();

    root.traverse((object) => {
      if ((object as THREE.Bone).isBone) bones.set(object.name, object);

      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;

      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;

      const geoset = (mesh.name.match(/Geoset[_.](\d+)/i) || [])[1];
      if (!geoset) return;

      const texture = textureByUrl.get(rig.textures[geoset]);
      if (texture) {
        mesh.material = new THREE.MeshToonMaterial({
          map: texture,
          color: 0xffffff,
          side: THREE.DoubleSide,
        });
      }

      const list = geosets.get(geoset) ?? [];
      list.push(mesh);
      geosets.set(geoset, list);
    });

    const mixer = new THREE.AnimationMixer(root);
    const actions: Partial<Record<RaceRigClipKind, THREE.AnimationAction>> = {};
    if (embeddedAnimations) {
      // Clipes moram no GLB: casa o sufixo (`HUMANO_IDLE` → `idle`).
      CLIP_ORDER.forEach((kind) => {
        const clip = embeddedAnimations.find((a) =>
          a.name.toUpperCase().includes(kind.toUpperCase()),
        );
        if (clip) actions[kind] = mixer.clipAction(clip);
      });
    } else {
      const kindByUrl = new Map<string, RaceRigClipKind>();
      CLIP_ORDER.forEach((kind) => {
        const url = rig.clips[kind];
        if (url) kindByUrl.set(url, kind);
      });
      clipUrls.forEach((url, i) => {
        const clip = clipFiles[i]?.animations?.[0];
        const kind = kindByUrl.get(url);
        if (clip && kind) actions[kind] = mixer.clipAction(clip);
      });
    }

    return { root, mixer, actions, geosets, bones };
  }, [source, clipFiles, textures, textureUrls, rig, embeddedAnimations]);

  // ---- peças escondidas (equipamento futuro) ----
  useEffect(() => {
    const hidden = new Set(hiddenGeosets ?? []);
    character.geosets.forEach((meshes, geoset) => {
      const visible = !hidden.has(geoset);
      meshes.forEach((mesh) => {
        mesh.visible = visible;
      });
    });
  }, [character.geosets, hiddenGeosets]);

  // ---- equipamentos presos a bones (clonados por personagem) ----
  useEffect(() => {
    const added: THREE.Object3D[] = [];
    for (const item of attachments ?? []) {
      const bone = character.bones.get(item.bone);
      if (!bone) continue;

      const object = item.object.clone(true);
      if (item.position) object.position.fromArray(item.position);
      if (item.rotation) object.rotation.fromArray(item.rotation);
      if (item.scale !== undefined) {
        if (typeof item.scale === 'number') object.scale.setScalar(item.scale);
        else object.scale.fromArray(item.scale);
      }
      bone.add(object);
      added.push(object);
    }

    return () => {
      added.forEach((object) => object.removeFromParent());
    };
  }, [character, attachments]);

  return character;
}
