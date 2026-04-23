// Duplicate detection for candidate ingestion.
//
// Policy (from PLAN.md + locked decisions):
//   - Always merge duplicates rather than create noisy rows.
//   - A match bumps `timesSeen` and `lastSeenAt`; the caller decides whether
//     to re-run evaluation on the merged row.
//   - Merges that actually change the list price bump `mergeCount` and the
//     returned `priceChanged` flag so the caller can decide whether to flip
//     a user-pinned status back to engine-driven.
//
// Match heuristics (in priority order):
//   1. `listingId` exact match — authoritative.
//   2. normalized `listingUrl` exact match — authoritative fallback for sources
//      that don't expose a stable listingId.
//   3. marketHashName + listPrice within relative tolerance +
//      floatValue within FLOAT_EPSILON (or both null).

import type { CandidateListing } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import type { CreateCandidateInput } from '$lib/types/domain';
import type { StalenessLevel } from '$lib/types/services';
import { db } from '$lib/server/db/client';
import { FLOAT_EPSILON } from '$lib/server/utils/float';
import { toDecimal, toNumber } from '$lib/server/utils/decimal';
import { normalizeListingUrl } from '$lib/server/utils/url';

export const MONEY_EPSILON = 0.01;
// Relative tolerance for price-match. Accept cents-level drift on low prices,
// 1% drift on listings above ~$1. Keeps cheap items from collapsing into a
// single row while preventing spurious duplicates above $20.
const RELATIVE_PRICE_TOLERANCE = 0.01;

type InputWithRawPayload = CreateCandidateInput & { rawPayload?: Prisma.InputJsonValue };

export interface MergeResult {
  candidate: CandidateListing;
  priceChanged: boolean;
  oldListPrice: number;
}

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
 *   - increments `mergeCount` whenever the persisted list price changes
 *   - updates `lastSeenAt` to now
 *   - refreshes `listPrice`, `listingUrl`, `rawPayload` if the new observation
 *     carries newer data
 *
 * Does NOT re-run evaluation. The caller (candidate service) is responsible
 * for triggering `evaluateCandidate` after merging.
 */
export function mergeDuplicate(
  existingId: string,
  input: CreateCandidateInput,
): Promise<MergeResult> {
  return mergeDuplicateImpl(existingId, input);
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

async function mergeDuplicateImpl(
  existingId: string,
  input: CreateCandidateInput,
): Promise<MergeResult> {
  const inputWithRaw = input as InputWithRawPayload;
  const existing = await db.candidateListing.findUniqueOrThrow({ where: { id: existingId } });
  const oldListPrice = toNumber(existing.listPrice) ?? 0;
  const priceChanged = !pricesWithinTolerance(oldListPrice, input.listPrice);

  const candidate = await db.candidateListing.update({
    where: { id: existingId },
    data: {
      listPrice: toDecimal(input.listPrice),
      currency: input.currency,
      listingUrl: input.listingUrl,
      listingId: input.listingId,
      inspectLink: input.inspectLink,
      lastSeenAt: new Date(),
      timesSeen: { increment: 1 },
      ...(priceChanged ? { mergeCount: { increment: 1 } } : {}),
      ...(inputWithRaw.rawPayload !== undefined ? { rawPayload: inputWithRaw.rawPayload } : {}),
    },
  });

  return { candidate, priceChanged, oldListPrice };
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

  const normalizedUrl = normalizeListingUrl(input.listingUrl);
  if (normalizedUrl) {
    const urlMatch = await findUrlMatch(normalizedUrl);
    if (urlMatch) {
      return urlMatch;
    }
  }

  const price = input.listPrice;
  const tolerance = priceTolerance(price);
  const candidates = await db.candidateListing.findMany({
    where: {
      marketHashName: input.marketHashName,
      listPrice: {
        gte: toDecimal(price - tolerance),
        lte: toDecimal(price + tolerance),
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

async function findUrlMatch(normalizedUrl: string): Promise<CandidateListing | null> {
  // SQLite has no URL normalization, so we fetch rows with any listingUrl and
  // compare client-side. In practice the candidate list is small enough that
  // this is fine; if it grows, precompute a normalizedListingUrl column.
  const rows = await db.candidateListing.findMany({
    where: { listingUrl: { not: null } },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  });

  return rows.find((row) => normalizeListingUrl(row.listingUrl) === normalizedUrl) ?? null;
}

function priceTolerance(price: number): number {
  return Math.max(MONEY_EPSILON, Math.abs(price) * RELATIVE_PRICE_TOLERANCE);
}

function pricesWithinTolerance(a: number, b: number): boolean {
  const tolerance = Math.max(priceTolerance(a), priceTolerance(b));
  return Math.abs(a - b) <= tolerance;
}
