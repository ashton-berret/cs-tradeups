// Trade-up execution service.
//
// An execution records that the user ran the contract. Creating one is the
// only legal path from basket.status = READY to EXECUTED, and it is atomic:
// if any part fails, nothing is persisted.
//
// createExecution transaction:
//   1. lock basket; require status === READY
//   2. freeze inputCost and expectedEV from the basket's current metrics
//   3. insert TradeupExecution with those frozen values
//   4. basket.status -> EXECUTED
//   5. for each basket item: inventory.status -> USED_IN_CONTRACT
//
// recordResult is the post-execution step where the user logs what actually
// came out of the contract. It is separate from creation because the user
// often creates the execution row in the moment, but only fills in the
// result once they can see the item in their Steam inventory.
//
// recordSale logs the eventual market sale of the output item and computes
// realizedProfit + realizedProfitPct. Output items are tracked inside the
// TradeupExecution row rather than as a first-class inventory item because
// they are created by the contract, not by a purchase.

import type {
  CreateExecutionInput,
  ExecutionFilter,
  RecordSaleInput,
  UpdateExecutionResultInput,
  PaginatedResponse,
} from '$lib/types/domain';
import type { ExecutionDTO } from '$lib/types/services';
import type { Prisma, TradeupExecution } from '@prisma/client';
import type { ItemExterior } from '$lib/types/enums';
import { db } from '$lib/server/db/client';
import { ConflictError, NotFoundError } from '$lib/server/http/errors';
import { toDecimal, toDecimalOrNull, toNumber } from '$lib/server/utils/decimal';
import { percentChange, roundMoney } from '$lib/server/utils/money';

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function listExecutions(
  filter: ExecutionFilter,
): Promise<PaginatedResponse<ExecutionDTO>> {
  return listExecutionsImpl(filter);
}

export function getExecution(id: string): Promise<ExecutionDTO | null> {
  return db.tradeupExecution.findUnique({ where: { id } }).then((row) => (row ? toExecutionDTO(row) : null));
}

// ---------------------------------------------------------------------------
// Create / record
// ---------------------------------------------------------------------------

/**
 * Atomic execution creation. Runs the transaction described in the header.
 *
 * Throws:
 *   - NotFound if basket does not exist
 *   - InvalidState if basket.status !== READY
 *   - InvalidState if any basket item has moved out of RESERVED_FOR_BASKET
 *     (signals concurrent edit; user must rebuild the basket)
 */
export function createExecution(
  input: CreateExecutionInput,
): Promise<ExecutionDTO> {
  return createExecutionImpl(input);
}

/**
 * Record what the trade-up produced. May be called multiple times to refine
 * the value estimate; each call overwrites the prior estimate.
 */
export function recordResult(
  executionId: string,
  input: UpdateExecutionResultInput,
): Promise<ExecutionDTO> {
  return db.tradeupExecution
    .update({
      where: { id: executionId },
      data: {
        resultMarketHashName: input.resultMarketHashName,
        resultWeaponName: input.resultWeaponName,
        resultSkinName: input.resultSkinName,
        resultCollection: input.resultCollection,
        resultExterior: input.resultExterior,
        resultFloatValue: input.resultFloatValue,
        estimatedResultValue: toDecimalOrNull(input.estimatedResultValue),
      },
    })
    .then(toExecutionDTO);
}

/**
 * Record the market sale of the output item. Computes:
 *   realizedProfit    = salePrice - saleFees - inputCost
 *   realizedProfitPct = realizedProfit / inputCost * 100
 * Rounded via utils/money.
 */
export function recordSale(
  executionId: string,
  input: RecordSaleInput,
): Promise<ExecutionDTO> {
  return recordSaleImpl(executionId, input);
}

/**
 * Patch free-form notes. Does not touch frozen values or computed profit.
 */
export function updateNotes(
  executionId: string,
  notes: string | null,
): Promise<ExecutionDTO> {
  return db.tradeupExecution
    .update({ where: { id: executionId }, data: { notes } })
    .then(toExecutionDTO);
}

async function listExecutionsImpl(
  filter: ExecutionFilter,
): Promise<PaginatedResponse<ExecutionDTO>> {
  const where: Prisma.TradeupExecutionWhereInput = {
    ...(filter.planId ? { planId: filter.planId } : {}),
    ...(filter.hasResult != null
      ? { resultMarketHashName: filter.hasResult ? { not: null } : null }
      : {}),
    ...(filter.hasSale != null ? { saleDate: filter.hasSale ? { not: null } : null } : {}),
  };
  const skip = (filter.page - 1) * filter.limit;
  const orderBy: Prisma.TradeupExecutionOrderByWithRelationInput = {
    [filter.sortBy]: filter.sortDir,
  };
  const [rows, total] = await Promise.all([
    db.tradeupExecution.findMany({ where, orderBy, skip, take: filter.limit }),
    db.tradeupExecution.count({ where }),
  ]);

  return {
    data: rows.map(toExecutionDTO),
    total,
    page: filter.page,
    limit: filter.limit,
    totalPages: Math.ceil(total / filter.limit),
  };
}

async function createExecutionImpl(input: CreateExecutionInput): Promise<ExecutionDTO> {
  const execution = await db.$transaction(async (tx) => {
    const basket = await tx.tradeupBasket.findUnique({
      where: { id: input.basketId },
      include: { items: { include: { inventoryItem: true } } },
    });

    if (!basket) {
      throw new NotFoundError(`Basket not found: ${input.basketId}`);
    }

    if (basket.status !== 'READY') {
      throw new ConflictError('Basket must be READY before execution');
    }

    if (basket.items.length !== 10) {
      throw new ConflictError('Execution requires exactly 10 basket items');
    }

    const moved = basket.items.find((item) => item.inventoryItem.status !== 'RESERVED_FOR_BASKET');
    if (moved) {
      throw new ConflictError('Basket inventory has moved out of RESERVED_FOR_BASKET');
    }

    const inputCost = toNumber(basket.totalCost) ?? 0;
    const created = await tx.tradeupExecution.create({
      data: {
        basketId: basket.id,
        planId: basket.planId,
        executedAt: input.executedAt,
        inputCost: toDecimal(inputCost),
        expectedEV: toDecimalOrNull(toNumber(basket.expectedEV)),
        notes: input.notes,
      },
    });

    await tx.tradeupBasket.update({
      where: { id: basket.id },
      data: { status: 'EXECUTED' },
    });

    for (const item of basket.items) {
      await tx.inventoryItem.update({
        where: { id: item.inventoryItemId },
        data: { status: 'USED_IN_CONTRACT' },
      });
    }

    return created;
  });

  return toExecutionDTO(execution);
}

async function recordSaleImpl(
  executionId: string,
  input: RecordSaleInput,
): Promise<ExecutionDTO> {
  const execution = await db.tradeupExecution.findUnique({ where: { id: executionId } });

  if (!execution) {
    throw new NotFoundError(`Execution not found: ${executionId}`);
  }

  const inputCost = toNumber(execution.inputCost) ?? 0;
  const netSale = roundMoney(input.salePrice - (input.saleFees ?? 0));
  const realizedProfit = roundMoney(netSale - inputCost);
  const realizedProfitPct = percentChange(inputCost, netSale);

  return db.tradeupExecution
    .update({
      where: { id: executionId },
      data: {
        salePrice: toDecimal(input.salePrice),
        saleFees: toDecimalOrNull(input.saleFees),
        saleDate: input.saleDate,
        realizedProfit: toDecimal(realizedProfit),
        realizedProfitPct,
      },
    })
    .then(toExecutionDTO);
}

function toExecutionDTO(row: TradeupExecution): ExecutionDTO {
  return {
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    basketId: row.basketId,
    planId: row.planId,
    executedAt: row.executedAt,
    inputCost: toNumber(row.inputCost) ?? 0,
    expectedEV: toNumber(row.expectedEV),
    resultMarketHashName: row.resultMarketHashName,
    resultWeaponName: row.resultWeaponName,
    resultSkinName: row.resultSkinName,
    resultCollection: row.resultCollection,
    resultExterior: row.resultExterior as ItemExterior | null,
    resultFloatValue: row.resultFloatValue,
    estimatedResultValue: toNumber(row.estimatedResultValue),
    salePrice: toNumber(row.salePrice),
    saleFees: toNumber(row.saleFees),
    saleDate: row.saleDate,
    realizedProfit: toNumber(row.realizedProfit),
    realizedProfitPct: row.realizedProfitPct,
    notes: row.notes,
  };
}
