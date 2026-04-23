// Inventory service.
//
// Owns the owned-item ledger: cost basis, status transitions, and the
// candidate→inventory handoff. Basket reservation is driven by
// basketService; this module only exposes the state transitions it needs.
//
// State machine (InventoryStatus):
//   HELD  <->  RESERVED_FOR_BASKET  ->  USED_IN_CONTRACT  ->  SOLD
//     \->  ARCHIVED  (terminal, user-driven)
//
// Rules enforced here:
//   - Cannot transition out of USED_IN_CONTRACT except to ARCHIVED.
//   - RESERVED_FOR_BASKET may only be set by basketService.addItem.
//   - SOLD is set by executionService.recordSale for items that came out of
//     a contract and were subsequently sold. Regular inventory reaches SOLD
//     via an explicit update.

import type { InventoryItem, Prisma } from '@prisma/client';
import type {
  ConvertCandidateInput,
  CreateInventoryItemInput,
  EligibleInventoryFilter,
  InventoryFilter,
  UpdateInventoryItemInput,
  PaginatedResponse,
} from '$lib/types/domain';
import type { InventoryItemDTO } from '$lib/types/services';
import type { InventoryStatus, ItemExterior, ItemRarity } from '$lib/types/enums';
import { db } from '$lib/server/db/client';
import { ConflictError, NotFoundError } from '$lib/server/http/errors';
import { toDecimal, toDecimalOrNull, toNumber } from '$lib/server/utils/decimal';
import { isWithinFloatRange } from '$lib/server/utils/float';
import { markBought } from '$lib/server/candidates/candidateService';

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Paginated inventory list. */
export function listInventory(
  filter: InventoryFilter,
): Promise<PaginatedResponse<InventoryItemDTO>> {
  return listInventoryImpl(filter);
}

/** Fetch a single inventory item. Null if not found. */
export function getInventoryItem(id: string): Promise<InventoryItemDTO | null> {
  return db.inventoryItem.findUnique({ where: { id } }).then((row) => (row ? toInventoryItemDTO(row) : null));
}

/**
 * Return items eligible to be added to a basket for `planId`.
 *
 * Eligibility:
 *   - status === HELD (already-RESERVED items belong to a basket)
 *   - rarity matches plan.inputRarity
 *   - (optional, weaker) collection appears in plan.rules
 *
 * Used by the basket-builder UI and by evaluationService when computing a
 * held item's marginal contribution.
 */
export function listAvailableForBasket(
  planId: string,
  opts?: { respectRuleCollections?: boolean },
): Promise<InventoryItemDTO[]> {
  return listAvailableForBasketImpl(planId, opts);
}

export function listEligibleInventoryForPlan(
  filter: EligibleInventoryFilter,
): Promise<PaginatedResponse<InventoryItemDTO>> {
  return listEligibleInventoryForPlanImpl(filter);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Create an inventory item from a manual entry (not originating from a
 * candidate). The `candidateId` link remains null.
 */
export function createInventoryItem(
  input: CreateInventoryItemInput,
): Promise<InventoryItemDTO> {
  return createInventoryItemImpl(input);
}

/**
 * Convert a candidate to inventory — the "I bought this" workflow.
 * Delegates to candidateService.markBought so the transaction boundary is
 * in one place; inventoryService exposes this alias for symmetry.
 */
export function convertCandidate(
  input: ConvertCandidateInput,
): Promise<InventoryItemDTO> {
  return markBought(input.candidateId, {
    purchasePrice: input.purchasePrice,
    purchaseFees: input.purchaseFees,
    purchaseDate: input.purchaseDate,
  }).then((result) => result.inventoryItem);
}

/**
 * Patch notes and currentEstValue. Status changes go through the dedicated
 * `setStatus` helper so the state machine can validate transitions in one
 * place.
 */
export function updateInventoryItem(
  id: string,
  input: Omit<UpdateInventoryItemInput, 'status'>,
): Promise<InventoryItemDTO> {
  return db.inventoryItem
    .update({
      where: { id },
      data: {
        currentEstValue: toDecimalOrNull(input.currentEstValue),
        notes: input.notes,
      },
    })
    .then(toInventoryItemDTO);
}

/**
 * Transition an item's status. Validates the transition against the state
 * machine documented at the top of this file. Throws on invalid moves.
 */
export function setStatus(
  id: string,
  next: InventoryStatus,
): Promise<InventoryItemDTO> {
  return setStatusImpl(id, next);
}

/** Hard-delete inventory. Blocked if any basket or execution references it. */
export function deleteInventoryItem(id: string): Promise<void> {
  return deleteInventoryItemImpl(id);
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

export function toInventoryItemDTO(row: InventoryItem): InventoryItemDTO {
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

async function listInventoryImpl(
  filter: InventoryFilter,
): Promise<PaginatedResponse<InventoryItemDTO>> {
  const where: Prisma.InventoryItemWhereInput = {
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.collection ? { collection: filter.collection } : {}),
    ...(filter.rarity ? { rarity: filter.rarity } : {}),
    ...(filter.exterior ? { exterior: filter.exterior } : {}),
    ...(filter.availableForBasket ? { status: 'HELD' } : {}),
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
  const orderBy: Prisma.InventoryItemOrderByWithRelationInput = {
    [filter.sortBy]: filter.sortDir,
  };
  const [rows, total] = await Promise.all([
    db.inventoryItem.findMany({ where, orderBy, skip, take: filter.limit }),
    db.inventoryItem.count({ where }),
  ]);

  return {
    data: rows.map(toInventoryItemDTO),
    total,
    page: filter.page,
    limit: filter.limit,
    totalPages: Math.ceil(total / filter.limit),
  };
}

async function listAvailableForBasketImpl(
  planId: string,
  opts?: { respectRuleCollections?: boolean },
): Promise<InventoryItemDTO[]> {
  const plan = await db.tradeupPlan.findUnique({
    where: { id: planId },
    include: { rules: true },
  });

  if (!plan) {
    throw new NotFoundError(`Plan not found: ${planId}`);
  }

  const ruleCollections = Array.from(
    new Set(plan.rules.map((rule) => rule.collection).filter((collection): collection is string => Boolean(collection))),
  );
  const rows = await db.inventoryItem.findMany({
    where: {
      status: 'HELD',
      rarity: plan.inputRarity,
      ...(opts?.respectRuleCollections && ruleCollections.length > 0
        ? { collection: { in: ruleCollections } }
        : {}),
    },
    orderBy: [{ purchaseDate: 'desc' }, { createdAt: 'desc' }],
  });

  return rows.map(toInventoryItemDTO);
}

async function listEligibleInventoryForPlanImpl(
  filter: EligibleInventoryFilter,
): Promise<PaginatedResponse<InventoryItemDTO>> {
  const plan = await db.tradeupPlan.findUnique({
    where: { id: filter.planId },
    include: { rules: true },
  });

  if (!plan) {
    throw new NotFoundError(`Plan not found: ${filter.planId}`);
  }

  const rows = await db.inventoryItem.findMany({
    where: {
      status: 'HELD',
      rarity: plan.inputRarity,
    },
  });
  const eligibleRows = rows
    .filter((item) => inventoryMatchesPlanRules(item, plan.rules))
    .sort(compareInventoryRows(filter.sortBy, filter.sortDir));
  const total = eligibleRows.length;
  const skip = (filter.page - 1) * filter.limit;
  const pageRows = eligibleRows.slice(skip, skip + filter.limit);

  return {
    data: pageRows.map(toInventoryItemDTO),
    total,
    page: filter.page,
    limit: filter.limit,
    totalPages: Math.ceil(total / filter.limit),
  };
}

function createInventoryItemImpl(input: CreateInventoryItemInput): Promise<InventoryItemDTO> {
  return db.inventoryItem
    .create({
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
        purchasePrice: toDecimal(input.purchasePrice),
        purchaseCurrency: input.purchaseCurrency,
        purchaseFees: toDecimalOrNull(input.purchaseFees),
        purchaseDate: input.purchaseDate,
        candidateId: input.candidateId,
        notes: input.notes,
      },
    })
    .then(toInventoryItemDTO);
}

async function setStatusImpl(id: string, next: InventoryStatus): Promise<InventoryItemDTO> {
  const row = await db.inventoryItem.findUnique({ where: { id } });

  if (!row) {
    throw new NotFoundError(`Inventory item not found: ${id}`);
  }

  const current = row.status as InventoryStatus;
  validateStatusTransition(current, next);

  return db.inventoryItem.update({ where: { id }, data: { status: next } }).then(toInventoryItemDTO);
}

async function deleteInventoryItemImpl(id: string): Promise<void> {
  const basketLinks = await db.tradeupBasketItem.count({ where: { inventoryItemId: id } });

  if (basketLinks > 0) {
    throw new ConflictError('Cannot delete inventory that is linked to a basket');
  }

  await db.inventoryItem.delete({ where: { id } });
}

function validateStatusTransition(current: InventoryStatus, next: InventoryStatus): void {
  if (current === next) {
    return;
  }

  if (next === 'RESERVED_FOR_BASKET') {
    throw new ConflictError('RESERVED_FOR_BASKET is owned by basketService.addItem');
  }

  if (current === 'USED_IN_CONTRACT' && next !== 'ARCHIVED') {
    throw new ConflictError('USED_IN_CONTRACT items can only transition to ARCHIVED');
  }

  if (current === 'RESERVED_FOR_BASKET' && next !== 'ARCHIVED') {
    throw new ConflictError('Reserved items must be released by basketService');
  }

  if (current === 'ARCHIVED') {
    throw new ConflictError('ARCHIVED inventory is terminal');
  }

  if (current === 'SOLD' && next !== 'ARCHIVED') {
    throw new ConflictError('SOLD inventory can only transition to ARCHIVED');
  }
}

type InventorySortKey = EligibleInventoryFilter['sortBy'];
type SortDir = EligibleInventoryFilter['sortDir'];

function inventoryMatchesPlanRules(
  item: InventoryItem,
  rules: Array<{
    collection: string | null;
    rarity: string | null;
    exterior: string | null;
    minFloat: number | null;
    maxFloat: number | null;
  }>,
): boolean {
  if (rules.length === 0) {
    return true;
  }

  return rules.some((rule) => {
    if (rule.rarity && item.rarity !== rule.rarity) {
      return false;
    }

    if (rule.collection && item.collection !== rule.collection) {
      return false;
    }

    if (rule.exterior && item.exterior !== rule.exterior) {
      return false;
    }

    if ((rule.minFloat != null || rule.maxFloat != null) && item.floatValue == null) {
      return false;
    }

    return isWithinFloatRange(item.floatValue ?? Number.NaN, rule.minFloat, rule.maxFloat);
  });
}

function compareInventoryRows(sortBy: InventorySortKey, sortDir: SortDir) {
  const direction = sortDir === 'asc' ? 1 : -1;

  return (a: InventoryItem, b: InventoryItem) => {
    const aValue = sortableInventoryValue(a, sortBy);
    const bValue = sortableInventoryValue(b, sortBy);

    if (aValue == null && bValue == null) {
      return a.id.localeCompare(b.id);
    }

    if (aValue == null) {
      return 1;
    }

    if (bValue == null) {
      return -1;
    }

    if (aValue < bValue) {
      return -1 * direction;
    }

    if (aValue > bValue) {
      return 1 * direction;
    }

    return a.id.localeCompare(b.id);
  };
}

function sortableInventoryValue(item: InventoryItem, sortBy: InventorySortKey): number | null {
  switch (sortBy) {
    case 'purchasePrice':
      return toNumber(item.purchasePrice) ?? 0;
    case 'floatValue':
      return item.floatValue;
    case 'currentEstValue':
      return toNumber(item.currentEstValue);
    case 'createdAt':
    default:
      return item.createdAt.getTime();
  }
}
