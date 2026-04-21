// Candidate service.
//
// Owns the candidate lifecycle: ingestion (manual or extension), evaluation
// trigger, status transitions, and conversion into inventory when the user
// marks a listing as bought.
//
// All inputs arriving here are already Zod-validated at the route boundary.
// This module does not re-validate shape; it enforces invariants that Zod
// can't express (referential integrity, state-machine rules, duplicate
// merging).

import type { CandidateListing, InventoryItem, Prisma } from '@prisma/client';
import type {
  CandidateFilter,
  CreateCandidateInput,
  ExtensionCandidateInput,
  UpdateCandidateInput,
} from '$lib/types/domain';
import type {
  CandidateDTO,
  CandidateEvaluation,
  InventoryItemDTO,
} from '$lib/types/services';
import type { PaginatedResponse } from '$lib/types/domain';
import type {
  CandidateDecisionStatus,
  CandidateSource,
  InventoryStatus,
  ItemExterior,
  ItemRarity,
} from '$lib/types/enums';
import { db } from '$lib/server/db/client';
import { toDecimal, toDecimalOrNull, toNumber } from '$lib/server/utils/decimal';
import { findDuplicateCandidate, mergeDuplicate, classifyStaleness } from './duplicateDetection';
import { normalizeExtensionPayload } from './normalization';
import { evaluateCandidate } from '$lib/server/tradeups/evaluation/evaluationService';

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Paginated, filtered candidate list with derived staleness on each row. */
export function listCandidates(
  filter: CandidateFilter,
): Promise<PaginatedResponse<CandidateDTO>> {
  return listCandidatesImpl(filter);
}

/** Fetch a single candidate with its evaluation state. Null if not found. */
export function getCandidate(id: string): Promise<CandidateDTO | null> {
  return db.candidateListing.findUnique({ where: { id } }).then((row) => (row ? toCandidateDTO(row) : null));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Create a candidate from a manual entry (e.g., paste-in form).
 *   1. duplicate check — merge if matched, otherwise insert
 *   2. run evaluation synchronously
 *   3. return the persisted DTO with evaluation fields populated
 */
export function createCandidate(input: CreateCandidateInput): Promise<CandidateDTO> {
  return createCandidateImpl(input);
}

/**
 * Ingest a raw extension payload.
 *   1. normalize to CreateCandidateInput (see `normalization.ts`)
 *   2. duplicate-merge if applicable
 *   3. evaluate
 *   4. return `{ candidate, wasDuplicate }` so the extension can show the
 *      user whether this listing was already known
 *
 * The normalized payload is stored in `rawPayload` for later audit/debug,
 * even though Phase 2 does not yet ship an AppEvent log.
 */
export function ingestExtensionCandidate(
  payload: ExtensionCandidateInput,
): Promise<{ candidate: CandidateDTO; wasDuplicate: boolean }> {
  return ingestExtensionCandidateImpl(payload);
}

/**
 * Patch metadata (status + notes). Status transitions are validated:
 *   BOUGHT can only be reached through `markBought` (which creates inventory)
 *   DUPLICATE / INVALID are evaluation-owned and cannot be set manually here
 */
export function updateCandidate(
  id: string,
  input: UpdateCandidateInput,
): Promise<CandidateDTO> {
  return updateCandidateImpl(id, input);
}

/**
 * Mark a candidate as bought in a single transaction:
 *   - candidate.status → BOUGHT
 *   - create InventoryItem linked via `candidateId`
 *   - carry over identity fields (marketHashName, rarity, float, etc.)
 *
 * The purchase price/fees default to the candidate's list price if the caller
 * does not override them.
 */
export function markBought(
  id: string,
  args: { purchasePrice: number; purchaseFees?: number; purchaseDate?: Date },
): Promise<{ candidate: CandidateDTO; inventoryItem: InventoryItemDTO }> {
  return markBoughtImpl(id, args);
}

/** Hard-delete a candidate. Only allowed when no inventory item links to it. */
export function deleteCandidate(id: string): Promise<void> {
  return deleteCandidateImpl(id);
}

// ---------------------------------------------------------------------------
// Evaluation triggers
// ---------------------------------------------------------------------------

/**
 * Re-run evaluation for a single candidate and persist the result.
 * Called by:
 *   - createCandidate / ingestExtensionCandidate (initial scoring)
 *   - planService.update() fan-out (eager re-eval on plan changes)
 *   - manual "re-evaluate" action in the UI
 */
export function reevaluateCandidate(id: string): Promise<CandidateEvaluation> {
  return evaluateCandidate(id);
}

/**
 * Bulk re-evaluate every candidate whose status is still open (WATCHING or
 * GOOD_BUY). Returns the number of rows refreshed.
 *
 * Exposed primarily as a manual escape hatch (e.g., "Re-score all" button in
 * the candidates page) in case eager fan-out missed something.
 */
export function reevaluateOpenCandidates(): Promise<{ count: number }> {
  return reevaluateOpenCandidatesImpl();
}

// ---------------------------------------------------------------------------
// Mapping (internal, exported for tests and sibling services)
// ---------------------------------------------------------------------------

/** Map a Prisma row to the app DTO, adding derived staleness. */
export function toCandidateDTO(row: CandidateListing): CandidateDTO {
  return {
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    marketHashName: row.marketHashName,
    weaponName: row.weaponName,
    skinName: row.skinName,
    collection: row.collection,
    rarity: row.rarity as ItemRarity | null,
    exterior: row.exterior as ItemExterior | null,
    floatValue: row.floatValue,
    pattern: row.pattern,
    inspectLink: row.inspectLink,
    listPrice: toNumber(row.listPrice) ?? 0,
    currency: row.currency,
    listingUrl: row.listingUrl,
    listingId: row.listingId,
    source: row.source as CandidateSource,
    status: row.status as CandidateDecisionStatus,
    qualityScore: row.qualityScore,
    liquidityScore: row.liquidityScore,
    expectedProfit: toNumber(row.expectedProfit),
    expectedProfitPct: row.expectedProfitPct,
    maxBuyPrice: toNumber(row.maxBuyPrice),
    marginalBasketValue: toNumber(row.marginalBasketValue),
    matchedPlanId: row.matchedPlanId,
    timesSeen: row.timesSeen,
    lastSeenAt: row.lastSeenAt,
    staleness: classifyStaleness(row.lastSeenAt),
    notes: row.notes,
  };
}

async function listCandidatesImpl(
  filter: CandidateFilter,
): Promise<PaginatedResponse<CandidateDTO>> {
  const where: Prisma.CandidateListingWhereInput = {
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.collection ? { collection: filter.collection } : {}),
    ...(filter.rarity ? { rarity: filter.rarity } : {}),
    ...(filter.exterior ? { exterior: filter.exterior } : {}),
    ...(filter.minFloat != null || filter.maxFloat != null
      ? { floatValue: { gte: filter.minFloat, lte: filter.maxFloat } }
      : {}),
    ...(filter.minPrice != null || filter.maxPrice != null
      ? {
          listPrice: {
            gte: filter.minPrice != null ? toDecimal(filter.minPrice) : undefined,
            lte: filter.maxPrice != null ? toDecimal(filter.maxPrice) : undefined,
          },
        }
      : {}),
    ...(filter.search
      ? {
          OR: [
            { marketHashName: { contains: filter.search } },
            { weaponName: { contains: filter.search } },
            { skinName: { contains: filter.search } },
          ],
        }
      : {}),
  };
  const skip = (filter.page - 1) * filter.limit;
  const orderBy: Prisma.CandidateListingOrderByWithRelationInput = {
    [filter.sortBy]: filter.sortDir,
  };
  const [rows, total] = await Promise.all([
    db.candidateListing.findMany({ where, orderBy, skip, take: filter.limit }),
    db.candidateListing.count({ where }),
  ]);

  return {
    data: rows.map(toCandidateDTO),
    total,
    page: filter.page,
    limit: filter.limit,
    totalPages: Math.ceil(total / filter.limit),
  };
}

async function createCandidateImpl(input: CreateCandidateInput): Promise<CandidateDTO> {
  const duplicate = await findDuplicateCandidate(input);
  const row = duplicate ? await mergeDuplicate(duplicate.id, input) : await createCandidateRow(input);

  await evaluateCandidate(row.id);
  const evaluated = await db.candidateListing.findUniqueOrThrow({ where: { id: row.id } });
  return toCandidateDTO(evaluated);
}

async function ingestExtensionCandidateImpl(
  payload: ExtensionCandidateInput,
): Promise<{ candidate: CandidateDTO; wasDuplicate: boolean }> {
  const { input } = normalizeExtensionPayload(payload);
  const inputWithRaw = {
    ...input,
    rawPayload: payload as Prisma.InputJsonValue,
  };
  const duplicate = await findDuplicateCandidate(input);
  const row = duplicate
    ? await mergeDuplicate(duplicate.id, inputWithRaw)
    : await createCandidateRow(input, payload as Prisma.InputJsonValue);

  await evaluateCandidate(row.id);
  const evaluated = await db.candidateListing.findUniqueOrThrow({ where: { id: row.id } });

  return { candidate: toCandidateDTO(evaluated), wasDuplicate: duplicate != null };
}

async function updateCandidateImpl(
  id: string,
  input: UpdateCandidateInput,
): Promise<CandidateDTO> {
  if (input.status && ['BOUGHT', 'DUPLICATE', 'INVALID'].includes(input.status)) {
    throw new Error(`Candidate status ${input.status} cannot be set manually`);
  }

  const row = await db.candidateListing.update({
    where: { id },
    data: {
      status: input.status,
      notes: input.notes,
    },
  });

  return toCandidateDTO(row);
}

async function markBoughtImpl(
  id: string,
  args: { purchasePrice: number; purchaseFees?: number; purchaseDate?: Date },
): Promise<{ candidate: CandidateDTO; inventoryItem: InventoryItemDTO }> {
  const result = await db.$transaction(async (tx) => {
    const candidate = await tx.candidateListing.findUnique({ where: { id } });

    if (!candidate) {
      throw new Error(`Candidate not found: ${id}`);
    }

    const inventoryItem = await tx.inventoryItem.create({
      data: {
        marketHashName: candidate.marketHashName,
        weaponName: candidate.weaponName,
        skinName: candidate.skinName,
        collection: candidate.collection,
        rarity: candidate.rarity,
        exterior: candidate.exterior,
        floatValue: candidate.floatValue,
        pattern: candidate.pattern,
        inspectLink: candidate.inspectLink,
        purchasePrice: toDecimal(args.purchasePrice ?? (toNumber(candidate.listPrice) ?? 0)),
        purchaseCurrency: candidate.currency,
        purchaseFees: toDecimalOrNull(args.purchaseFees),
        purchaseDate: args.purchaseDate ?? new Date(),
        candidateId: candidate.id,
      },
    });

    const updatedCandidate = await tx.candidateListing.update({
      where: { id: candidate.id },
      data: { status: 'BOUGHT' },
    });

    return { candidate: updatedCandidate, inventoryItem };
  });

  return {
    candidate: toCandidateDTO(result.candidate),
    inventoryItem: toInventoryItemDTO(result.inventoryItem),
  };
}

async function deleteCandidateImpl(id: string): Promise<void> {
  const linkedInventory = await db.inventoryItem.count({ where: { candidateId: id } });

  if (linkedInventory > 0) {
    throw new Error('Cannot delete a candidate that is linked to inventory');
  }

  await db.candidateListing.delete({ where: { id } });
}

async function reevaluateOpenCandidatesImpl(): Promise<{ count: number }> {
  const rows = await db.candidateListing.findMany({
    where: { status: { in: ['WATCHING', 'GOOD_BUY'] } },
    select: { id: true },
  });

  for (const row of rows) {
    await evaluateCandidate(row.id);
  }

  return { count: rows.length };
}

function createCandidateRow(
  input: CreateCandidateInput,
  rawPayload?: Prisma.InputJsonValue,
): Promise<CandidateListing> {
  return db.candidateListing.create({
    data: {
      marketHashName: input.marketHashName,
      weaponName: input.weaponName,
      skinName: input.skinName,
      collection: input.collection,
      rarity: input.rarity,
      exterior: input.exterior,
      floatValue: input.floatValue,
      pattern: input.pattern,
      inspectLink: input.inspectLink,
      listPrice: toDecimal(input.listPrice),
      currency: input.currency,
      listingUrl: input.listingUrl,
      listingId: input.listingId,
      source: input.source,
      rawPayload,
      notes: input.notes,
    },
  });
}

function toInventoryItemDTO(row: InventoryItem): InventoryItemDTO {
  return {
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    marketHashName: row.marketHashName,
    weaponName: row.weaponName,
    skinName: row.skinName,
    collection: row.collection,
    rarity: row.rarity as ItemRarity | null,
    exterior: row.exterior as ItemExterior | null,
    floatValue: row.floatValue,
    pattern: row.pattern,
    inspectLink: row.inspectLink,
    purchasePrice: toNumber(row.purchasePrice) ?? 0,
    purchaseCurrency: row.purchaseCurrency,
    purchaseFees: toNumber(row.purchaseFees),
    purchaseDate: row.purchaseDate,
    status: row.status as InventoryStatus,
    currentEstValue: toNumber(row.currentEstValue),
    candidateId: row.candidateId,
    notes: row.notes,
  };
}
