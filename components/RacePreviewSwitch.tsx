'use client';

/**
 * RacePreviewSwitch — escolhe a melhor prévia disponível para a raça:
 *  - modelo REAL (public/racas) quando a raça tem arquivo publicado;
 *  - avatar ESTILIZADO (procedural) para as demais.
 */

import { hasRaceHeroAsset } from '@/lib/racesAssets';
import { hasRaceRig } from '@/lib/raceRigs';
import RaceModelPreview from './RaceModelPreview';
import RacePreview3D from './RacePreview3D';

export default function RacePreviewSwitch({ raceId }: { raceId: string }) {
  if (hasRaceHeroAsset(raceId) || hasRaceRig(raceId)) {
    return <RaceModelPreview raceId={raceId} />;
  }
  return <RacePreview3D raceId={raceId} />;
}
