import type { Object3D } from 'three';

/**
 * raceRigs — personagens MODULARES por raça.
 *
 * Diferente de `RACE_HERO_ASSETS` (modelos estáticos para prévia), aqui ficam
 * os modelos com ESQUELETO e clipes de animação. A ideia é que cada raça seja
 * montada por peças (geosets) presas a bones nomeados, permitindo trocar
 * armadura/armas depois sem trocar o personagem inteiro.
 */

export type RaceRigClipKind = 'idle' | 'attack' | 'hit' | 'death';

export type RaceRigAttachment = {
  /** Nome do bone de destino (ver `bones`). */
  bone: string;
  /** Objeto já carregado (arma, escudo, mochila...). */
  object: Object3D;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
};

export type RaceRig = {
  /** Modelo rigado (FBX/GLB com skin). */
  model: string;
  /** Formato do modelo: `'fbx'` (padrão) ou `'glb'` com clipes embutidos. */
  kind?: 'fbx' | 'glb';
  /** Altura final em metros. */
  height: number;
  /**
   * Textura de cada geoset (peça). A chave é o número da geoset extraído do
   * nome da malha (`...Geoset_047-Braces` → `047`). Rig GLB embutido pode
   * omitir (texturas aparecem no próprio arquivo).
   */
  textures: Record<string, string>;
  /** Clipes de animação (arquivos com um AnimationClip cada). Vazio quando os clipes moram no modelo (`kind: 'glb'`). */
  clips: Partial<Record<RaceRigClipKind, string>>;
  /** Clipes embutidos no propre modelo (GLB): mapeados por sufixo do nome (`HUMANO_IDLE` → `idle`). */
  embedClips?: boolean;
  /** Bones usados para prender equipamentos. */
  bones: {
    rightHand: string;
    leftHand: string;
    back?: string;
    head?: string;
  };
  /** Velocidade aplicada ao clipe de ataque para caber no ritmo do combate. */
  attackTimeScale?: number;
  note?: string;
};

const TAUREN_TEX = {
  '000': '/racas/tauren/tex/tauren-0.png',
  '005': '/racas/tauren/tex/tauren-0.png',
  '027': '/racas/tauren/tex/tauren-0.png',
  '018': '/racas/tauren/tex/tauren-2.png',
  '001': '/racas/tauren/tex/tauren-1.png',
  '002': '/racas/tauren/tex/tauren-1.png',
  '003': '/racas/tauren/tex/tauren-1.png',
  '004': '/racas/tauren/tex/tauren-1.png',
  '047': '/racas/tauren/tex/tauren-1.png',
  '052': '/racas/tauren/tex/tauren-1.png',
  '061': '/racas/tauren/tex/tauren-1.png',
  '062': '/racas/tauren/tex/tauren-1.png',
  '076': '/racas/tauren/tex/tauren-1.png',
};

/**
 * Raças com rig + clipes reais. As demais seguem no pipeline estático
 * (`RaceAssetModel`) ou no corpo estilizado.
 */
export const RACE_RIGS: Partial<Record<string, RaceRig>> = {
  humano: {
    model: '/racas/human/human_male_rigged.glb',
    kind: 'glb',
    height: 1.8,
    textures: {},
    clips: {},
    embedClips: true,
    bones: {
      // Nomes como o three sanitiza no GLTFLoader ( ':' é reservado ):
      // 'mixamorig:RightHand' → 'mixamorigRightHand'.
      rightHand: 'mixamorigRightHand',
      leftHand: 'mixamorigLeftHand',
      back: 'mixamorigSpine2',
      head: 'mixamorigHead',
    },
    // Clipe de ataque tem 2,23 s; 3,0× encaixa na janela de golpe (0,4–0,8 s).
    attackTimeScale: 3.0,
    note: 'Humano — BaseMesh_Man_Simple rigado no Mixamo (65 bones), clipes HUMANO_* embutidos. Bind ~1,79m, pés no chão (0,09m).',
  },
  tauren: {
    model: '/racas/tauren/rigged.fbx',
    height: 3.6,
    textures: TAUREN_TEX,
    clips: {
      idle: '/racas/tauren/clips/idle.fbx',
      attack: '/racas/tauren/clips/attack.fbx',
      hit: '/racas/tauren/clips/hit.fbx',
      death: '/racas/tauren/clips/death.fbx',
    },
    bones: {
      rightHand: 'mixamorigRightHand',
      leftHand: 'mixamorigLeftHand',
      back: 'mixamorigSpine2',
      head: 'mixamorigHead',
    },
    attackTimeScale: 1.35,
    note: 'Tauren — rig Mixamo, clipes de espada e escudo, texturas por geoset.',
  },
};

export function getRaceRig(raceId: string | null | undefined): RaceRig | null {
  if (!raceId) return null;
  return RACE_RIGS[raceId] ?? null;
}

export function hasRaceRig(raceId: string | null | undefined): boolean {
  return Boolean(getRaceRig(raceId));
}

/** Retorna as URLs únicas de texturas do rig (ordem estável). */
export function rigTextureUrls(rig: RaceRig): string[] {
  return [...new Set(Object.values(rig.textures))];
}

/** Retorna as URLs de clipes do rig na ordem fixa do tipo (vazio quando embutidos). */
export function rigClipUrls(rig: RaceRig): string[] {
  return CLIP_ORDER.filter((kind) => rig.clips[kind]).map((kind) => rig.clips[kind]!);
}

const CLIP_ORDER: RaceRigClipKind[] = ['idle', 'attack', 'hit', 'death'];
