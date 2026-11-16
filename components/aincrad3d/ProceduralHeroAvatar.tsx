'use client';

/**
 * ProceduralHeroAvatar — avatar de combate do jogador para as raças que ainda
 * não têm modelo real (elfo, goblin, morto-vivo, troll, pandaren, humano).
 * Usa o MESMO corpo estilizado da prévia de criação, então o herói criado
 * aparece no combate como o jogador viu na criação.
 */

import RaceBody from '../RaceBody';
import AvatarMotion from './AvatarMotion';
import type { HeroProps } from './Hero';

export default function ProceduralHeroAvatar(props: HeroProps) {
  return (
    <AvatarMotion {...props}>
      <RaceBody raceId={props.def.race ?? 'humano'} idle={false} />
    </AvatarMotion>
  );
}
