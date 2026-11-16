// lib/systems/idle.ts
// Cálculo de progresso offline (terreno para idle real com servidor).
// Hoje é usado para sugerir ganhos quando o jogador retorna.

export interface OfflineProgressInput {
  lastHuntAt: string | null;
  now: string;
  floorExp: number;      // exp por kill no andar
  floorGold: number;     // ouro por kill
  killsPerHour: number; // kills por hora no andar
  capHours?: number;     // cap de horas creditadas (anti-abuso)
}

export interface OfflineProgressResult {
  hoursCredited: number;
  kills: number;
  exp: number;
  gold: number;
}

export function calculateOfflineProgress(input: OfflineProgressInput): OfflineProgressResult {
  const cap = input.capHours ?? 8;
  if (!input.lastHuntAt) {
    return { hoursCredited: 0, kills: 0, exp: 0, gold: 0 };
  }
  const diffMs = new Date(input.now).getTime() - new Date(input.lastHuntAt).getTime();
  if (diffMs <= 0) return { hoursCredited: 0, kills: 0, exp: 0, gold: 0 };

  const hours = Math.min(cap, diffMs / (1000 * 60 * 60));
  const kills = Math.floor(hours * input.killsPerHour);
  return {
    hoursCredited: Math.round(hours * 100) / 100,
    kills,
    exp: kills * input.floorExp,
    gold: kills * input.floorGold,
  };
}
