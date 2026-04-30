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
import { ConflictError, NotFoundError } from '$lib/server/http/errors';
import { toDecimal, toDecimalOrNull, toNumber } from '$lib/server/utils/decimal';
import {
  findDuplicateCandidate,
  findDuplicateCandidateMatch,
  mergeDuplicate,
  classifyStaleness,
} from './duplicateDetection';
import { normalizeExtensionPayload, type NormalizationWarning } from './normalization';
import { evaluateCandidate } from '$lib/server/tradeups/evaluation/evaluationService';
import { classifyEvaluationAge, cutoffDate } from './reevaluationPolicy';
import { resolveCatalogIdentity } from '$lib/server/catalog/linkage';

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
): Promise<{
  candidate: CandidateDTO;
  wasDuplicate: boolean;
  warnings: NormalizationWarning[];
  duplicate:
    | {
        reason: 'LISTING_ID' | 'LISTING_URL' | 'MARKET_HASH_NAME_FLOAT_PRICE';
        candidateId: string;
        oldListPrice: number;
        newListPrice: number;
        priceChanged: boolean;
        previousStatus: CandidateDecisionStatus;
        previousTimesSeen: number;
        currentTimesSeen: number;
        previousMergeCount: number;
        currentMergeCount: number;
      }
    | null;
  evaluation: CandidateEvaluation;
}> {
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
export interface MarkBoughtArgs {
  purchasePrice: number;
  purchaseFees?: number;
  purchaseDate?: Date;
  /**
   * When supplied, the converted inventory item is immediately added to the
   * given basket at the given slot. Best-effort — if the basket no longer
   * accepts items (status changed, slot occupied, full), the conversion
   * still succeeds and `basketReservation.warning` describes why the
   * reservation was skipped.
   */
  intendedBasketId?: string;
  intendedSlotIndex?: number;
}

export interface MarkBoughtResult {
  candidate: CandidateDTO;
  inventoryItem: InventoryItemDTO;
  basketReservation:
    | { basketId: string; slotIndex: number }
    | { warning: string }
    | null;
}

export function markBought(id: string, args: MarkBoughtArgs): Promise<MarkBoughtResult> {
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
 * Bulk-set a user-picked status on multiple candidates. Engine-owned statuses
 * (BOUGHT/DUPLICATE/INVALID) are rejected at the schema layer.
 *
 * Atomic. When `pinnedByUser` is true (the default for the HTTP endpoint),
 * rows are pinned so the engine doesn't flip them on the next re-eval.
 */
export function bulkSetCandidateStatus(
  ids: string[],
  status: CandidateDecisionStatus,
  pinnedByUser: boolean,
): Promise<{ count: number }> {
  return bulkSetCandidateStatusImpl(ids, status, pinnedByUser);
}

/**
 * Bulk-delete candidates. Rejects the whole batch if any id has linked
 * inventory — the caller gets a 409 and the full list of blocking ids.
 */
export function bulkDeleteCandidates(ids: string[]): Promise<{ count: number }> {
  return bulkDeleteCandidatesImpl(ids);
}

/**
 * Delete all candidates ingested through the browser bridge/extension, while
 * preserving any candidate already linked to inventory.
 */
export function deleteIngestedCandidates(): Promise<{ count: number; skippedLinkedInventory: number }> {
  return deleteIngestedCandidatesImpl();
}

/**
 * Bulk re-evaluate specific candidates by id. Non-atomic: returns processed
 * count and any per-row errors. Use `reevaluateOpenCandidates` when the
 * caller wants "all open," not a specific set.
 */
export function bulkReevaluateCandidates(
  ids: string[],
): Promise<{ processed: number; errors: { id: string; message: string }[] }> {
  return bulkReevaluateCandidatesImpl(ids);
}

/**
 * Bulk re-evaluate every candidate whose status is still open (WATCHING or
 * GOOD_BUY). Returns the number of rows refreshed.
 *
 * Pass `olderThanMs` to restrict to rows whose `evaluationRefreshedAt` is
 * older than the given window (or null). Omitted ⇒ all open candidates,
 * matching the pre-Phase-5 behavior.
 *
 * Exposed primarily as a manual escape hatch (e.g., "Re-score all" button in
 * the candidates page) in case eager fan-out missed something.
 */
export function reevaluateOpenCandidates(
  opts?: { olderThanMs?: number },
): Promise<{ count: number }> {
  return reevaluateOpenCandidatesImpl(opts);
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
    catalogSkinId: row.catalogSkinId,
    catalogCollectionId: row.catalogCollectionId,
    catalogWeaponDefIndex: row.catalogWeaponDefIndex,
    catalogPaintIndex: row.catalogPaintIndex,
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
    mergeCount: row.mergeCount,
    lastSeenAt: row.lastSeenAt,
    staleness: classifyStaleness(row.lastSeenAt),
    evaluationRefreshedAt: row.evaluationRefreshedAt,
    evaluationAge: classifyEvaluationAge(row.evaluationRefreshedAt),
    pinnedByUser: row.pinnedByUser,
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
  const rowId = duplicate
    ? (await mergeDuplicate(duplicate.id, input)).candidate.id
    : (await createCandidateRow(input)).id;

  await evaluateCandidate(rowId);
  const evaluated = await db.candidateListing.findUniqueOrThrow({ where: { id: rowId } });
  return toCandidateDTO(evaluated);
}

async function ingestExtensionCandidateImpl(
  payload: ExtensionCandidateInput,
): Promise<{
  candidate: CandidateDTO;
  wasDuplicate: boolean;
  warnings: NormalizationWarning[];
  duplicate:
    | {
        reason: 'LISTING_ID' | 'LISTING_URL' | 'MARKET_HASH_NAME_FLOAT_PRICE';
        candidateId: string;
        oldListPrice: number;
        newListPrice: number;
        priceChanged: boolean;
        previousStatus: CandidateDecisionStatus;
        previousTimesSeen: number;
        currentTimesSeen: number;
        previousMergeCount: number;
        currentMergeCount: number;
      }
    | null;
  evaluation: CandidateEvaluation;
}> {
  const { input, warnings } = normalizeExtensionPayload(payload);
  const inputWithRaw = {
    ...input,
    rawPayload: payload as Prisma.InputJsonValue,
  };
  const duplicateMatch = await findDuplicateCandidateMatch(input);
  const duplicate = duplicateMatch?.candidate ?? null;
  const previousStatus = duplicate?.status as CandidateDecisionStatus | undefined;
  const previousTimesSeen = duplicate?.timesSeen ?? 0;
  const previousMergeCount = duplicate?.mergeCount ?? 0;
  const mergeResult = duplicate
    ? await mergeDuplicate(duplicate.id, inputWithRaw)
    : null;
  const rowId = mergeResult
    ? mergeResult.candidate.id
    : (await createCandidateRow(input, payload as Prisma.InputJsonValue)).id;

  const evaluation = await evaluateCandidate(rowId);
  const evaluated = await db.candidateListing.findUniqueOrThrow({ where: { id: rowId } });

  return {
    candidate: toCandidateDTO(evaluated),
    wasDuplicate: duplicate != null,
    warnings,
    duplicate:
      duplicate && duplicateMatch && mergeResult && previousStatus
        ? {
            reason: duplicateMatch.reason,
            candidateId: duplicate.id,
            oldListPrice: mergeResult.oldListPrice,
            newListPrice: input.listPrice,
            priceChanged: mergeResult.priceChanged,
            previousStatus,
            previousTimesSeen,
            currentTimesSeen: evaluated.timesSeen,
            previousMergeCount,
            currentMergeCount: evaluated.mergeCount,
          }
        : null,
    evaluation,
  };
}

async function updateCandidateImpl(
  id: string,
  input: UpdateCandidateInput,
): Promise<CandidateDTO> {
  if (input.status && ['BOUGHT', 'DUPLICATE', 'INVALID'].includes(input.status)) {
    throw new ConflictError(`Candidate status ${input.status} cannot be set manually`);
  }

  // Pin semantics:
  //   - caller sets a status without specifying pin → pin by default so the
  //     engine doesn't overwrite the user's call.
  //   - caller passes `pinnedByUser: false` explicitly → unpin. If unpin
  //     happens without a status change, re-run evaluation so the candidate
  //     returns to engine-driven status immediately.
  const explicitUnpin = input.pinnedByUser === false && input.status === undefined;
  const resolvedPinned =
    input.pinnedByUser !== undefined
      ? input.pinnedByUser
      : input.status !== undefined
        ? true
        : undefined;

  const row = await db.candidateListing.update({
    where: { id },
    data: {
      status: input.status,
      notes: input.notes,
      pinnedByUser: resolvedPinned,
    },
  });

  if (explicitUnpin) {
    await evaluateCandidate(id);
    const refreshed = await db.candidateListing.findUniqueOrThrow({ where: { id } });
    return toCandidateDTO(refreshed);
  }

  return toCandidateDTO(row);
}

async function markBoughtImpl(id: string, args: MarkBoughtArgs): Promise<MarkBoughtResult> {
  const result = await db.$transaction(async (tx) => {
    const candidate = await tx.candidateListing.findUnique({ where: { id } });

    if (!candidate) {
      throw new NotFoundError(`Candidate not found: ${id}`);
    }

    const catalogIdentity =
      candidate.catalogSkinId != null
        ? {
            weaponName: candidate.weaponName,
            skinName: candidate.skinName,
            collection: candidate.collection,
            catalogSkinId: candidate.catalogSkinId,
            catalogCollectionId: candidate.catalogCollectionId,
            catalogWeaponDefIndex: candidate.catalogWeaponDefIndex,
            catalogPaintIndex: candidate.catalogPaintIndex,
            rarity: candidate.rarity as ItemRarity | null,
            exterior: candidate.exterior as ItemExterior | null,
          }
        : await resolveCatalogIdentity({
            marketHashName: candidate.marketHashName,
            weaponName: candidate.weaponName,
            skinName: candidate.skinName,
            collection: candidate.collection,
            rarity: candidate.rarity as ItemRarity | null,
            exterior: candidate.exterior as ItemExterior | null,
            floatValue: candidate.floatValue,
          });

    const inventoryItem = await tx.inventoryItem.create({
      data: {
        marketHashName: candidate.marketHashName,
        weaponName: catalogIdentity?.weaponName ?? candidate.weaponName,
        skinName: catalogIdentity?.skinName ?? candidate.skinName,
        collection: catalogIdentity?.collection ?? candidate.collection,
        catalogSkinId: catalogIdentity?.catalogSkinId ?? candidate.catalogSkinId,
        catalogCollectionId: catalogIdentity?.catalogCollectionId ?? candidate.catalogCollectionId,
        catalogWeaponDefIndex: catalogIdentity?.catalogWeaponDefIndex ?? candidate.catalogWeaponDefIndex,
        catalogPaintIndex: catalogIdentity?.catalogPaintIndex ?? candidate.catalogPaintIndex,
        rarity: catalogIdentity?.rarity ?? candidate.rarity,
        exterior: catalogIdentity?.exterior ?? candidate.exterior,
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

  const basketReservation = await tryReserveIntoBasket(
    result.inventoryItem,
    args.intendedBasketId,
    args.intendedSlotIndex,
  );

  // If the reservation succeeded, the inventory item's status changed inside
  // the basket transaction; re-read so the response reflects RESERVED_FOR_BASKET.
  const inventoryRow =
    basketReservation && 'basketId' in basketReservation
      ? ((await db.inventoryItem.findUnique({ where: { id: result.inventoryItem.id } })) ??
        result.inventoryItem)
      : result.inventoryItem;

  return {
    candidate: toCandidateDTO(result.candidate),
    inventoryItem: toInventoryItemDTO(inventoryRow),
    basketReservation,
  };
}

/**
 * Best-effort basket reservation after a successful mark-bought.
 *
 * Failure modes that produce a `warning` instead of throwing:
 *   - intent fields not provided → returns null
 *   - basket not found, not BUILDING, full, or slot occupied
 *   - inventory rarity does not match basket plan input rarity
 *
 * Hard errors (DB connection failures, etc.) still propagate; the candidate
 * has already been converted at this point and the caller should see the
 * exception to investigate.
 */
async function tryReserveIntoBasket(
  inventoryItem: InventoryItem,
  intendedBasketId: string | undefined,
  intendedSlotIndex: number | undefined,
): Promise<MarkBoughtResult['basketReservation']> {
  if (!intendedBasketId || intendedSlotIndex == null) {
    return null;
  }

  try {
    await db.$transaction(async (tx) => {
      const basket = await tx.tradeupBasket.findUnique({
        where: { id: intendedBasketId },
        include: { plan: true, items: true },
      });
      if (!basket) {
        throw new ConflictError(`Intended basket ${intendedBasketId} no longer exists`);
      }
      if (basket.status !== 'BUILDING') {
        throw new ConflictError(`Basket is ${basket.status}, only BUILDING accepts reservations`);
      }
      if (basket.items.length >= 10) {
        throw new ConflictError('Basket already has 10 items');
      }
      if (basket.items.some((item) => item.slotIndex === intendedSlotIndex)) {
        throw new ConflictError(`Slot ${intendedSlotIndex} is already occupied`);
      }
      if (inventoryItem.rarity !== basket.plan.inputRarity) {
        throw new ConflictError(
          `Item rarity ${inventoryItem.rarity ?? 'null'} does not match plan input rarity ${basket.plan.inputRarity}`,
        );
      }

      await tx.inventoryItem.update({
        where: { id: inventoryItem.id },
        data: { status: 'RESERVED_FOR_BASKET' },
      });
      await tx.tradeupBasketItem.create({
        data: {
          basketId: intendedBasketId,
          inventoryItemId: inventoryItem.id,
          slotIndex: intendedSlotIndex,
        },
      });
    });

    return { basketId: intendedBasketId, slotIndex: intendedSlotIndex };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown reservation error';
    return { warning: message };
  }
}

async function deleteCandidateImpl(id: string): Promise<void> {
  const linkedInventory = await db.inventoryItem.count({ where: { candidateId: id } });

  if (linkedInventory > 0) {
    throw new ConflictError('Cannot delete a candidate that is linked to inventory');
  }

  await db.candidateListing.delete({ where: { id } });
}

async function bulkSetCandidateStatusImpl(
  ids: string[],
  status: CandidateDecisionStatus,
  pinnedByUser: boolean,
): Promise<{ count: number }> {
  const result = await db.candidateListing.updateMany({
    where: { id: { in: ids } },
    data: { status, pinnedByUser },
  });

  return { count: result.count };
}

async function bulkDeleteCandidatesImpl(ids: string[]): Promise<{ count: number }> {
  const blocking = await db.inventoryItem.findMany({
    where: { candidateId: { in: ids } },
    select: { candidateId: true },
  });

  if (blocking.length > 0) {
    const blockedIds = Array.from(new Set(blocking.map((row) => row.candidateId).filter(Boolean)));
    throw new ConflictError(`Cannot delete candidates linked to inventory: ${blockedIds.join(', ')}`);
  }

  const result = await db.candidateListing.deleteMany({ where: { id: { in: ids } } });
  return { count: result.count };
}

async function deleteIngestedCandidatesImpl(): Promise<{ count: number; skippedLinkedInventory: number }> {
  const skippedLinkedInventory = await db.candidateListing.count({
    where: {
      source: 'EXTENSION',
      inventoryItems: { some: {} },
    },
  });

  const result = await db.candidateListing.deleteMany({
    where: {
      source: 'EXTENSION',
      inventoryItems: { none: {} },
    },
  });

  return { count: result.count, skippedLinkedInventory };
}

async function bulkReevaluateCandidatesImpl(
  ids: string[],
): Promise<{ processed: number; errors: { id: string; message: string }[] }> {
  const errors: { id: string; message: string }[] = [];
  let processed = 0;

  for (const id of ids) {
    try {
      await evaluateCandidate(id);
      processed += 1;
    } catch (err) {
      errors.push({ id, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return { processed, errors };
}

async function reevaluateOpenCandidatesImpl(
  opts?: { olderThanMs?: number },
): Promise<{ count: number }> {
  const staleFilter =
    opts?.olderThanMs != null
      ? {
          OR: [
            { evaluationRefreshedAt: null },
            { evaluationRefreshedAt: { lt: cutoffDate(opts.olderThanMs) } },
          ],
        }
      : {};

  const rows = await db.candidateListing.findMany({
    where: {
      status: { in: ['WATCHING', 'GOOD_BUY'] },
      ...staleFilter,
    },
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
  return createCatalogAwareCandidateRow(input, rawPayload);
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
    catalogSkinId: row.catalogSkinId,
    catalogCollectionId: row.catalogCollectionId,
    catalogWeaponDefIndex: row.catalogWeaponDefIndex,
    catalogPaintIndex: row.catalogPaintIndex,
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

async function createCatalogAwareCandidateRow(
  input: CreateCandidateInput,
  rawPayload?: Prisma.InputJsonValue,
): Promise<CandidateListing> {
  const catalogIdentity = await resolveCatalogIdentity({
    marketHashName: input.marketHashName,
    weaponName: input.weaponName,
    skinName: input.skinName,
    collection: input.collection,
    rarity: input.rarity ?? null,
    exterior: input.exterior ?? null,
    floatValue: input.floatValue ?? null,
  });

  return db.candidateListing.create({
    data: {
      marketHashName: input.marketHashName,
      weaponName: catalogIdentity?.weaponName ?? input.weaponName,
      skinName: catalogIdentity?.skinName ?? input.skinName,
      collection: catalogIdentity?.collection ?? input.collection,
      catalogSkinId: catalogIdentity?.catalogSkinId,
      catalogCollectionId: catalogIdentity?.catalogCollectionId,
      catalogWeaponDefIndex: catalogIdentity?.catalogWeaponDefIndex,
      catalogPaintIndex: catalogIdentity?.catalogPaintIndex,
      rarity: catalogIdentity?.rarity ?? input.rarity,
      exterior: catalogIdentity?.exterior ?? input.exterior,
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
