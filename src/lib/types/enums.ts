// Domain enum values as const arrays for use with Zod and general TypeScript code.
// These mirror the Prisma schema enums but are importable from both client and server.

export const ITEM_RARITIES = [
  'CONSUMER_GRADE',
  'INDUSTRIAL_GRADE',
  'MIL_SPEC',
  'RESTRICTED',
  'CLASSIFIED',
  'COVERT',
] as const;
export type ItemRarity = (typeof ITEM_RARITIES)[number];

export const RARITY_TIER: Record<ItemRarity, number> = {
  CONSUMER_GRADE: 0,
  INDUSTRIAL_GRADE: 1,
  MIL_SPEC: 2,
  RESTRICTED: 3,
  CLASSIFIED: 4,
  COVERT: 5,
};

export const RARITY_LABELS: Record<ItemRarity, string> = {
  CONSUMER_GRADE: 'Consumer Grade',
  INDUSTRIAL_GRADE: 'Industrial Grade',
  MIL_SPEC: 'Mil-Spec',
  RESTRICTED: 'Restricted',
  CLASSIFIED: 'Classified',
  COVERT: 'Covert',
};

export function getNextRarity(rarity: ItemRarity): ItemRarity | null {
  const tier = RARITY_TIER[rarity];
  return ITEM_RARITIES.find((r) => RARITY_TIER[r] === tier + 1) ?? null;
}

export function getPreviousRarity(rarity: ItemRarity): ItemRarity | null {
  const tier = RARITY_TIER[rarity];
  return ITEM_RARITIES.find((r) => RARITY_TIER[r] === tier - 1) ?? null;
}

export const ITEM_EXTERIORS = [
  'FACTORY_NEW',
  'MINIMAL_WEAR',
  'FIELD_TESTED',
  'WELL_WORN',
  'BATTLE_SCARRED',
] as const;
export type ItemExterior = (typeof ITEM_EXTERIORS)[number];

export const EXTERIOR_LABELS: Record<ItemExterior, string> = {
  FACTORY_NEW: 'Factory New',
  MINIMAL_WEAR: 'Minimal Wear',
  FIELD_TESTED: 'Field-Tested',
  WELL_WORN: 'Well-Worn',
  BATTLE_SCARRED: 'Battle-Scarred',
};

export const EXTERIOR_SHORT: Record<ItemExterior, string> = {
  FACTORY_NEW: 'FN',
  MINIMAL_WEAR: 'MW',
  FIELD_TESTED: 'FT',
  WELL_WORN: 'WW',
  BATTLE_SCARRED: 'BS',
};

// Float ranges that define each exterior
export const EXTERIOR_FLOAT_RANGES: Record<ItemExterior, [number, number]> = {
  FACTORY_NEW: [0.0, 0.07],
  MINIMAL_WEAR: [0.07, 0.15],
  FIELD_TESTED: [0.15, 0.38],
  WELL_WORN: [0.38, 0.45],
  BATTLE_SCARRED: [0.45, 1.0],
};

export const CANDIDATE_SOURCES = ['EXTENSION', 'MANUAL', 'IMPORT'] as const;
export type CandidateSource = (typeof CANDIDATE_SOURCES)[number];

export const CANDIDATE_DECISION_STATUSES = [
  'WATCHING',
  'GOOD_BUY',
  'PASSED',
  'BOUGHT',
  'DUPLICATE',
  'INVALID',
] as const;
export type CandidateDecisionStatus = (typeof CANDIDATE_DECISION_STATUSES)[number];

export const INVENTORY_STATUSES = [
  'HELD',
  'RESERVED_FOR_BASKET',
  'USED_IN_CONTRACT',
  'SOLD',
  'ARCHIVED',
] as const;
export type InventoryStatus = (typeof INVENTORY_STATUSES)[number];

export const TRADEUP_BASKET_STATUSES = [
  'BUILDING',
  'READY',
  'EXECUTED',
  'CANCELLED',
] as const;
export type TradeupBasketStatus = (typeof TRADEUP_BASKET_STATUSES)[number];
