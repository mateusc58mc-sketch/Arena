/**
 * Raças 3D — prévia de criação e avatar de combate do jogador.
 *
 * Os modelos vivem em `public/racas/` (o `.vercelignore` publica apenas os
 * arquivos leves: anao, tauren e orc sem as animações). O manifesto
 * `race-assets.json` descreve o que existe; `RACE_HERO_ASSETS` define o que
 * entra no jogo.
 */
export const LOCAL_TEST_ONLY = process.env.NODE_ENV === 'development';

export type RaceAssetStatus = 'ok' | 'partial' | 'missing-model';

export type RaceAsset = {
  status: RaceAssetStatus;
  animation: 'real-clips' | 'embedded-single-clip' | 'procedural' | string;
  model: string;
  axe?: string;
  anims?: Record<string, string>;
  textures?: string;
  clipNames?: string[];
  note?: string;
};

export type RacesManifest = {
  generatedAt: string;
  standardHeight: number;
  localTestOnly: boolean;
  races: Record<string, RaceAsset>;
};

let manifestPromise: Promise<RacesManifest | null> | null = null;

/** Carrega o manifesto gerado por scripts/racas/normalize-races.cjs. */
export function loadRacesManifest(): Promise<RacesManifest | null> {
  if (manifestPromise) return manifestPromise;
  manifestPromise = fetch('/racas/race-assets.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => (json as RacesManifest | null) ?? null)
    .catch(() => null);
  return manifestPromise;
}

/** Andar padrão: modelos alturas divergentes viram 1.80 m. */
export const STANDARD_HEIGHT = 1.8;

// ---------------------------------------------------------------
// Modelos de raça usados no JOGO (arena): prévia + avatar do jogador
// ---------------------------------------------------------------
export type RaceHeroAsset = {
  /** Caminho público do modelo. */
  model: string;
  /** Formato do arquivo. */
  kind: 'glb' | 'gltf' | 'fbx';
  /** Altura em metros na cena (raças divergem de propósito: anão baixo, tauren colossal). */
  height?: number;
  /** Gira 180° o modelo (alguns exportam de costas). */
  flip?: boolean;
  /** Abaixa os braços de modelos em T-pose (FK por nome de bone). */
  lowerArms?: boolean;
  /** Textura de albedo externa (quando o arquivo não tem textura embutida). */
  albedo?: string;
  /** Mapas adicionais (usados quando o modelo vem sem material PBR próprio). */
  normal?: string;
  roughness?: string;
  metalness?: string;
  /** Observação exibida na UI. */
  note?: string;
};

/**
 * Raças com modelo real disponível. As demais usam a prévia estilizada
 * (RacePreview3D) e, em combate, o mesmo corpo estilizado.
 *
 * Para o humano, este asset é o FALLBACK do ModelBoundary: a raça tem rig
 * canônico com clipes (ver `lib/raceRigs.ts`), e o `Hero` usa aquele caminho.
 */
export const RACE_HERO_ASSETS: Partial<Record<string, RaceHeroAsset>> = {
  humano: {
    model: '/racas/human/human_male.glb',
    kind: 'glb',
    height: 1.8,
    note: 'Humano — base modular (masculino).',
  },
  anao: {
    model: '/racas/anao/brann.glb',
    kind: 'glb',
    height: 1.35,
    note: 'Anão — modelo Sketchfab (estático, animação procedural).',
  },
  tauren: {
    model: '/racas/tauren/tauren.glb',
    kind: 'glb',
    height: 3.6,
    note: 'Tauren — rig Mixamo com clipes reais (idle/ataque/dano/morte).',
  },
  orc: {
    model: '/racas/orc/base-mesh.fbx',
    kind: 'fbx',
    height: 2.2,
    lowerArms: true,
    albedo: '/racas/orc/tex/ork_Albedo-hd.jpg',
    normal: '/racas/orc/tex/ork_Normal.png',
    note: 'Orc — malha base FBX com texturas (animação procedural).',
  },
};

/** Modelo real da raça, quando existir. */
export function getRaceHeroAsset(raceId: string | null | undefined): RaceHeroAsset | null {
  if (!raceId) return null;
  return RACE_HERO_ASSETS[raceId] ?? null;
}

/** Prévia/avatar disponível para a raça? */
export function hasRaceHeroAsset(raceId: string | null | undefined): boolean {
  return Boolean(getRaceHeroAsset(raceId));
}
