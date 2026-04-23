// Recommendation status derivation.
//
// Takes the numeric outputs of evaluation (expected profit, quality,
// liquidity, match result) and maps them to a CandidateDecisionStatus the
// user sees in the queue.
//
// Mapping rules:
//   - no matched plan                                    -> INVALID
//   - matched plan but expectedProfit < 0                -> PASSED
//   - expectedProfit below plan.minProfitThreshold       -> PASSED
//   - expectedProfitPct below plan.minProfitPctThreshold -> PASSED
//   - liquidity below plan.minLiquidityScore             -> WATCHING
//   - quality * liquidity below plan.minCompositeScore
//     (fallback: DEFAULT_MIN_COMPOSITE_SCORE from tuning.ts) -> WATCHING
//   - otherwise                                          -> GOOD_BUY
//
// Pin behavior:
//   - `previousPinnedByUser` overrides recommendation unless the raw output is
//     INVALID (plan no longer matches — the pin is no longer meaningful).
//   - BOUGHT / DUPLICATE are engine-locked states and are preserved even
//     without an explicit pin.

import type { TradeupPlan } from '@prisma/client';
import type { CandidateDecisionStatus } from '$lib/types/enums';
import { toNumber } from '$lib/server/utils/decimal';
import { DEFAULT_MIN_COMPOSITE_SCORE } from './tuning';

export interface RecommendationInput {
  plan: TradeupPlan | null;
  expectedProfit: number | null;
  expectedProfitPct: number | null;
  qualityScore: number;
  liquidityScore: number;
  previousStatus: CandidateDecisionStatus;
  previousPinnedByUser: boolean;
}

/**
 * Derive the next recommendation status. Honors user pins and the engine-
 * locked BOUGHT/DUPLICATE states.
 */
export function deriveRecommendation(
  input: RecommendationInput,
): CandidateDecisionStatus {
  const raw = deriveRawRecommendation(input);

  if (input.previousStatus === 'BOUGHT' || input.previousStatus === 'DUPLICATE') {
    return input.previousStatus;
  }

  if (raw === 'INVALID') {
    return 'INVALID';
  }

  if (input.previousPinnedByUser) {
    return input.previousStatus;
  }

  return raw;
}

function deriveRawRecommendation(input: RecommendationInput): CandidateDecisionStatus {
  const {
    plan,
    expectedProfit,
    expectedProfitPct,
    qualityScore,
    liquidityScore,
  } = input;

  if (!plan) {
    return 'INVALID';
  }

  if (expectedProfit == null) {
    return 'PASSED';
  }

  if (expectedProfit < 0) {
    return 'PASSED';
  }

  const minProfit = toNumber(plan.minProfitThreshold);
  if (minProfit != null && expectedProfit < minProfit) {
    return 'PASSED';
  }

  if (
    plan.minProfitPctThreshold != null &&
    (expectedProfitPct == null || expectedProfitPct < plan.minProfitPctThreshold)
  ) {
    return 'PASSED';
  }

  if (plan.minLiquidityScore != null && liquidityScore < plan.minLiquidityScore) {
    return 'WATCHING';
  }

  const compositeFloor = plan.minCompositeScore ?? DEFAULT_MIN_COMPOSITE_SCORE;
  if (qualityScore * liquidityScore < compositeFloor) {
    return 'WATCHING';
  }

  return 'GOOD_BUY';
}
