// Recommendation status derivation.
//
// Takes the numeric outputs of evaluation (expected profit, quality,
// liquidity, match result) and maps them to a CandidateDecisionStatus the
// user sees in the queue.
//
// Mapping rules (Phase 2):
//   - no matched plan                                    -> INVALID
//   - matched plan but expectedProfit < 0                -> PASSED
//   - expectedProfit below plan.minProfitThreshold       -> PASSED
//   - expectedProfitPct below plan.minProfitPctThreshold -> PASSED
//   - quality * liquidity below a global floor           -> WATCHING
//   - otherwise                                          -> GOOD_BUY
//
// DUPLICATE is set by the ingestion path (duplicateDetection) before
// evaluation runs; this module never returns DUPLICATE.
// BOUGHT is set by candidateService.markBought; not returned here either.
//
// User-applied PASSED / WATCHING via the UI are preserved: the service
// layer only overwrites status when re-evaluation produces GOOD_BUY or
// INVALID. This keeps the user in control of subjective calls.

import type { TradeupPlan } from '@prisma/client';
import type { CandidateDecisionStatus } from '$lib/types/enums';
import { toNumber } from '$lib/server/utils/decimal';

const MIN_COMPOSITE_SCORE = 0.25;

export interface RecommendationInput {
  plan: TradeupPlan | null;
  expectedProfit: number | null;
  expectedProfitPct: number | null;
  qualityScore: number;
  liquidityScore: number;
  previousStatus: CandidateDecisionStatus;
}

/**
 * Derive the next recommendation status. Preserves user-applied PASSED /
 * WATCHING unless the evaluation flips to INVALID (i.e., the plan no longer
 * matches at all — the old status is no longer meaningful).
 */
export function deriveRecommendation(
  input: RecommendationInput,
): CandidateDecisionStatus {
  const raw = deriveRawRecommendation(input);

  if (raw === 'INVALID' || raw === 'GOOD_BUY') {
    return raw;
  }

  if (input.previousStatus === 'PASSED' || input.previousStatus === 'WATCHING') {
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

  if (qualityScore * liquidityScore < MIN_COMPOSITE_SCORE) {
    return 'WATCHING';
  }

  return 'GOOD_BUY';
}
