// Duplicate detection for candidate ingestion.
//
// Policy (from PLAN.md + locked decisions):
//   - Always merge duplicates rather than create noisy rows.
//   - A match bumps `timesSeen` and `lastSeenAt`; the caller decides whether
//     to re-run evaluation on the merged row.
//   - No time window — a match at any age still merges (staleness is surfaced
//     separately as a derived signal; see `classifyStaleness`).
//
// Match heuristics (all three must hold, unless `listingId` is present and
// equal, which is an authoritative short-circuit):
//   - marketHashName exact match
//   - listPrice within MONEY_EPSILON
//   - floatValue within FLOAT_EPSILON (or both null)

import type { CandidateListing } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import type { CreateCandidateInput } from '$lib/types/domain';
import type { StalenessLevel } from '$lib/types/services';
import { db } from '$lib/server/db/client';
import { FLOAT_EPSILON } from '$lib/server/utils/float';
import { toDecimal } from '$lib/server/utils/decimal';

export const MONEY_EPSILON = 0.01;
type InputWithRawPayload = CreateCandidateInput & { rawPayload?: Prisma.InputJsonValue };

/**
 * Find an existing candidate row that should be treated as the same listing
 * as the incoming input. Returns null when no duplicate is found.
 *
 * Callers should pass the already-normalized internal shape (post-
 * normalization for extension payloads).
 */
export function findDuplicateCandidate(
  input: CreateCandidateInput,
): Promise<CandidateListing | null> {
  return findDuplicateCandidateImpl(input);
}

/**
 * Merge a re-observation into an existing candidate row.
 *   - increments `timesSeen`
 *   - updates `lastSeenAt` to now
 *   - refreshes `listPrice`, `listingUrl`, `rawPayload` if the new observation
 *     carries newer data (same price is still a re-observation, not a no-op)
 *
 * Does NOT re-run evaluation. The caller (candidate service) is responsible
 * for triggering `evaluateCandidate` after merging if the list price or any
 * evaluation input changed.
 */
export function mergeDuplicate(
  existingId: string,
  input: CreateCandidateInput,
): Promise<CandidateListing> {
  const inputWithRaw = input as InputWithRawPayload;

  return db.candidateListing.update({
    where: { id: existingId },
    data: {
      listPrice: toDecimal(input.listPrice),
      currency: input.currency,
      listingUrl: input.listingUrl,
      listingId: input.listingId,
      inspectLink: input.inspectLink,
      lastSeenAt: new Date(),
      timesSeen: { increment: 1 },
      ...(inputWithRaw.rawPayload !== undefined ? { rawPayload: inputWithRaw.rawPayload } : {}),
    },
  });
}

/**
 * Classify how recently a candidate was last observed. Used in the candidate
 * list to surface listings that have gone quiet (the extension is no longer
 * seeing them on the marketplace page).
 *
 * Thresholds (tunable):
 *   FRESH  <  2h
 *   RECENT <  24h
 *   STALE  <  7d
 *   COLD   >= 7d
 */
export function classifyStaleness(lastSeenAt: Date, now?: Date): StalenessLevel {
  const reference = now ?? new Date();
  const ageMs = Math.max(0, reference.getTime() - lastSeenAt.getTime());
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;

  if (ageMs < 2 * hour) {
    return 'FRESH';
  }

  if (ageMs < day) {
    return 'RECENT';
  }

  if (ageMs < 7 * day) {
    return 'STALE';
  }

  return 'COLD';
}

async function findDuplicateCandidateImpl(
  input: CreateCandidateInput,
): Promise<CandidateListing | null> {
  if (input.listingId) {
    const authoritative = await db.candidateListing.findFirst({
      where: { listingId: input.listingId },
      orderBy: { updatedAt: 'desc' },
    });

    if (authoritative) {
      return authoritative;
    }
  }

  const price = input.listPrice;
  const candidates = await db.candidateListing.findMany({
    where: {
      marketHashName: input.marketHashName,
      listPrice: {
        gte: toDecimal(price - MONEY_EPSILON),
        lte: toDecimal(price + MONEY_EPSILON),
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: 25,
  });

  return (
    candidates.find((candidate) => {
      if (candidate.floatValue == null || input.floatValue == null) {
        return candidate.floatValue == null && input.floatValue == null;
      }

      return Math.abs(candidate.floatValue - input.floatValue) <= FLOAT_EPSILON;
    }) ?? null
  );
}
