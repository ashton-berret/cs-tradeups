import type {
  CandidateListing,
  TradeupOutcomeItem,
  TradeupPlan,
  TradeupPlanRule,
} from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { CreateCandidateInput } from '$lib/types/domain';
import type { BasketSlotContext } from '$lib/server/tradeups/evaluation/expectedValue';
import type { CandidateDecisionStatus, ItemExterior, ItemRarity } from '$lib/types/enums';
import { COLLECTION_A, TEST_DATE } from './fixtures';

export function decimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

export function plan(
  overrides: Partial<TradeupPlan> = {},
  relations: {
    rules?: TradeupPlanRule[];
    outcomeItems?: TradeupOutcomeItem[];
  } = {},
): TradeupPlan & { rules: TradeupPlanRule[]; outcomeItems: TradeupOutcomeItem[] } {
  return {
    id: 'plan-1',
    createdAt: TEST_DATE,
    updatedAt: TEST_DATE,
    name: 'Test Plan',
    description: null,
    inputRarity: 'MIL_SPEC',
    targetRarity: 'RESTRICTED',
    isActive: true,
    minProfitThreshold: null,
    minProfitPctThreshold: null,
    minLiquidityScore: null,
    minCompositeScore: null,
    notes: null,
    ...overrides,
    rules: relations.rules ?? [],
    outcomeItems: relations.outcomeItems ?? [],
  };
}

export function rule(overrides: Partial<TradeupPlanRule> = {}): TradeupPlanRule {
  return {
    id: 'rule-1',
    createdAt: TEST_DATE,
    updatedAt: TEST_DATE,
    planId: 'plan-1',
    collection: COLLECTION_A,
    rarity: 'MIL_SPEC',
    exterior: null,
    minFloat: 0,
    maxFloat: 0.2,
    maxBuyPrice: null,
    minQuantity: null,
    maxQuantity: null,
    priority: 0,
    isPreferred: false,
    ...overrides,
  };
}

export function outcome(overrides: Partial<TradeupOutcomeItem> = {}): TradeupOutcomeItem {
  return {
    id: 'outcome-1',
    createdAt: TEST_DATE,
    updatedAt: TEST_DATE,
    planId: 'plan-1',
    marketHashName: 'Output Skin',
    weaponName: null,
    skinName: null,
    collection: COLLECTION_A,
    rarity: 'RESTRICTED',
    estimatedMarketValue: decimal(10),
    probabilityWeight: 1,
    ...overrides,
  };
}

export function slot(overrides: Partial<BasketSlotContext> = {}): BasketSlotContext {
  return {
    inventoryItemId: 'item-1',
    collection: COLLECTION_A,
    exterior: 'FACTORY_NEW',
    floatValue: 0.1,
    rarity: 'MIL_SPEC',
    ...overrides,
  };
}

export function candidateInput(overrides: Partial<CreateCandidateInput> = {}): CreateCandidateInput {
  return {
    marketHashName: 'Input Skin',
    weaponName: undefined,
    skinName: undefined,
    collection: COLLECTION_A,
    rarity: 'MIL_SPEC',
    exterior: 'FACTORY_NEW',
    floatValue: 0.1,
    pattern: undefined,
    inspectLink: undefined,
    listPrice: 10,
    currency: 'USD',
    listingUrl: undefined,
    listingId: undefined,
    source: 'MANUAL',
    notes: undefined,
    ...overrides,
  };
}

export function candidateRow(overrides: Partial<CandidateListing> = {}): CandidateListing {
  return {
    id: 'candidate-1',
    createdAt: TEST_DATE,
    updatedAt: TEST_DATE,
    marketHashName: 'Input Skin',
    weaponName: null,
    skinName: null,
    collection: COLLECTION_A,
    rarity: 'MIL_SPEC',
    exterior: 'FACTORY_NEW',
    floatValue: 0.1,
    pattern: null,
    inspectLink: null,
    listPrice: decimal(10),
    currency: 'USD',
    listingUrl: null,
    listingId: null,
    source: 'MANUAL',
    rawPayload: null,
    status: 'WATCHING',
    qualityScore: null,
    liquidityScore: null,
    expectedProfit: null,
    expectedProfitPct: null,
    maxBuyPrice: null,
    matchedPlanId: null,
    marginalBasketValue: null,
    timesSeen: 1,
    mergeCount: 0,
    lastSeenAt: TEST_DATE,
    evaluationRefreshedAt: null,
    pinnedByUser: false,
    notes: null,
    ...overrides,
  };
}

export function recommendationPlan(overrides: Partial<TradeupPlan> = {}): TradeupPlan {
  return plan(overrides);
}

export const statuses = {
  watching: 'WATCHING' as CandidateDecisionStatus,
  bought: 'BOUGHT' as CandidateDecisionStatus,
  duplicate: 'DUPLICATE' as CandidateDecisionStatus,
};

export const rarities = {
  input: 'MIL_SPEC' as ItemRarity,
  target: 'RESTRICTED' as ItemRarity,
};

export const exteriors = {
  factoryNew: 'FACTORY_NEW' as ItemExterior,
};
