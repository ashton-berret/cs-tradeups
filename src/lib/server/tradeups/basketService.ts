// Trade-up basket service.
//
// A basket is a 10-slot assembly of inventory items tied to one plan. The
// service keeps basket metrics eagerly in sync with the set of items:
// every mutation (add / remove / reorder / plan change) recomputes
// totalCost, averageFloat, expectedEV, expectedProfit, expectedProfitPct
// inside the same transaction as the mutation.
//
// State machine (TradeupBasketStatus):
//   BUILDING  ->  READY       (user confirms 10-item readiness)
//       \->  CANCELLED        (user abandons the basket)
//   READY     ->  EXECUTED    (executionService.createExecution, only path)
//       \->  BUILDING         (user un-marks ready — still editable)
//   CANCELLED / EXECUTED are terminal here.
//
// Item reservation rules:
//   addItem:    inventory.status HELD -> RESERVED_FOR_BASKET
//   removeItem: inventory.status RESERVED_FOR_BASKET -> HELD
//   cancel:     all items RESERVED_FOR_BASKET -> HELD
//   execution:  handled by executionService (see executionService.createExecution)

import type { Prisma, TradeupBasket } from '@prisma/client';
import type {
  AddBasketItemInput,
  BasketFilter,
  CreateBasketInput,
  UpdateBasketInput,
  PaginatedResponse,
} from '$lib/types/domain';
import type { BasketDTO } from '$lib/types/services';
import type { TradeupBasketStatus } from '$lib/types/enums';
import { db } from '$lib/server/db/client';
import { ConflictError, NotFoundError } from '$lib/server/http/errors';
import { toDecimalOrNull, toNumber } from '$lib/server/utils/decimal';
import { averageFloat, averageWearProportion } from '$lib/server/utils/float';
import { percentChange, roundMoney, sumMoney } from '$lib/server/utils/money';
import { toInventoryItemDTO } from '$lib/server/inventory/inventoryService';
import { computeBasketEV } from './evaluation/expectedValue';
import { evaluateBasket } from './evaluation/evaluationService';
import { withCatalogOutcomeFloatRanges } from './evaluation/catalogOutcomes';
import { enrichSlotsWithInputRanges } from './evaluation/inputFloatRanges';

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function listBaskets(
  filter: BasketFilter,
): Promise<PaginatedResponse<BasketDTO>> {
  return listBasketsImpl(filter);
}

/** Fetch a basket with its items and freshly-derived metrics. */
export function getBasket(id: string): Promise<BasketDTO | null> {
  return getBasketImpl(id);
}

// ---------------------------------------------------------------------------
// Basket CRUD
// ---------------------------------------------------------------------------

/** Create an empty basket linked to a plan. */
export function createBasket(input: CreateBasketInput): Promise<BasketDTO> {
  return createBasketImpl(input);
}

/**
 * Patch basket metadata (name, notes) or transition status. Status
 * transitions are validated against the state machine above. Transitioning
 * to READY requires exactly 10 items; transitioning to EXECUTED is rejected
 * here (executionService is the only legal path).
 */
export function updateBasket(
  id: string,
  input: UpdateBasketInput,
): Promise<BasketDTO> {
  return updateBasketImpl(id, input);
}

/** Hard-delete. Only allowed when status is BUILDING or CANCELLED. */
export function deleteBasket(id: string): Promise<void> {
  return deleteBasketImpl(id);
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/**
 * Add an inventory item to a basket slot.
 *   1. validate slotIndex 0..9 and unoccupied
 *   2. validate inventory item status === HELD
 *   3. validate item rarity matches basket.plan.inputRarity
 *   4. transition inventory item to RESERVED_FOR_BASKET
 *   5. insert TradeupBasketItem
 *   6. recompute basket metrics (totalCost, averageFloat, EV breakdown)
 * All inside one transaction.
 */
export function addItem(
  basketId: string,
  input: AddBasketItemInput,
): Promise<BasketDTO> {
  return addItemImpl(basketId, input);
}

/**
 * Remove an item from a basket.
 *   1. delete the join row
 *   2. release the inventory item back to HELD
 *   3. recompute basket metrics
 * Rejects when basket is not in BUILDING or READY.
 */
export function removeItem(
  basketId: string,
  inventoryItemId: string,
): Promise<BasketDTO> {
  return removeItemImpl(basketId, inventoryItemId);
}

/**
 * Add multiple inventory items to a basket in a single transaction.
 * Each item gets its slot either from the caller-provided slotIndex or from
 * the first open slot (in ascending order). The entire batch rolls back on
 * the first invariant failure (slot collision, rarity mismatch, etc.).
 *
 * Metrics are recomputed once at the end.
 */
export function bulkAddItems(
  basketId: string,
  items: Array<AddBasketItemInput>,
): Promise<BasketDTO> {
  return bulkAddItemsImpl(basketId, items);
}

/**
 * Reorder items within a basket (updates slotIndex only, no membership
 * change). Accepts a full {inventoryItemId -> slotIndex} map; enforces that
 * the resulting set is a permutation of 0..N-1.
 */
export function reorderItems(
  basketId: string,
  slotMap: Record<string, number>,
): Promise<BasketDTO> {
  return reorderItemsImpl(basketId, slotMap);
}

// ---------------------------------------------------------------------------
// Metric & readiness helpers
// ---------------------------------------------------------------------------

/**
 * Recompute and persist `totalCost`, `averageFloat`, `expectedEV`,
 * `expectedProfit`, `expectedProfitPct` for a basket. Called internally by
 * every mutation; exposed for the UI "recompute" button and for
 * evaluationService.evaluateBasket.
 *
 * EV math lives in evaluation/expectedValue.computeBasketEV (CS2 collection-
 * weighted formula). This function is the persistence wrapper around it.
 */
export function recomputeMetrics(basketId: string): Promise<BasketDTO> {
  return recomputeMetricsImpl(basketId);
}

/**
 * Mark a basket as READY. Delegates to evaluateBasket for the readiness
 * check and rejects if any blocker is returned.
 */
export function markReady(basketId: string): Promise<BasketDTO> {
  return markReadyImpl(basketId);
}

/**
 * Cancel a basket: status -> CANCELLED and every reserved inventory item
 * transitions back to HELD. Terminal; the basket can no longer be edited.
 */
export function cancel(basketId: string): Promise<BasketDTO> {
  return cancelImpl(basketId);
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

export function toBasketDTO(
  row: TradeupBasket & { items: unknown[] },
): BasketDTO {
  const typed = row as BasketWithItems;
  const items = typed.items
    .map((item) => ({
      id: item.id,
      basketId: item.basketId,
      inventoryItemId: item.inventoryItemId,
      slotIndex: item.slotIndex,
      addedAt: item.addedAt,
      inventoryItem: toInventoryItemDTO(item.inventoryItem),
    }))
    .sort((a, b) => a.slotIndex - b.slotIndex);

  return {
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    planId: row.planId,
    name: row.name,
    status: row.status as TradeupBasketStatus,
    totalCost: toNumber(row.totalCost),
    expectedEV: toNumber(row.expectedEV),
    expectedProfit: toNumber(row.expectedProfit),
    expectedProfitPct: row.expectedProfitPct,
    averageFloat: row.averageFloat,
    itemCount: items.length,
    isFull: items.length === 10,
    notes: row.notes,
    items,
  };
}

type TxClient = Prisma.TransactionClient;
type BasketWithItems = TradeupBasket & {
  items: Array<{
    id: string;
    basketId: string;
    inventoryItemId: string;
    slotIndex: number;
    addedAt: Date;
    inventoryItem: Parameters<typeof toInventoryItemDTO>[0];
  }>;
};

const basketInclude = {
  items: {
    include: { inventoryItem: true },
    orderBy: { slotIndex: 'asc' as const },
  },
};

async function listBasketsImpl(filter: BasketFilter): Promise<PaginatedResponse<BasketDTO>> {
  const where: Prisma.TradeupBasketWhereInput = {
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.planId ? { planId: filter.planId } : {}),
  };
  const skip = (filter.page - 1) * filter.limit;
  const orderBy: Prisma.TradeupBasketOrderByWithRelationInput = { [filter.sortBy]: filter.sortDir };
  const [rows, total] = await Promise.all([
    db.tradeupBasket.findMany({ where, include: basketInclude, orderBy, skip, take: filter.limit }),
    db.tradeupBasket.count({ where }),
  ]);

  return {
    data: rows.map(toBasketDTO),
    total,
    page: filter.page,
    limit: filter.limit,
    totalPages: Math.ceil(total / filter.limit),
  };
}

async function getBasketImpl(id: string): Promise<BasketDTO | null> {
  const exists = await db.tradeupBasket.findUnique({ where: { id }, select: { id: true } });

  if (!exists) {
    return null;
  }

  return recomputeMetrics(id);
}

async function createBasketImpl(input: CreateBasketInput): Promise<BasketDTO> {
  const row = await db.tradeupBasket.create({
    data: {
      planId: input.planId,
      name: input.name,
      notes: input.notes,
    },
    include: basketInclude,
  });

  return toBasketDTO(row);
}

async function updateBasketImpl(id: string, input: UpdateBasketInput): Promise<BasketDTO> {
  if (input.status === 'EXECUTED') {
    throw new ConflictError('EXECUTED is only set by executionService.createExecution');
  }

  return db.$transaction(async (tx) => {
    const current = await tx.tradeupBasket.findUnique({
      where: { id },
      include: basketInclude,
    });

    if (!current) {
      throw new NotFoundError(`Basket not found: ${id}`);
    }

    validateBasketStatusTransition(current.status as TradeupBasketStatus, input.status, current.items.length);

    if (input.status === 'CANCELLED') {
      for (const item of current.items) {
        await tx.inventoryItem.update({
          where: { id: item.inventoryItemId },
          data: { status: 'HELD' },
        });
      }
    }

    await tx.tradeupBasket.update({
      where: { id },
      data: {
        name: input.name,
        status: input.status,
        notes: input.notes,
      },
    });

    return recomputeMetricsInTx(tx, id);
  });
}

async function deleteBasketImpl(id: string): Promise<void> {
  const basket = await db.tradeupBasket.findUnique({ where: { id } });

  if (!basket) {
    throw new NotFoundError(`Basket not found: ${id}`);
  }

  if (!['BUILDING', 'CANCELLED'].includes(basket.status)) {
    throw new ConflictError('Only BUILDING or CANCELLED baskets can be deleted');
  }

  await db.tradeupBasket.delete({ where: { id } });
}

async function addItemImpl(basketId: string, input: AddBasketItemInput): Promise<BasketDTO> {
  return db.$transaction(async (tx) => {
    const basket = await tx.tradeupBasket.findUnique({
      where: { id: basketId },
      include: { plan: true, items: true },
    });

    if (!basket) {
      throw new NotFoundError(`Basket not found: ${basketId}`);
    }

    if (!['BUILDING', 'READY'].includes(basket.status)) {
      throw new ConflictError('Items can only be added to BUILDING or READY baskets');
    }

    if (basket.items.length >= 10) {
      throw new ConflictError('Basket already has 10 items');
    }

    if (basket.items.some((item) => item.slotIndex === input.slotIndex)) {
      throw new ConflictError(`Basket slot ${input.slotIndex} is already occupied`);
    }

    const inventoryItem = await tx.inventoryItem.findUnique({ where: { id: input.inventoryItemId } });

    if (!inventoryItem) {
      throw new NotFoundError(`Inventory item not found: ${input.inventoryItemId}`);
    }

    if (inventoryItem.status !== 'HELD') {
      throw new ConflictError('Only HELD inventory can be added to a basket');
    }

    if (inventoryItem.rarity !== basket.plan.inputRarity) {
      throw new ConflictError('Inventory rarity does not match the basket plan input rarity');
    }

    await tx.inventoryItem.update({
      where: { id: inventoryItem.id },
      data: { status: 'RESERVED_FOR_BASKET' },
    });
    await tx.tradeupBasketItem.create({
      data: {
        basketId,
        inventoryItemId: inventoryItem.id,
        slotIndex: input.slotIndex,
      },
    });
    await tx.tradeupBasket.update({
      where: { id: basketId },
      data: { status: 'BUILDING' },
    });

    return recomputeMetricsInTx(tx, basketId);
  });
}

async function removeItemImpl(basketId: string, inventoryItemId: string): Promise<BasketDTO> {
  return db.$transaction(async (tx) => {
    const basket = await tx.tradeupBasket.findUnique({ where: { id: basketId } });

    if (!basket) {
      throw new NotFoundError(`Basket not found: ${basketId}`);
    }

    if (!['BUILDING', 'READY'].includes(basket.status)) {
      throw new ConflictError('Items can only be removed from BUILDING or READY baskets');
    }

    await tx.tradeupBasketItem.delete({
      where: { basketId_inventoryItemId: { basketId, inventoryItemId } },
    });
    await tx.inventoryItem.update({
      where: { id: inventoryItemId },
      data: { status: 'HELD' },
    });
    await tx.tradeupBasket.update({
      where: { id: basketId },
      data: { status: 'BUILDING' },
    });

    return recomputeMetricsInTx(tx, basketId);
  });
}

async function bulkAddItemsImpl(
  basketId: string,
  items: Array<AddBasketItemInput>,
): Promise<BasketDTO> {
  if (items.length === 0) {
    throw new ConflictError('At least one item is required');
  }

  // Reject duplicate inventoryItemIds or duplicate slot indices in the batch.
  const inventoryIds = new Set<string>();
  const requestedSlots = new Set<number>();
  for (const item of items) {
    if (inventoryIds.has(item.inventoryItemId)) {
      throw new ConflictError(`Duplicate inventory item in batch: ${item.inventoryItemId}`);
    }
    inventoryIds.add(item.inventoryItemId);

    if (requestedSlots.has(item.slotIndex)) {
      throw new ConflictError(`Duplicate slot index in batch: ${item.slotIndex}`);
    }
    requestedSlots.add(item.slotIndex);
  }

  return db.$transaction(async (tx) => {
    const basket = await tx.tradeupBasket.findUnique({
      where: { id: basketId },
      include: { plan: true, items: true },
    });

    if (!basket) {
      throw new NotFoundError(`Basket not found: ${basketId}`);
    }

    if (!['BUILDING', 'READY'].includes(basket.status)) {
      throw new ConflictError('Items can only be added to BUILDING or READY baskets');
    }

    const occupiedSlots = new Set(basket.items.map((item) => item.slotIndex));

    if (basket.items.length + items.length > 10) {
      throw new ConflictError('Batch would exceed 10-slot basket capacity');
    }

    for (const item of items) {
      if (occupiedSlots.has(item.slotIndex)) {
        throw new ConflictError(`Basket slot ${item.slotIndex} is already occupied`);
      }
    }

    const inventoryItems = await tx.inventoryItem.findMany({
      where: { id: { in: [...inventoryIds] } },
    });

    if (inventoryItems.length !== items.length) {
      throw new NotFoundError('One or more inventory items were not found');
    }

    for (const inventoryItem of inventoryItems) {
      if (inventoryItem.status !== 'HELD') {
        throw new ConflictError(`Inventory item ${inventoryItem.id} is not HELD`);
      }

      if (inventoryItem.rarity !== basket.plan.inputRarity) {
        throw new ConflictError(
          `Inventory item ${inventoryItem.id} rarity does not match plan inputRarity`,
        );
      }
    }

    await tx.inventoryItem.updateMany({
      where: { id: { in: [...inventoryIds] } },
      data: { status: 'RESERVED_FOR_BASKET' },
    });

    for (const item of items) {
      await tx.tradeupBasketItem.create({
        data: {
          basketId,
          inventoryItemId: item.inventoryItemId,
          slotIndex: item.slotIndex,
        },
      });
    }

    await tx.tradeupBasket.update({
      where: { id: basketId },
      data: { status: 'BUILDING' },
    });

    return recomputeMetricsInTx(tx, basketId);
  });
}

async function reorderItemsImpl(basketId: string, slotMap: Record<string, number>): Promise<BasketDTO> {
  return db.$transaction(async (tx) => {
    const basket = await tx.tradeupBasket.findUnique({ where: { id: basketId }, include: { items: true } });

    if (!basket) {
      throw new NotFoundError(`Basket not found: ${basketId}`);
    }

    if (!['BUILDING', 'READY'].includes(basket.status)) {
      throw new ConflictError('Items can only be reordered in BUILDING or READY baskets');
    }

    const currentIds = basket.items.map((item) => item.inventoryItemId).sort();
    const providedIds = Object.keys(slotMap).sort();
    if (currentIds.join('|') !== providedIds.join('|')) {
      throw new ConflictError('slotMap must include exactly the current basket items');
    }

    const slots = Object.values(slotMap);
    const expectedSlots = Array.from({ length: slots.length }, (_, index) => index);
    if (slots.some((slot) => !Number.isInteger(slot) || slot < 0 || slot > 9)) {
      throw new ConflictError('slotMap contains an invalid slot index');
    }

    if (slots.slice().sort((a, b) => a - b).join('|') !== expectedSlots.join('|')) {
      throw new ConflictError('slotMap must be a permutation of 0..N-1');
    }

    for (const item of basket.items) {
      await tx.tradeupBasketItem.update({
        where: { basketId_inventoryItemId: { basketId, inventoryItemId: item.inventoryItemId } },
        data: { slotIndex: item.slotIndex + 100 },
      });
    }

    for (const [inventoryItemId, slotIndex] of Object.entries(slotMap)) {
      await tx.tradeupBasketItem.update({
        where: { basketId_inventoryItemId: { basketId, inventoryItemId } },
        data: { slotIndex },
      });
    }

    if (basket.status === 'READY') {
      await tx.tradeupBasket.update({ where: { id: basketId }, data: { status: 'BUILDING' } });
    }

    return recomputeMetricsInTx(tx, basketId);
  });
}

async function recomputeMetricsImpl(basketId: string): Promise<BasketDTO> {
  return db.$transaction((tx) => recomputeMetricsInTx(tx, basketId));
}

async function markReadyImpl(basketId: string): Promise<BasketDTO> {
  const evaluation = await evaluateBasket(basketId);

  if (evaluation.readinessIssues.length > 0) {
    throw new ConflictError(`Basket is not ready: ${evaluation.readinessIssues.map((issue) => issue.code).join(', ')}`);
  }

  return db.$transaction(async (tx) => {
    await tx.tradeupBasket.update({ where: { id: basketId }, data: { status: 'READY' } });
    return recomputeMetricsInTx(tx, basketId);
  });
}

async function cancelImpl(basketId: string): Promise<BasketDTO> {
  return db.$transaction(async (tx) => {
    const basket = await tx.tradeupBasket.findUnique({
      where: { id: basketId },
      include: { items: true },
    });

    if (!basket) {
      throw new NotFoundError(`Basket not found: ${basketId}`);
    }

    if (['CANCELLED', 'EXECUTED'].includes(basket.status)) {
      throw new ConflictError('Basket is terminal and cannot be cancelled');
    }

    for (const item of basket.items) {
      await tx.inventoryItem.update({
        where: { id: item.inventoryItemId },
        data: { status: 'HELD' },
      });
    }

    await tx.tradeupBasket.update({ where: { id: basketId }, data: { status: 'CANCELLED' } });
    return recomputeMetricsInTx(tx, basketId);
  });
}

async function recomputeMetricsInTx(tx: TxClient, basketId: string): Promise<BasketDTO> {
  const basket = await tx.tradeupBasket.findUnique({
    where: { id: basketId },
    include: {
      plan: { include: { outcomeItems: true } },
      ...basketInclude,
    },
  });

  if (!basket) {
    throw new NotFoundError(`Basket not found: ${basketId}`);
  }

  const inventoryItems = basket.items.map((item) => item.inventoryItem);
  const slots = await enrichSlotsWithInputRanges(inventoryItems);
  const totalCost = sumMoney(inventoryItems.map((item) => toNumber(item.purchasePrice)));
  const avgFloat = averageFloat(inventoryItems.map((item) => item.floatValue));
  const avgWearProportion = averageWearProportion(slots);
  const projectedPlan = await withCatalogOutcomeFloatRanges(basket.plan);
  const ev = computeBasketEV(slots, projectedPlan, { averageWearProportion: avgWearProportion });
  const expectedProfit = roundMoney(ev.totalEV - totalCost);
  const expectedProfitPct = percentChange(totalCost, ev.totalEV);

  const updated = await tx.tradeupBasket.update({
    where: { id: basketId },
    data: {
      totalCost: toDecimalOrNull(totalCost),
      averageFloat: avgFloat,
      expectedEV: toDecimalOrNull(ev.totalEV),
      expectedProfit: toDecimalOrNull(expectedProfit),
      expectedProfitPct,
    },
    include: basketInclude,
  });

  return toBasketDTO(updated);
}

function validateBasketStatusTransition(
  current: TradeupBasketStatus,
  next: TradeupBasketStatus | undefined,
  itemCount: number,
): void {
  if (!next || next === current) {
    return;
  }

  if (current === 'CANCELLED' || current === 'EXECUTED') {
    throw new ConflictError('Terminal baskets cannot change status');
  }

  if (next === 'READY' && itemCount !== 10) {
    throw new ConflictError('READY requires exactly 10 items');
  }

  if (current === 'BUILDING' && !['READY', 'CANCELLED'].includes(next)) {
    throw new ConflictError(`Invalid basket transition: ${current} -> ${next}`);
  }

  if (current === 'READY' && !['BUILDING', 'CANCELLED'].includes(next)) {
    throw new ConflictError(`Invalid basket transition: ${current} -> ${next}`);
  }
}

