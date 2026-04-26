// Evaluation service — the orchestrator.
//
// This is the one entry point the rest of the app calls when it wants a
// number. It composes ruleMatching + expectedValue + scoring + recommendation
// into a single operation per target kind and persists the result.
//
// Public surface:
//   evaluate(target)            — router for the /api/tradeups/evaluate endpoint
//   evaluateCandidate(id)       — called by candidateService on ingest / re-eval
//   evaluateInventoryItem(id)   — called by planner UI to rank held items
//   evaluateBasket(id)          — called by basketService.recomputeMetrics
//
// Every evaluator is pure-ish: it reads current state, computes, and
// persists the result onto the target row (or returns it for baskets where
// basketService does the writing). They do not cascade into other
// evaluators — cascading is the caller's responsibility so re-eval fan-out
// stays predictable.

import type {
  BasketEvaluation,
  CandidateEvaluation,
  EvaluateTarget,
  EvaluationResult,
  InventoryEvaluation,
} from '$lib/types/services';
import type { CandidateDecisionStatus, ItemRarity } from '$lib/types/enums';
import { db } from '$lib/server/db/client';
import { NotFoundError } from '$lib/server/http/errors';
import { toDecimalOrNull, toNumber } from '$lib/server/utils/decimal';
import { averageFloat, averageWearProportion } from '$lib/server/utils/float';
import { enrichSlotsWithInputRanges } from './inputFloatRanges';
import { percentChange, roundMoney, sumMoney } from '$lib/server/utils/money';
import {
  computeBasketEV,
  computeCandidateEV,
  computeMaxBuyPrice,
  computeMarginalContribution,
  type BasketSlotContext,
} from './expectedValue';
import { deriveRecommendation } from './recommendation';
import { computeLiquidityScore, computeQualityScore, type LiquiditySignal } from './scoring';
import { LIQUIDITY_DENSITY_WINDOW_MS } from './tuning';
import {
  diagnoseCandidateAgainstPlans,
  matchCandidateToPlans,
  pickBestMatch,
  toCandidateLike,
} from './ruleMatching';
import { basketReadinessIssues } from './readiness';
import { withCatalogOutcomeFloatRanges } from './catalogOutcomes';

/**
 * Dispatch on target kind. Mirrors the union defined in
 * `$lib/types/services` and is the shape accepted by
 * POST /api/tradeups/evaluate.
 */
export function evaluate(target: EvaluateTarget): Promise<EvaluationResult> {
  if (target.kind === 'candidate') {
    return evaluateCandidate(target.id).then((result) => ({ kind: 'candidate', result }));
  }

  if (target.kind === 'inventory') {
    return evaluateInventoryItem(target.id).then((result) => ({ kind: 'inventory', result }));
  }

  return evaluateBasket(target.id).then((result) => ({ kind: 'basket', result }));
}

/**
 * Evaluate one candidate.
 *   1. load candidate + all active plans (with rules + outcomes)
 *   2. ruleMatching.matchCandidateToPlans
 *   3. pick best match (may be null)
 *   4. expectedValue.computeCandidateEV for best match
 *   5. expectedValue.computeMaxBuyPrice
 *   6. scoring.computeQualityScore + computeLiquidityScore
 *   7. recommendation.deriveRecommendation
 *   8. persist: matchedPlanId, qualityScore, liquidityScore, expectedProfit,
 *      expectedProfitPct, maxBuyPrice, status (unless user-pinned)
 */
export function evaluateCandidate(
  candidateId: string,
): Promise<CandidateEvaluation> {
  return evaluateCandidateImpl(candidateId);
}

/**
 * Evaluate a held inventory item against all plans.
 * Returns eligible plan ids and, for the best-fit plan, marginalContribution
 * relative to the most advanced in-progress basket on that plan (if any).
 *
 * Does not persist — inventory rows do not store evaluation output directly.
 * The UI consumes this result to render planner suggestions.
 */
export function evaluateInventoryItem(
  inventoryItemId: string,
): Promise<InventoryEvaluation> {
  return evaluateInventoryItemImpl(inventoryItemId);
}

/**
 * Evaluate a basket.
 *   1. load basket with items (inventory join) and plan with outcomes
 *   2. readiness checks: item count, uniform rarity, matches plan.inputRarity,
 *      required float/collection coverage
 *   3. expectedValue.computeBasketEV (collection-weighted formula)
 *   4. compute expectedProfit / expectedProfitPct against totalCost
 *   5. return the full evaluation — basketService.recomputeMetrics persists
 *      the scalar fields onto the basket row
 */
export function evaluateBasket(basketId: string): Promise<BasketEvaluation> {
  return evaluateBasketImpl(basketId);
}

async function evaluateCandidateImpl(candidateId: string): Promise<CandidateEvaluation> {
  const candidate = await db.candidateListing.findUnique({ where: { id: candidateId } });

  if (!candidate) {
    throw new NotFoundError(`Candidate not found: ${candidateId}`);
  }

  const plans = await db.tradeupPlan.findMany({
    where: { isActive: true },
    include: { rules: true, outcomeItems: true },
  });
  const candidateLike = toCandidateLike(candidate);
  const allMatches = matchCandidateToPlans(candidateLike, plans);
  const diagnostics = diagnoseCandidateAgainstPlans(candidateLike, plans);
  const bestMatch = pickBestMatch(allMatches);
  const plan = bestMatch ? plans.find((item) => item.id === bestMatch.planId) ?? null : null;
  const pricedPlan = plan ? await withCatalogOutcomeFloatRanges(plan) : null;
  const candidateEV = plan
    ? computeCandidateEV(
        {
          collection: candidate.collection,
          catalogCollectionId: candidate.catalogCollectionId,
        },
        pricedPlan ?? plan,
      )
    : null;
  const expectedProfit = candidateEV == null ? null : roundMoney(candidateEV - (toNumber(candidate.listPrice) ?? 0));
  const expectedProfitPct =
    candidateEV == null ? null : percentChange(toNumber(candidate.listPrice) ?? 0, candidateEV);
  const computedMaxBuy = candidateEV != null && plan ? computeMaxBuyPriceBounded(candidateEV, plan, bestMatch) : null;
  const matchedRule = bestMatch?.ruleId ? plan?.rules.find((rule) => rule.id === bestMatch.ruleId) : null;
  const qualityScore = matchedRule ? computeQualityScore(candidateLike, matchedRule) : (bestMatch?.fitScore ?? 0);
  const liquiditySignal = await loadLiquiditySignal(candidate.marketHashName, candidate.id);
  const liquidityScore = computeLiquidityScore(
    {
      marketHashName: candidate.marketHashName,
      collection: candidate.collection,
      rarity: candidate.rarity,
    },
    liquiditySignal,
  );
  const previousStatus = candidate.status as CandidateDecisionStatus;
  const recommendation = deriveRecommendation({
    plan,
    expectedProfit,
    expectedProfitPct,
    qualityScore,
    liquidityScore,
    previousStatus,
    previousPinnedByUser: candidate.pinnedByUser,
  });
  const marginalBasketValue = plan
    ? await computeMarginalForActiveBasket(pricedPlan ?? plan, candidate)
    : null;

  await db.candidateListing.update({
    where: { id: candidate.id },
    data: {
      matchedPlanId: plan?.id ?? null,
      qualityScore,
      liquidityScore,
      expectedProfit: toDecimalOrNull(expectedProfit),
      expectedProfitPct,
      maxBuyPrice: toDecimalOrNull(computedMaxBuy),
      marginalBasketValue: toDecimalOrNull(marginalBasketValue),
      status: recommendation,
      evaluationRefreshedAt: new Date(),
    },
  });

  return {
    candidateId: candidate.id,
    matchedPlanId: plan?.id ?? null,
    allMatches,
    diagnostics,
    qualityScore,
    liquidityScore,
    expectedProfit,
    expectedProfitPct,
    maxBuyPrice: computedMaxBuy,
    recommendation,
  };
}

async function evaluateInventoryItemImpl(inventoryItemId: string): Promise<InventoryEvaluation> {
  const item = await db.inventoryItem.findUnique({ where: { id: inventoryItemId } });

  if (!item) {
    throw new NotFoundError(`Inventory item not found: ${inventoryItemId}`);
  }

  const plans = await db.tradeupPlan.findMany({
    where: { isActive: true, inputRarity: item.rarity ?? undefined },
    include: { rules: true, outcomeItems: true },
  });
  const candidateLike = toCandidateLike(item);
  const matches = matchCandidateToPlans(candidateLike, plans);
  const bestMatch = pickBestMatch(matches);
  const bestPlan = bestMatch ? plans.find((plan) => plan.id === bestMatch.planId) ?? null : null;
  let marginalContribution: number | null = null;

  if (bestPlan) {
    const basket = await db.tradeupBasket.findFirst({
      where: {
        planId: bestPlan.id,
        status: { in: ['BUILDING', 'READY'] },
      },
      include: { items: { include: { inventoryItem: true }, orderBy: { slotIndex: 'asc' } } },
      orderBy: [{ updatedAt: 'desc' }],
    });
    const baseSlots = basket?.items.map((basketItem) => toBasketSlotContext(basketItem.inventoryItem)) ?? [];

    marginalContribution = computeMarginalContribution(baseSlots, toBasketSlotContext(item), bestPlan);
  }

  return {
    inventoryItemId: item.id,
    eligiblePlanIds: matches.map((match) => match.planId),
    bestPlanId: bestMatch?.planId ?? null,
    marginalContribution,
  };
}

async function evaluateBasketImpl(basketId: string): Promise<BasketEvaluation> {
  const basket = await db.tradeupBasket.findUnique({
    where: { id: basketId },
    include: {
      plan: { include: { outcomeItems: true, rules: true } },
      items: { include: { inventoryItem: true }, orderBy: { slotIndex: 'asc' } },
    },
  });

  if (!basket) {
    throw new NotFoundError(`Basket not found: ${basketId}`);
  }

  const inventoryItems = basket.items.map((item) => item.inventoryItem);
  const slots = await enrichSlotsWithInputRanges(inventoryItems);
  const inputCost = sumMoney(inventoryItems.map((item) => toNumber(item.purchasePrice)));
  const avgFloat = averageFloat(inventoryItems.map((item) => item.floatValue));
  const avgWearProportion = averageWearProportion(slots);
  const projectedPlan = await withCatalogOutcomeFloatRanges(basket.plan);
  const ev = computeBasketEV(slots, projectedPlan, { averageWearProportion: avgWearProportion });
  const expectedProfit = roundMoney(ev.totalEV - inputCost);
  const expectedProfitPct = percentChange(inputCost, ev.totalEV);
  const readinessIssues = basketReadinessIssues(
    basket.plan.inputRarity as ItemRarity,
    basket.plan.rules,
    slots,
  );

  return {
    basketId: basket.id,
    inputCost,
    ev,
    expectedProfit,
    expectedProfitPct,
    averageFloat: avgFloat,
    readinessIssues,
  };
}

function computeMaxBuyPriceBounded(
  candidateEV: number,
  plan: NonNullable<Parameters<typeof deriveRecommendation>[0]['plan']>,
  bestMatch: ReturnType<typeof pickBestMatch>,
): number | null {
  const fallback = computeMaxBuyPrice(candidateEV, plan);
  const values = [fallback, bestMatch?.maxBuyPrice ?? null].filter(
    (value): value is number => value != null,
  );

  return values.length > 0 ? Math.min(...values) : null;
}

async function computeMarginalForActiveBasket(
  plan: Parameters<typeof computeMarginalContribution>[2],
  candidate: {
    id: string;
    collection: string | null;
    catalogCollectionId?: string | null;
    floatValue: number | null;
    rarity: string | null;
  },
): Promise<number | null> {
  const basket = await db.tradeupBasket.findFirst({
    where: {
      planId: plan.id,
      status: { in: ['BUILDING', 'READY'] },
    },
    include: { items: { include: { inventoryItem: true }, orderBy: { slotIndex: 'asc' } } },
    orderBy: { updatedAt: 'desc' },
  });

  if (!basket) {
    return null;
  }

  // If the basket is already full, the marginal contribution is not
  // meaningful for ranking — the candidate can't be added without swapping.
  if (basket.items.length >= 10) {
    return null;
  }

  const baseSlots = basket.items.map((basketItem) => toBasketSlotContext(basketItem.inventoryItem));
  const candidateSlot: BasketSlotContext = {
    inventoryItemId: candidate.id,
    collection: candidate.collection,
    catalogCollectionId: candidate.catalogCollectionId,
    floatValue: candidate.floatValue,
    rarity: candidate.rarity,
  };

  return computeMarginalContribution(baseSlots, candidateSlot, plan);
}

async function loadLiquiditySignal(
  marketHashName: string,
  excludeId: string,
): Promise<LiquiditySignal> {
  const since = new Date(Date.now() - LIQUIDITY_DENSITY_WINDOW_MS);
  const observationCount = await db.candidateListing.count({
    where: {
      marketHashName,
      id: { not: excludeId },
      lastSeenAt: { gte: since },
    },
  });

  return { observationCount };
}

function toBasketSlotContext(item: {
  id: string;
  collection: string | null;
  catalogCollectionId?: string | null;
  exterior?: string | null;
  floatValue: number | null;
  rarity: string | null;
}): BasketSlotContext {
  return {
    inventoryItemId: item.id,
    collection: item.collection,
    catalogCollectionId: item.catalogCollectionId,
    exterior: item.exterior,
    floatValue: item.floatValue,
    rarity: item.rarity,
  };
}
