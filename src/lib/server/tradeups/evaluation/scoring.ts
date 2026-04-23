// Composite scoring — quality and liquidity.
//
// Scores are 0..1.
//
// Quality score:
//   - float-fit inside the matched rule's band (two-piece curve from tuning.ts:
//     flat in the safe core, linear falloff at the edges)
//   - price headroom: (maxBuyPrice - listPrice) / maxBuyPrice, clamped
//   - exterior alignment: exact match to the rule's preferred exterior
//   - isPreferred rule bonus
// Blended via tuning.QUALITY_WEIGHTS.
//
// Liquidity score (Phase 5 proxy):
//   - `computeLiquidityScore` consumes an injected observation count
//     (distinct candidates seen with the same market hash in the last window)
//   - observation counts below LIQUIDITY_MIN_OBSERVATIONS return the
//     cold-start fallback so a thin seed DB doesn't look broken
//   - saturates at LIQUIDITY_DENSITY_SATURATION → 1.0
//
// TODO (tracked in docs/PROGRESS.md):
//   - per-weapon/per-skin float ranges change the "edge float" penalty
//     because the effective band for the actual output differs from the
//     global exterior bands
//   - real marketplace-volume signal to replace the density proxy

import type { TradeupPlanRule } from '@prisma/client';
import type { CandidateLike } from './ruleMatching';
import { toNumber } from '$lib/server/utils/decimal';
import { isWithinFloatRange } from '$lib/server/utils/float';
import {
  FLOAT_EDGE_MIN,
  FLOAT_SAFE_CORE_WIDTH,
  LIQUIDITY_COLD_START,
  LIQUIDITY_DENSITY_SATURATION,
  LIQUIDITY_MIN_OBSERVATIONS,
  QUALITY_WEIGHTS,
} from './tuning';

export { QUALITY_WEIGHTS };

/**
 * Compute quality score for a candidate against a specific matched rule.
 * Returns 0 when any gate fails; otherwise returns a 0..1 composite.
 */
export function computeQualityScore(
  candidate: CandidateLike,
  rule: TradeupPlanRule,
): number {
  if (rule.rarity && candidate.rarity !== rule.rarity) {
    return 0;
  }

  if (rule.collection && candidate.collection !== rule.collection) {
    return 0;
  }

  if (rule.exterior && candidate.exterior !== rule.exterior) {
    return 0;
  }

  const hasFloatConstraint = rule.minFloat != null || rule.maxFloat != null;
  if (hasFloatConstraint) {
    if (candidate.floatValue == null) {
      return 0;
    }

    if (!isWithinFloatRange(candidate.floatValue, rule.minFloat, rule.maxFloat)) {
      return 0;
    }
  }

  const maxBuyPrice = toNumber(rule.maxBuyPrice);
  if (maxBuyPrice != null && candidate.listPrice > maxBuyPrice) {
    return 0;
  }

  const priceHeadroom =
    maxBuyPrice != null && maxBuyPrice > 0 ? clamp01((maxBuyPrice - candidate.listPrice) / maxBuyPrice) : 0.5;
  const exteriorAlignment = rule.exterior == null || candidate.exterior === rule.exterior ? 1 : 0;

  return clamp01(
    floatFitScore(candidate.floatValue ?? 0.5, rule.minFloat, rule.maxFloat) * QUALITY_WEIGHTS.floatFit +
      priceHeadroom * QUALITY_WEIGHTS.priceHeadroom +
      exteriorAlignment * QUALITY_WEIGHTS.exteriorAlignment +
      (rule.isPreferred ? 1 : 0) * QUALITY_WEIGHTS.preferredRule,
  );
}

export interface LiquiditySignal {
  /** Count of distinct candidates observed with this market hash in the last window. */
  observationCount: number;
}

/**
 * Phase 5 density-based liquidity proxy. Caller (evaluationService) passes in
 * the observation count so bulk re-evaluation can run a single aggregate query
 * instead of one-per-candidate.
 *
 * No signal (`undefined`) returns the cold-start fallback so legacy callers
 * that don't supply the count keep working.
 */
export function computeLiquidityScore(
  _args: {
    marketHashName: string;
    collection: string | null;
    rarity: string | null;
  },
  signal?: LiquiditySignal,
): number {
  if (!signal) {
    return LIQUIDITY_COLD_START;
  }

  if (signal.observationCount < LIQUIDITY_MIN_OBSERVATIONS) {
    return LIQUIDITY_COLD_START;
  }

  return clamp01(signal.observationCount / LIQUIDITY_DENSITY_SATURATION);
}

/**
 * Two-piece float-fit curve:
 *   - flat 1.0 inside the safe-core band (middle FLOAT_SAFE_CORE_WIDTH of the rule)
 *   - linear falloff from 1.0 to FLOAT_EDGE_MIN at the band edges
 *   - 0 outside the band
 *
 * Scales correctly for any band width. Exposed for tests.
 */
export function floatFitScore(
  floatValue: number,
  minFloat: number | null | undefined,
  maxFloat: number | null | undefined,
): number {
  if (!Number.isFinite(floatValue)) {
    return 0;
  }

  if (minFloat == null && maxFloat == null) {
    return 1;
  }

  if (!isWithinFloatRange(floatValue, minFloat, maxFloat)) {
    return 0;
  }

  const min = minFloat ?? 0;
  const max = maxFloat ?? 1;

  if (max <= min) {
    return 1;
  }

  const midpoint = (min + max) / 2;
  const halfWidth = (max - min) / 2;
  const safeCoreHalfWidth = halfWidth * FLOAT_SAFE_CORE_WIDTH;
  const distanceFromCenter = Math.abs(floatValue - midpoint);

  if (distanceFromCenter <= safeCoreHalfWidth) {
    return 1;
  }

  // Linear falloff from 1.0 at safe-core edge to FLOAT_EDGE_MIN at band edge.
  const edgeBandWidth = halfWidth - safeCoreHalfWidth;
  const edgeProgress = clamp01((distanceFromCenter - safeCoreHalfWidth) / edgeBandWidth);
  return clamp01(1 - edgeProgress * (1 - FLOAT_EDGE_MIN));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}
