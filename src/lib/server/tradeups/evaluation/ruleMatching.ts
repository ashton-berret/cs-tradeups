// Rule matching.
//
// Given a candidate (or an inventory item) and a set of plans, decide which
// plan rule(s) accept the item and how well it fits.
//
// Fit score composition (0..1):
//   - hard constraints (rarity, collection, exterior, float band, max price)
//     act as gates: any violation returns 0 for that rule
//   - soft preference: priority and `isPreferred` flags shift the score
//     upward within the acceptable range
//   - float-within-band produces a higher score the deeper the float sits
//     inside the band (edge floats get penalized)

import type {
  CandidateListing,
  InventoryItem,
  TradeupPlan,
  TradeupPlanRule,
} from '@prisma/client';
import type { PlanMatch } from '$lib/types/services';
import { toNumber } from '$lib/server/utils/decimal';
import { isWithinFloatRange } from '$lib/server/utils/float';

export interface CandidateLike {
  collection: string | null;
  rarity: string | null;
  exterior: string | null;
  floatValue: number | null;
  listPrice: number; // for candidates; use purchasePrice for inventory items
}

/**
 * Convert either a CandidateListing or an InventoryItem into the subset of
 * fields rule matching actually reads. Centralizes the shape so the same
 * scoring code runs against both.
 */
export function toCandidateLike(
  row: CandidateListing | InventoryItem,
): CandidateLike {
  return {
    collection: row.collection,
    rarity: row.rarity,
    exterior: row.exterior,
    floatValue: row.floatValue,
    listPrice: 'listPrice' in row ? (toNumber(row.listPrice) ?? 0) : (toNumber(row.purchasePrice) ?? 0),
  };
}

/**
 * Score a single candidate against a single rule. Returns 0 for hard
 * failures (the rule rejects the item) and a 0..1 score otherwise.
 */
export function ruleFitScore(
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

  const floatScore =
    candidate.floatValue != null ? boundedFloatFit(candidate.floatValue, rule.minFloat, rule.maxFloat) : 0.7;
  const priorityScore = Math.max(0, Math.min(rule.priority, 10)) / 10;
  const preferredBonus = rule.isPreferred ? 0.1 : 0;
  const score = 0.45 + floatScore * 0.35 + priorityScore * 0.1 + preferredBonus;

  return clamp01(score);
}

/**
 * Match a candidate against a plan's rules. Returns the best rule for this
 * candidate (highest fitScore, ties broken by priority then isPreferred),
 * or null if no rule accepts it.
 *
 * If the plan has zero rules, the candidate matches the plan at the
 * inputRarity level with a baseline 0.5 fit score (plan still accepts any
 * item at the right rarity). `ruleId` is null in that case.
 */
export function matchCandidateToPlan(
  candidate: CandidateLike,
  plan: TradeupPlan & { rules: TradeupPlanRule[] },
): PlanMatch | null {
  if (candidate.rarity !== plan.inputRarity) {
    return null;
  }

  if (plan.rules.length === 0) {
    return {
      planId: plan.id,
      ruleId: null,
      fitScore: 0.5,
      preferred: false,
      maxBuyPrice: null,
    };
  }

  const matches = plan.rules
    .map((rule) => ({
      rule,
      fitScore: ruleFitScore(candidate, rule),
    }))
    .filter((match) => match.fitScore > 0)
    .sort((a, b) => {
      if (b.fitScore !== a.fitScore) return b.fitScore - a.fitScore;
      if (b.rule.priority !== a.rule.priority) return b.rule.priority - a.rule.priority;
      if (Number(b.rule.isPreferred) !== Number(a.rule.isPreferred)) {
        return Number(b.rule.isPreferred) - Number(a.rule.isPreferred);
      }
      return a.rule.id.localeCompare(b.rule.id);
    });

  const best = matches[0];
  if (!best) {
    return null;
  }

  return {
    planId: plan.id,
    ruleId: best.rule.id,
    fitScore: best.fitScore,
    preferred: best.rule.isPreferred,
    maxBuyPrice: toNumber(best.rule.maxBuyPrice),
  };
}

/**
 * Match a candidate against every active plan and return the non-null
 * matches sorted by fitScore desc.
 */
export function matchCandidateToPlans(
  candidate: CandidateLike,
  plans: Array<TradeupPlan & { rules: TradeupPlanRule[] }>,
): PlanMatch[] {
  return plans
    .map((plan) => matchCandidateToPlan(candidate, plan))
    .filter((match): match is PlanMatch => match != null)
    .sort(compareMatches);
}

/**
 * Pick the best plan from a match set. "Best" = highest fitScore; ties
 * resolved by (isPreferred, lower maxBuyPrice, alphabetical plan name) to
 * keep behavior deterministic.
 */
export function pickBestMatch(matches: PlanMatch[]): PlanMatch | null {
  return [...matches].sort(compareMatches)[0] ?? null;
}

function compareMatches(a: PlanMatch, b: PlanMatch): number {
  if (b.fitScore !== a.fitScore) return b.fitScore - a.fitScore;
  if (Number(b.preferred) !== Number(a.preferred)) return Number(b.preferred) - Number(a.preferred);

  const aMax = a.maxBuyPrice ?? Number.POSITIVE_INFINITY;
  const bMax = b.maxBuyPrice ?? Number.POSITIVE_INFINITY;
  if (aMax !== bMax) return aMax - bMax;

  return a.planId.localeCompare(b.planId);
}

function boundedFloatFit(
  floatValue: number,
  minFloat: number | null | undefined,
  maxFloat: number | null | undefined,
): number {
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
