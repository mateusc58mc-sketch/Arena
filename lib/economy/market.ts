// lib/economy/market.ts
// Terreno preparado para o mercado RMT futuro. A implementação real (escrow,
// transações, RLS) virá depois, mas estes contratos permitem que itens e
// moedas sejam modelados desde já.

export type CurrencyType = 'gold' | 'premium'; // premium = moeda de cash/RMT futuro

export interface Wallet {
  character_id: string;
  gold: number;
  premium: number;
}

export const MARKET_FEE_PERCENT = 0.07; // 7% de taxa do jogo
export const MIN_LISTING_PRICE = 1;
export const MAX_LISTING_HOURS = 72;

export interface MarketListingInput {
  sellerCharacterId: string;
  itemId: string; // inventory.id (bloqueado em escrow ao listar)
  itemName: string;
  price: number;
  currency: CurrencyType;
  durationHours: number;
}

export interface MarketListing {
  id: string;
  sellerCharacterId: string;
  buyerCharacterId?: string;
  itemId: string;
  itemName: string;
  price: number;
  currency: CurrencyType;
  status: 'active' | 'sold' | 'cancelled' | 'expired';
  createdAt: string;
  expiresAt: string;
}

// Preço líquido recebido pelo vendedor após taxa.
export function sellerProceeds(price: number): number {
  return Math.floor(price * (1 - MARKET_FEE_PERCENT));
}

// Taxa retida pelo jogo.
export function marketFee(price: number): number {
  return price - sellerProceeds(price);
}

// Validação básica de listagem (terreno para regras futuras).
export function validateListing(input: MarketListingInput): string | null {
  if (input.price < MIN_LISTING_PRICE) return 'Preço abaixo do mínimo.';
  if (input.durationHours <= 0 || input.durationHours > MAX_LISTING_HOURS) return 'Duração inválida.';
  if (!input.itemId) return 'Item inválido.';
  return null;
}
