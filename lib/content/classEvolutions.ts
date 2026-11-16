// lib/content/classEvolutions.ts
// Segunda evolução de classes (nível 40+) e árvores de talento (GDD).
// Arquivos base inspirados em classes do GDD, adaptados ao Aetheria.

export interface ClassEvolution {
  id: string;
  baseClass: string;
  name: string;
  levelRequired: number;
  talentTrees: string[];
  role: string;
}

export const CLASS_EVOLUTIONS: ClassEvolution[] = [
  { id: 'arcmago', baseClass: 'mago', name: 'Arcmago', levelRequired: 40, talentTrees: ['Arcano', 'Fogo', 'Gelo'], role: 'DPS Mágico' },
  { id: 'bruxo', baseClass: 'mago', name: 'Bruxo', levelRequired: 40, talentTrees: ['Aflição', 'Sombras', 'Destruição'], role: 'DoT / Sustentado' },
  { id: 'paladino', baseClass: 'guerreiro', name: 'Paladino', levelRequired: 40, talentTrees: ['Proteção', 'Retribuição', 'Sagrado'], role: 'Tanque / Suporte' },
  { id: 'berserker', baseClass: 'guerreiro', name: 'Berserker', levelRequired: 40, talentTrees: ['Fúria', 'Armas', 'Sanguinário'], role: 'DPS Físico' },
  { id: 'atirador_elite', baseClass: 'arqueiro', name: 'Atirador de Elite', levelRequired: 40, talentTrees: ['Precisão', 'Armadilhas', 'Sobrevivência'], role: 'DPS à distância' },
  { id: 'assassino', baseClass: 'arqueiro', name: 'Assassino', levelRequired: 40, talentTrees: ['Venenos', 'Agilidade', 'Subterfúgio'], role: 'DPS Crítico' },
  { id: 'sacerdote_divino', baseClass: 'clerigo', name: 'Sacerdote Divino', levelRequired: 40, talentTrees: ['Disciplina', 'Sagrado', 'Luz'], role: 'Curador' },
  { id: 'inquisidor', baseClass: 'clerigo', name: 'Inquisidor', levelRequired: 40, talentTrees: ['Sombras', 'Mente', 'Vampirismo'], role: 'DPS Mágico / Sustentado' },
];

export function getEvolutions(baseClass: string): ClassEvolution[] {
  return CLASS_EVOLUTIONS.filter((e) => e.baseClass === baseClass);
}
