// Composite scoring — quality and liquidity.
//
// Scores are 0..1.
//
// Quality score (Phase 2 baseline):
//   - float-fit inside the matched rule's band (edge floats penalized)
//   - price headroom: (maxBuyPrice - listPrice) / maxBuyPrice, clamped
//   - exterior alignment: exact match to the rule's preferred exterior
//   - isPreferred rule bonus
// Blended via fixed weights; exact weights are a tunable constant.
//
// Liquidity score (Phase 2 stub):
//   - returns 0.5 placeholder until market volume data is wired up
//   - signature is final so downstream code does not change when the real
//     implementation lands
//
// TODO (tracked in docs/PROGRESS.md):
//   - per-weapon/per-skin float ranges change the "edge float" penalty
//     because the effective band for the actual output differs from the
//     global exterior bands
//   - liquidity needs real listing-count data, ideally from a daily scrape

import type { TradeupPlanRule } from '@prisma/client';
import type { CandidateLike } from './ruleMatching';
import { toNumber } from '$lib/server/utils/decimal';
import { isWithinFloatRange } from '$lib/server/utils/float';

export const QUALITY_WEIGHTS = {
  floatFit: 0.4,
  priceHeadroom: 0.4,
  exteriorAlignment: 0.1,
  preferredRule: 0.1,
} as const;

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

/**
 * Phase 2 stub returning 0.5. Signature intentionally takes the fields a
 * real implementation will need (name + collection + rarity) so callers do
 * not change when real liquidity data is wired in.
 */
export function computeLiquidityScore(args: {
  marketHashName: string;
  collection: string | null;
  rarity: string | null;
}): number {
  void args;
  return 0.5;
}

/**
 * Penalize floats that sit at the edge of a rule band. Returns 0..1.
 * Used inside computeQualityScore but exposed for tests.
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
  const edgeDistance = Math.abs(floatValue - midpoint) / halfWidth;

  return clamp01(1 - edgeDistance * 0.5);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}
