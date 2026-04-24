// Expected value calculation.
//
// CS2 trade-up odds are collection-weighted:
//   - A contract takes 10 inputs at the same rarity tier.
//   - Each input contributes 1/10 of the "source-collection pick" weight.
//   - The output is drawn from the chosen source collection's outputs at
//     targetRarity; within that collection, each output is equally likely
//     (CS2 does not weight by output within a collection, but we keep the
//     plan's `probabilityWeight` hook for manual tuning).
//
// So for a full basket:
//   For each slot s with collection c_s:
//     P(collection = c) += 1/10  for c = c_s
//   For each outcome o in collection c at targetRarity:
//     P(o) = P(c) * weight(o) / Σ_{o' in c} weight(o')
//   EV = Σ_o P(o) * estimatedMarketValue(o)
//
// For a single candidate (not yet in a basket) we approximate EV by
// assuming the candidate is the only input from its collection in an
// otherwise-same-collection basket. This gives a "best-case single-slot"
// EV which is what the candidate ranking UI surfaces. A more accurate
// marginal-contribution model is Phase 5 work (basket-aware ranking).
//
// Float-to-output-exterior mapping is currently approximate: basket
// averageFloat is mapped through the global exterior bands (`utils/float`).
// Per-skin float range tables are required to correctly price each output
// at its projected exterior; tracked in docs/PROGRESS.md.

import type { Prisma, TradeupPlan } from '@prisma/client';
import type { BasketEVBreakdown } from '$lib/types/services';
import { toNumber } from '$lib/server/utils/decimal';
import { exteriorForFloat, projectOutputFloat } from '$lib/server/utils/float';
import { multiplyMoney, roundMoney } from '$lib/server/utils/money';
import type { ItemExterior } from '$lib/types/enums';
import { DEFAULT_MAX_BUY_MARGIN_PCT } from './tuning';

export interface BasketSlotContext {
  inventoryItemId: string;
  collection: string | null;
  catalogCollectionId?: string | null;
  exterior?: string | null;
  floatValue: number | null;
  rarity: string | null;
}

type OutcomeLike = {
  id: string;
  marketHashName: string;
  collection: string;
  catalogCollectionId?: string | null;
  rarity: string;
  estimatedMarketValue: Prisma.Decimal | number | null;
  probabilityWeight: number;
  minFloat?: number | null;
  maxFloat?: number | null;
  marketHashNames?: Array<{ exterior: ItemExterior; marketHashName: string }>;
};

type PlanWithOutcomes = TradeupPlan & { outcomeItems: OutcomeLike[] };

export interface BasketEVOptions {
  averageInputFloat?: number | null;
}

/**
 * Per-slot, per-collection probability weights. Exported so ranking and
 * analytics can reuse the same math (e.g., "if this held item were added,
 * how would the collection distribution shift?").
 */
export function collectionChances(
  slots: BasketSlotContext[],
): Record<string, number> {
  const chances: Record<string, number> = {};

  for (const slot of slots.slice(0, 10)) {
    const collectionKey = collectionIdentityKey(slot);

    if (!collectionKey) {
      continue;
    }

    chances[collectionKey] = Number(((chances[collectionKey] ?? 0) + 0.1).toFixed(6));
  }

  return chances;
}

/**
 * Full basket EV using the collection-weighted formula in the header.
 * Returns a breakdown so the UI can explain the number ("45% Snakebite,
 * 55% Fracture; top contribution is Printstream at $13.60 expected").
 *
 * Inputs:
 *   - slots: exactly 10 for a real contract, but the math is defined for
 *     any N and the function returns EV / 10 scaling appropriately
 *   - plan: only the outcomeItems are consulted (rules don't affect EV
 *     once the basket is chosen)
 */
export function computeBasketEV(
  slots: BasketSlotContext[],
  plan: PlanWithOutcomes,
  opts: BasketEVOptions = {},
): BasketEVBreakdown {
  const perCollectionChance = collectionChances(slots);
  const outcomesByCollection = new Map<string, OutcomeLike[]>();

  for (const outcome of plan.outcomeItems) {
    if (outcome.rarity !== plan.targetRarity) {
      continue;
    }

    const collectionKey = collectionIdentityKey(outcome);
    const existing = outcomesByCollection.get(collectionKey) ?? [];
    existing.push(outcome);
    outcomesByCollection.set(collectionKey, existing);
  }

  const perOutcomeContribution: BasketEVBreakdown['perOutcomeContribution'] = [];

  for (const [collection, collectionChance] of Object.entries(perCollectionChance)) {
    const outcomes = outcomesByCollection.get(collection) ?? [];
    const totalWeight = outcomes.reduce((sum, outcome) => sum + outcome.probabilityWeight, 0);

    if (outcomes.length === 0 || totalWeight <= 0) {
      continue;
    }

    for (const outcome of outcomes) {
      const probability = collectionChance * (outcome.probabilityWeight / totalWeight);
      const estimatedValue = toNumber(outcome.estimatedMarketValue) ?? 0;
      const contribution = multiplyMoney(estimatedValue, probability);
      const projection = projectOutcome(outcome, opts.averageInputFloat);

      perOutcomeContribution.push({
        outcomeId: outcome.id,
        marketHashName: outcome.marketHashName,
        probability: Number(probability.toFixed(6)),
        estimatedValue,
        contribution,
        projectedFloat: projection.projectedFloat,
        projectedExterior: projection.projectedExterior,
        projectedMarketHashName: projection.projectedMarketHashName,
      });
    }
  }

  return {
    totalEV: roundMoney(perOutcomeContribution.reduce((sum, outcome) => sum + outcome.contribution, 0)),
    perCollectionChance,
    perOutcomeContribution: perOutcomeContribution.sort((a, b) => b.contribution - a.contribution),
  };
}

/**
 * Approximate EV for a single candidate, assuming a hypothetical basket of
 * 10 items from the candidate's own collection. Used to rank candidates
 * before they are in a basket.
 *
 * Returns null when the plan has no outcomes in the candidate's collection
 * at targetRarity (the candidate technically matches the plan's rules but
 * contributes nothing to the output pool).
 */
export function computeCandidateEV(
  candidate: Pick<BasketSlotContext, 'collection' | 'catalogCollectionId'>,
  plan: PlanWithOutcomes,
): number | null {
  const candidateCollectionKey = collectionIdentityKey(candidate);

  if (!candidateCollectionKey) {
    return null;
  }

  const outcomes = plan.outcomeItems.filter(
    (outcome) => collectionIdentityKey(outcome) === candidateCollectionKey && outcome.rarity === plan.targetRarity,
  );
  const totalWeight = outcomes.reduce((sum, outcome) => sum + outcome.probabilityWeight, 0);

  if (outcomes.length === 0 || totalWeight <= 0) {
    return null;
  }

  return roundMoney(
    outcomes.reduce((sum, outcome) => {
      const estimatedValue = toNumber(outcome.estimatedMarketValue) ?? 0;
      return sum + estimatedValue * (outcome.probabilityWeight / totalWeight);
    }, 0),
  );
}

/**
 * Derive a max buy price for a candidate from its EV and the plan's
 * thresholds.
 *
 *   maxBuyPrice = EV - targetProfit
 * where `targetProfit` is (in preference order):
 *   1. plan.minProfitThreshold (absolute)
 *   2. plan.minProfitPctThreshold applied against EV
 *   3. DEFAULT_MAX_BUY_MARGIN_PCT from tuning.ts (null by default — returns
 *      null so the UI can render "—" with an explanatory tooltip instead of
 *      silently assuming a margin)
 */
export function computeMaxBuyPrice(
  candidateEV: number,
  plan: TradeupPlan,
): number | null {
  if (!Number.isFinite(candidateEV) || candidateEV <= 0) {
    return null;
  }

  const explicitProfit = toNumber(plan.minProfitThreshold);
  const pctProfit =
    plan.minProfitPctThreshold != null ? candidateEV * (plan.minProfitPctThreshold / 100) : null;
  const fallbackProfit =
    DEFAULT_MAX_BUY_MARGIN_PCT != null ? candidateEV * DEFAULT_MAX_BUY_MARGIN_PCT : null;
  const targetProfit = explicitProfit ?? pctProfit ?? fallbackProfit;

  if (targetProfit == null) {
    return null;
  }

  const maxBuyPrice = candidateEV - targetProfit;

  return maxBuyPrice >= 0 ? roundMoney(maxBuyPrice) : null;
}

/**
 * Marginal EV contribution of adding one slot to an existing set of slots.
 *
 * Δ = EV(slots ∪ new) - EV(slots)
 *
 * Phase 5 ranking uses this to rank held items by how much they improve
 * a specific basket. Scaffolded here so the UI contract is stable now.
 */
export function computeMarginalContribution(
  baseSlots: BasketSlotContext[],
  candidate: BasketSlotContext,
  plan: PlanWithOutcomes,
): number {
  const before = computeBasketEV(baseSlots, plan).totalEV;
  const after = computeBasketEV([...baseSlots, candidate], plan).totalEV;
  return roundMoney(after - before);
}

function collectionIdentityKey(
  value: { catalogCollectionId?: string | null; collection?: string | null },
): string {
  return value.catalogCollectionId ?? value.collection ?? '';
}

function projectOutcome(
  outcome: OutcomeLike,
  averageInputFloat: number | null | undefined,
): {
  projectedFloat: number | null;
  projectedExterior: ItemExterior | null;
  projectedMarketHashName: string | null;
} {
  if (averageInputFloat == null || outcome.minFloat == null || outcome.maxFloat == null) {
    return {
      projectedFloat: null,
      projectedExterior: null,
      projectedMarketHashName: null,
    };
  }

  const projectedFloat = projectOutputFloat(averageInputFloat, outcome.minFloat, outcome.maxFloat);
  const projectedExterior = exteriorForFloat(projectedFloat);
  const projectedMarketHashName =
    outcome.marketHashNames?.find((entry) => entry.exterior === projectedExterior)?.marketHashName ?? null;

  return {
    projectedFloat,
    projectedExterior,
    projectedMarketHashName,
  };
}
