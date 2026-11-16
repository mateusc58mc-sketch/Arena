import type { Metadata } from 'next';
import ArenaClient from '@/components/aincrad3d/ArenaClient';

export const metadata: Metadata = {
  title: 'AINCRAD · Arena 3D',
  description:
    'Arena 3D de Aincrad com os quatro heróis, waves de lobos, Illfang e o portal do vazio.',
};

export default function ArenaPage() {
  return <ArenaClient />;
}
