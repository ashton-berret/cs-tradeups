// Re-evaluation policy.
//
// Stored candidate evaluations age as marketplace prices move. The operator
// wants a simple, explicit trigger for "refresh anything that's gotten stale."
// This module centralizes the thresholds and the staleness check so the
// candidate service and the refresh endpoint agree on what "stale" means.
//
// Policy:
//   FRESH  — evaluationRefreshedAt newer than STALE_AFTER_MS
//   AGING  — between STALE_AFTER_MS and COLD_AFTER_MS
//   STALE  — older than COLD_AFTER_MS (or never refreshed)
//
// `isEvaluationStale` returns true for anything older than STALE_AFTER_MS.
// The refresh endpoint uses this as the default cutoff.

import type { CandidateListing } from '@prisma/client';

export const REEVAL_THRESHOLDS = {
  /** Rows older than this are surfaced as "aging" and eligible for refresh. */
  STALE_AFTER_MS: 6 * 60 * 60 * 1000,
  /** Rows older than this are "cold" — ranking should discount them further. */
  COLD_AFTER_MS: 24 * 60 * 60 * 1000,
} as const;

export type EvaluationAge = 'FRESH' | 'AGING' | 'STALE';

/**
 * Classify evaluation age for UI surfacing. `null` refresh timestamps are
 * treated as STALE so newly-imported rows that skipped the evaluator show up
 * in the "Refresh stale" batch.
 */
export function classifyEvaluationAge(
  refreshedAt: Date | null | undefined,
  now?: Date,
): EvaluationAge {
  if (!refreshedAt) {
    return 'STALE';
  }

  const reference = now ?? new Date();
  const ageMs = Math.max(0, reference.getTime() - refreshedAt.getTime());

  if (ageMs < REEVAL_THRESHOLDS.STALE_AFTER_MS) {
    return 'FRESH';
  }

  if (ageMs < REEVAL_THRESHOLDS.COLD_AFTER_MS) {
    return 'AGING';
  }

  return 'STALE';
}

/**
 * True when `row.evaluationRefreshedAt` is older than `olderThanMs` (defaults
 * to STALE_AFTER_MS) or missing.
 */
export function isEvaluationStale(
  row: Pick<CandidateListing, 'evaluationRefreshedAt'>,
  opts?: { olderThanMs?: number; now?: Date },
): boolean {
  const olderThanMs = opts?.olderThanMs ?? REEVAL_THRESHOLDS.STALE_AFTER_MS;
  const reference = opts?.now ?? new Date();

  if (!row.evaluationRefreshedAt) {
    return true;
  }

  return reference.getTime() - row.evaluationRefreshedAt.getTime() >= olderThanMs;
}

/**
 * Cutoff date for Prisma `where` clauses:
 *   `{ OR: [{ evaluationRefreshedAt: null }, { evaluationRefreshedAt: { lt: cutoffDate(olderThanMs) } }] }`
 */
export function cutoffDate(olderThanMs: number, now?: Date): Date {
  const reference = now ?? new Date();
  return new Date(reference.getTime() - olderThanMs);
}
