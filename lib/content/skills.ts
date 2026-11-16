// lib/content/skills.ts

export type SkillType = 'active' | 'passive';

export interface SkillDefinition {
  id: string;
  name: string;
  type: SkillType;
  description: string;
  mpCost: number;
  cooldownMs: number;
  // Multiplicador de dano ou efeito especial
  power: number; // 1.0 = 100% ATK, 2.0 = 200%, etc.
  effect: string;
}

export const SKILLS: SkillDefinition[] = [
  // === Universal ===
  { id: 'basic_attack', name: 'Ataque Básico', type: 'active', description: 'Golpe padrão.', mpCost: 0, cooldownMs: 0, power: 1.0, effect: 'Dano = ATK físico' },

  // === Mago / Arcmago / Bruxo ===
  { id: 'fireball', name: 'Bola de Fogo', type: 'active', description: 'Projétil flamejante.', mpCost: 20, cooldownMs: 2000, power: 2.0, effect: 'Dano mágico x2' },
  { id: 'meteor', name: 'Meteoro', type: 'active', description: 'Chuva de meteoros.', mpCost: 80, cooldownMs: 60000, power: 6.0, effect: 'Dano mágico x6 em área' },
  { id: 'lanca_gelo', name: 'Lança de Gelo', type: 'active', description: 'Estaca de gelo.', mpCost: 25, cooldownMs: 4000, power: 1.4, effect: 'Dano mágico 140% + lentidão' },
  { id: 'impacto_arcano', name: 'Impacto Arcano', type: 'active', description: 'Explosão de mana.', mpCost: 40, cooldownMs: 8000, power: 2.8, effect: 'Dano mágico 280%' },
  { id: 'piromante', name: 'Piromante', type: 'active', description: 'Fogo concentrado.', mpCost: 60, cooldownMs: 12000, power: 4.2, effect: 'Dano mágico 420% + crítico' },
  { id: 'nova_congelante', name: 'Nova Congelante', type: 'active', description: 'Explosão de gelo em área.', mpCost: 50, cooldownMs: 15000, power: 2.0, effect: 'Dano 200% + atordoamento' },
  { id: 'seta_tripla', name: 'Seta Tripla', type: 'active', description: 'Três projéteis mágicos.', mpCost: 35, cooldownMs: 6000, power: 3.3, effect: '3 hits de 110%' },
  { id: 'escudo_glacial', name: 'Escudo Glacial', type: 'active', description: 'Barreira de gelo.', mpCost: 30, cooldownMs: 20000, power: 0, effect: 'Reduz dano recebido 30% por 8s' },
  { id: 'fluxo_arcano', name: 'Fluxo Arcano', type: 'active', description: 'Acelera lançamento.', mpCost: 40, cooldownMs: 25000, power: 0, effect: '+20% MATK por 10s' },

  // === Guerreiro / Paladino / Berserker ===
  { id: 'power_strike', name: 'Golpe Poderoso', type: 'active', description: 'Ataque concentrado.', mpCost: 15, cooldownMs: 4000, power: 2.5, effect: 'Dano físico 250%' },
  { id: 'berserk', name: 'Berserk', type: 'active', description: 'Fúria incontrolável.', mpCost: 30, cooldownMs: 30000, power: 0, effect: '+50% ATK e ASPD por 10s' },
  { id: 'golpear_escudo', name: 'Golpear c/ Escudo', type: 'active', description: 'Bash com escudo.', mpCost: 20, cooldownMs: 5000, power: 1.9, effect: 'Dano 190% + chance de atordoar' },
  { id: 'julgamento', name: 'Julgamento Sagrado', type: 'active', description: 'Luz divina.', mpCost: 45, cooldownMs: 15000, power: 2.6, effect: 'Dano sagrado 260%' },
  { id: 'golpe_retribuicao', name: 'Golpe Retribuição', type: 'active', description: 'Contra-ataque pesado.', mpCost: 35, cooldownMs: 10000, power: 3.8, effect: 'Dano físico 380%' },
  { id: 'luz_sagrada', name: 'Luz Sagrada', type: 'active', description: 'Explosão de luz.', mpCost: 50, cooldownMs: 18000, power: 2.2, effect: 'Dano sagrado + cura 25% HP' },
  { id: 'investida', name: 'Investida', type: 'active', description: 'Carga veloz.', mpCost: 25, cooldownMs: 6000, power: 2.5, effect: 'Dano 250% + empurrão' },
  { id: 'lacerar', name: 'Lacerar', type: 'active', description: 'Cortes múltiplos.', mpCost: 30, cooldownMs: 8000, power: 1.5, effect: '3 hits de 50% + sangramento' },
  { id: 'furia_incontrolavel', name: 'Fúria Incontrolável', type: 'active', description: 'Berserker total.', mpCost: 60, cooldownMs: 40000, power: 0, effect: '+30% ASPD por 12s' },

  // === Arqueiro / Atirador / Assassino ===
  { id: 'arrow_rain', name: 'Chuva de Flechas', type: 'active', description: 'Área denial.', mpCost: 25, cooldownMs: 5000, power: 3.0, effect: '5 hits em área' },
  { id: 'snipe', name: 'Tiro Certeiro', type: 'active', description: 'Crítico garantido.', mpCost: 40, cooldownMs: 15000, power: 4.0, effect: 'Dano x4, crítico garantido' },
  { id: 'disparo_carregado', name: 'Disparo Carregado', type: 'active', description: 'Tiro potente.', mpCost: 30, cooldownMs: 8000, power: 4.0, effect: 'Dano físico 400%' },
  { id: 'armadilha_gelo', name: 'Armadilha Congelante', type: 'active', description: 'Imobiliza inimigo.', mpCost: 35, cooldownMs: 20000, power: 0, effect: 'Dano 150% + imobiliza 3s' },
  { id: 'tiro_marcado', name: 'Tiro Marcado', type: 'active', description: 'Marca o alvo.', mpCost: 20, cooldownMs: 6000, power: 2.0, effect: 'Dano 200% + +20% dano recebido pelo alvo' },
  { id: 'disparo_multiplo', name: 'Disparo Múltiplo', type: 'active', description: 'Três flechas rápidas.', mpCost: 30, cooldownMs: 7000, power: 3.0, effect: '3 hits de 100%' },
  { id: 'olho_aguia', name: 'Olho de Águia', type: 'active', description: 'Precisão letal.', mpCost: 25, cooldownMs: 10000, power: 1.5, effect: '+15% crítico por 10s' },
  { id: 'golpe_duplo', name: 'Golpe Duplo', type: 'active', description: 'Dois golpes rápidos.', mpCost: 20, cooldownMs: 4000, power: 2.2, effect: '2 hits de 110%' },
  { id: 'envenenar_laminas', name: 'Envenenar Lâminas', type: 'active', description: 'Adagas venenosas.', mpCost: 40, cooldownMs: 12000, power: 3.2, effect: 'Dano 320% + veneno (DoT)' },

  // === Clérigo / Sacerdote / Inquisidor ===
  { id: 'heal', name: 'Curar', type: 'active', description: 'Recupera HP.', mpCost: 20, cooldownMs: 3000, power: 0, effect: 'Recupera 30% HP máximo' },
  { id: 'sanctuary', name: 'Santuário', type: 'active', description: 'Cura área.', mpCost: 60, cooldownMs: 45000, power: 0, effect: 'Cura aliados por 15s' },
  { id: 'punicao_divina', name: 'Punição Divina', type: 'active', description: 'Julgamento celestial.', mpCost: 25, cooldownMs: 5000, power: 1.8, effect: 'Dano sagrado 180%' },
  { id: 'nova_sagrada', name: 'Nova Sagrada', type: 'active', description: 'Explosão de luz.', mpCost: 45, cooldownMs: 12000, power: 2.2, effect: 'Dano 220% + cura 10% HP' },
  { id: 'escudo_absorcao', name: 'Escudo de Absorção', type: 'active', description: 'Proteção divina.', mpCost: 30, cooldownMs: 15000, power: 0, effect: 'Escudo que absorve 25% HP por 6s' },
  { id: 'luz_sacerdote', name: 'Luz do Sacerdote', type: 'active', description: 'Raio luminoso.', mpCost: 35, cooldownMs: 8000, power: 2.9, effect: 'Dano sagrado 290%' },
  { id: 'bencao_divina', name: 'Bênção Divina', type: 'active', description: 'Buff completo.', mpCost: 50, cooldownMs: 30000, power: 0, effect: '+10% todos atributos por 12s' },
  { id: 'toque_vampirico', name: 'Toque Vampírico', type: 'active', description: 'Drena vida.', mpCost: 40, cooldownMs: 10000, power: 3.0, effect: 'Dano 300% + cura 40% do dano' },
  { id: 'explosao_insanidade', name: 'Explosão de Insanidade', type: 'active', description: 'Dano mental.', mpCost: 55, cooldownMs: 20000, power: 4.2, effect: 'Dano mágico 420%' },

  // === Passivas ===
  { id: 'pele_aco', name: 'Pele de Aço', type: 'passive', description: 'Aumenta DEF.', mpCost: 0, cooldownMs: 0, power: 0, effect: '+10% DEF' },
  { id: 'foco_letal', name: 'Foco Letal', type: 'passive', description: 'Crítico aumentado.', mpCost: 0, cooldownMs: 0, power: 0, effect: '+25% dano crítico' },
  { id: 'mente_brilhante', name: 'Mente Brilhante', type: 'passive', description: 'INT aumentada.', mpCost: 0, cooldownMs: 0, power: 0, effect: '+12% INT/MP' },
];

export function getSkill(id: string): SkillDefinition | undefined {
  return SKILLS.find((s) => s.id === id);
}

// Skills conhecidas por classe base (para exibição e desbloqueio).
// Não inclui 'basic_attack' — é o auto-attack automático.
export function getSkillsForClass(className: string): string[] {
  const lower = className.toLowerCase();
  const base: string[] = [];

  // [NOVO] Todas as classes têm skills da classe inicial + skills da classe evoluída
  const normalized = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Classe base + evolução
  if (normalized.includes('arcmago') || normalized.includes('bruxo')) {
    return ['fireball', 'meteor', 'lanca_gelo', 'impacto_arcano', 'piromante', 'nova_congelante', 'seta_tripla', 'escudo_glacial', 'fluxo_arcano'];
  }
  if (normalized.includes('mago')) return ['fireball', 'meteor', 'lanca_gelo'];

  if (normalized.includes('paladino') || normalized.includes('berserker')) {
    return ['power_strike', 'berserk', 'investida', 'golpear_escudo', 'julgamento', 'golpe_retribuicao', 'luz_sagrada', 'escudo_glacial', 'bencao_divina', 'lacerar', 'furia_incontrolavel', 'golpe_duplo'];
  }
  if (normalized.includes('guerreiro')) return ['power_strike', 'berserk', 'investida'];

  if (normalized.includes('atirador') || normalized.includes('assassino')) {
    return ['arrow_rain', 'snipe', 'disparo_carregado', 'armadilha_gelo', 'tiro_marcado', 'disparo_multiplo', 'olho_aguia', 'golpe_duplo', 'envenenar_laminas', 'lacerar'];
  }
  if (normalized.includes('arqueiro')) return ['arrow_rain', 'snipe', 'tiro_marcado'];

  if (normalized.includes('sacerdote') || normalized.includes('inquisidor')) {
    return ['heal', 'punicao_divina', 'nova_sagrada', 'escudo_absorcao', 'luz_sacerdote', 'bencao_divina', 'sanctuary', 'toque_vampirico', 'explosao_insanidade'];
  }
  if (normalized.includes('clerigo') || lower.includes('clérigo')) return ['heal', 'punicao_divina', 'nova_sagrada'];

  return base;
}

// ============================================================
// Passivas por classe
// ============================================================

/**
 * Passivas são individuais de cada classe (não são compartilhadas) e ficam
 * sempre ativas — não ocupam os 4 slots de auto-cast.
 */
export const CLASS_PASSIVES: Record<string, string[]> = {
  aprendiz: [],
  guerreiro: ['pele_aco'],
  mago: ['mente_brilhante'],
  arqueiro: ['foco_letal'],
  clerigo: ['pele_aco', 'mente_brilhante'],
  mercenario: ['foco_letal'],
  paladino: ['pele_aco', 'foco_letal'],
  berserker: ['foco_letal'],
  atirador_elite: ['foco_letal'],
  assassino: ['foco_letal'],
  sacerdo_divino: ['mente_brilhante'],
  inquisidor: ['mente_brilhante'],
  arcmago: ['mente_brilhante'],
  bruxo: ['mente_brilhante'],
};

export function normalizeClassKey(className?: string | null) {
  if (!className) return '';
  return className
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_]/g, '');
}

/** Passivas da classe (ids de skill). */
export function getClassPassives(className?: string | null): string[] {
  const key = normalizeClassKey(className);
  if (!key) return [];

  const direct = CLASS_PASSIVES[key];
  if (direct) return direct;

  for (const [name, passives] of Object.entries(CLASS_PASSIVES)) {
    if (key.includes(name)) return passives;
  }

  return [];
}

/** Bônus das passivas de uma classe (aplicados nos atributos derivados). */
export function getPassiveBonus(className?: string | null) {
  const bonus = { defense: 0, critDamage: 0, int: 0 };

  for (const id of getClassPassives(className)) {
    if (id === 'pele_aco') bonus.defense += 0.1;
    if (id === 'foco_letal') bonus.critDamage += 0.25;
    if (id === 'mente_brilhante') bonus.int += 0.12;
  }

  return bonus;
}
