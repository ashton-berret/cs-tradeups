// Combination service — saved calculator combinations + recheck history.
//
// `save` freezes a calculator state into a TradeupCombination row (thesis
// totals + plan/outcome snapshot for stable later comparison).
//
// `recheck` re-runs the EV math against current observed prices and appends
// a TradeupCombinationSnapshot. The thesis row is never overwritten — that
// preserves the original reasoning for later analysis.
//
// `list` / `get` expose combinations to the UI with their inputs and the
// latest snapshot available.

import { Prisma } from '@prisma/client';
import { db } from '$lib/server/db/client';
import { ConflictError, NotFoundError } from '$lib/server/http/errors';
import { calculate } from './calculatorService';
import type { CombinationPatchRequest, CombinationSaveRequest } from '$lib/schemas/combinations';
import { toDecimal, toNumber } from '$lib/server/utils/decimal';
import { roundMoney } from '$lib/server/utils/money';

export interface CombinationDTO {
  id: string;
  name: string;
  notes: string | null;
  isActive: boolean;
  mode: 'PLAN' | 'AD_HOC';
  sourcePlanId: string | null;
  inputRarity: string;
  targetRarity: string;
  thesisAt: Date;
  thesis: {
    totalCost: number;
    totalEV: number;
    expectedProfit: number;
    expectedProfitPct: number;
  };
  latestSnapshot: CombinationSnapshotDTO | null;
  inputs: Array<{
    slotIndex: number;
    collection: string;
    catalogSkinId: string | null;
    catalogCollectionId: string | null;
    weaponName: string | null;
    skinName: string | null;
    floatValue: number | null;
    price: number;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CombinationSnapshotDTO {
  id: string;
  observedAt: Date;
  totalCost: number;
  totalEV: number;
  expectedProfit: number;
  expectedProfitPct: number;
  /** Delta vs thesis (negative = thesis was too optimistic). */
  evDeltaVsThesis: number;
  profitDeltaVsThesis: number;
}

export interface RecheckResult {
  combination: CombinationDTO;
  snapshot: CombinationSnapshotDTO;
}

export async function saveCombination(request: CombinationSaveRequest): Promise<CombinationDTO> {
  // When the caller supplies thesisOverride (e.g., the tradeuplab importer
  // forwarding the source's published numbers), use those directly. This
  // matters when our MarketPriceObservation table is sparse — running
  // calculate() against an empty price index produces 0 EV for every
  // outcome and the thesis becomes meaningless. The override path skips
  // calculate entirely; recheck still computes against live prices and
  // reports drift vs the override.
  const result = request.thesisOverride
    ? {
        totalCost: request.thesisOverride.totalCost,
        totalEV: request.thesisOverride.totalEV,
        expectedProfit: request.thesisOverride.expectedProfit,
        expectedProfitPct: request.thesisOverride.expectedProfitPct,
      }
    : await calculate({
        planId: request.sourcePlanId,
        targetRarity: request.targetRarity,
        inputRarity: request.inputRarity,
        inputs: request.inputs,
      });

  // Snapshot the plan/outcome state so later rechecks have a stable thesis
  // even if the source plan is edited or deleted.
  const planSnapshot = await buildPlanSnapshot(request);

  let created;
  try {
    created = await db.tradeupCombination.create({
      data: {
        name: request.name,
        notes: request.notes ?? null,
        isActive: request.isActive ?? false,
        mode: request.sourcePlanId ? 'PLAN' : 'AD_HOC',
        sourcePlanId: request.sourcePlanId ?? null,
        inputRarity: planSnapshot.inputRarity,
        targetRarity: planSnapshot.targetRarity,
        thesisTotalCost: toDecimal(result.totalCost),
        thesisTotalEV: toDecimal(result.totalEV),
        thesisExpectedProfit: toDecimal(result.expectedProfit),
        thesisExpectedProfitPct: result.expectedProfitPct,
        thesisPlanSnapshot: planSnapshot as unknown as Prisma.InputJsonValue,
        tradeupLabId: request.tradeupLabId ?? null,
        inputs: {
          create: request.inputs.map((input, idx) => ({
            slotIndex: idx,
            collection: input.collection,
            catalogSkinId: input.catalogSkinId ?? null,
            catalogCollectionId: input.catalogCollectionId ?? null,
            weaponName: null,
            skinName: null,
            floatValue: input.floatValue ?? null,
            price: toDecimal(input.price),
          })),
        },
      },
      include: { inputs: true, recheckSnapshots: { orderBy: { observedAt: 'desc' }, take: 1 } },
    });
  } catch (err) {
    // P2002 = unique constraint violation. Surfaces cleanly when the
    // tradeuplab importer hits the same combo on a re-run.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002' &&
      request.tradeupLabId != null
    ) {
      throw new ConflictError(`Combination already imported (tradeupLabId=${request.tradeupLabId}).`);
    }
    throw err;
  }

  return toDTO(created);
}

export async function listCombinations(opts: {
  includeInactive?: boolean;
} = {}): Promise<CombinationDTO[]> {
  const rows = await db.tradeupCombination.findMany({
    where: opts.includeInactive ? undefined : undefined, // Always include both for now — UI filters.
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    include: { inputs: { orderBy: { slotIndex: 'asc' } }, recheckSnapshots: { orderBy: { observedAt: 'desc' }, take: 1 } },
  });
  return rows.map(toDTO);
}

export async function getCombination(id: string): Promise<CombinationDTO> {
  const row = await db.tradeupCombination.findUnique({
    where: { id },
    include: { inputs: { orderBy: { slotIndex: 'asc' } }, recheckSnapshots: { orderBy: { observedAt: 'desc' }, take: 1 } },
  });
  if (!row) throw new NotFoundError(`Combination not found: ${id}`);
  return toDTO(row);
}

export async function patchCombination(
  id: string,
  patch: CombinationPatchRequest,
): Promise<CombinationDTO> {
  const existing = await db.tradeupCombination.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new NotFoundError(`Combination not found: ${id}`);

  await db.tradeupCombination.update({
    where: { id },
    data: {
      name: patch.name,
      notes: patch.notes,
      isActive: patch.isActive,
    },
  });
  return getCombination(id);
}

export async function deleteCombination(id: string): Promise<void> {
  const existing = await db.tradeupCombination.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new NotFoundError(`Combination not found: ${id}`);
  await db.tradeupCombination.delete({ where: { id } });
}

export async function recheckCombination(id: string): Promise<RecheckResult> {
  const row = await db.tradeupCombination.findUnique({
    where: { id },
    include: { inputs: { orderBy: { slotIndex: 'asc' } } },
  });
  if (!row) throw new NotFoundError(`Combination not found: ${id}`);

  // Re-run the calculator with the saved inputs. We use the source plan when
  // it still exists; otherwise we fall back to ad-hoc with the saved
  // rarities. The thesisPlanSnapshot is preserved separately for forensics.
  const sourcePlanStillExists = row.sourcePlanId
    ? await db.tradeupPlan.findUnique({ where: { id: row.sourcePlanId }, select: { id: true } })
    : null;

  const result = await calculate({
    planId: sourcePlanStillExists ? row.sourcePlanId ?? undefined : undefined,
    targetRarity: row.targetRarity as never,
    inputRarity: row.inputRarity as never,
    inputs: row.inputs.map((input) => ({
      collection: input.collection,
      catalogSkinId: input.catalogSkinId ?? undefined,
      catalogCollectionId: input.catalogCollectionId ?? undefined,
      floatValue: input.floatValue ?? undefined,
      price: toNumber(input.price) ?? 0,
    })),
  });

  const snapshot = await db.tradeupCombinationSnapshot.create({
    data: {
      combinationId: id,
      totalCost: toDecimal(result.totalCost),
      totalEV: toDecimal(result.totalEV),
      expectedProfit: toDecimal(result.expectedProfit),
      expectedProfitPct: result.expectedProfitPct,
      evBreakdown: result.ev as unknown as Prisma.InputJsonValue,
    },
  });

  const refreshed = await getCombination(id);
  return {
    combination: refreshed,
    snapshot: snapshotToDTO(snapshot, refreshed.thesis),
  };
}

async function buildPlanSnapshot(request: CombinationSaveRequest): Promise<{
  mode: 'PLAN' | 'AD_HOC';
  inputRarity: string;
  targetRarity: string;
  planName: string | null;
  rules: unknown[];
  outcomes: unknown[];
}> {
  if (request.sourcePlanId) {
    const plan = await db.tradeupPlan.findUnique({
      where: { id: request.sourcePlanId },
      include: { rules: true, outcomeItems: true },
    });
    if (!plan) {
      throw new NotFoundError(`Source plan not found: ${request.sourcePlanId}`);
    }
    return {
      mode: 'PLAN',
      inputRarity: plan.inputRarity,
      targetRarity: plan.targetRarity,
      planName: plan.name,
      rules: plan.rules,
      outcomes: plan.outcomeItems,
    };
  }
  return {
    mode: 'AD_HOC',
    inputRarity: request.inputRarity ?? defaultInputRarityFor(request.targetRarity!),
    targetRarity: request.targetRarity!,
    planName: null,
    rules: [],
    outcomes: [],
  };
}

const RARITY_ORDER = [
  'CONSUMER_GRADE',
  'INDUSTRIAL_GRADE',
  'MIL_SPEC',
  'RESTRICTED',
  'CLASSIFIED',
  'COVERT',
] as const;

function defaultInputRarityFor(targetRarity: string): string {
  const idx = RARITY_ORDER.indexOf(targetRarity as (typeof RARITY_ORDER)[number]);
  if (idx <= 0) return targetRarity;
  return RARITY_ORDER[idx - 1];
}

type CombinationRow = Prisma.TradeupCombinationGetPayload<{
  include: {
    inputs: true;
    recheckSnapshots: true;
  };
}>;

function toDTO(row: CombinationRow): CombinationDTO {
  const thesis = {
    totalCost: toNumber(row.thesisTotalCost) ?? 0,
    totalEV: toNumber(row.thesisTotalEV) ?? 0,
    expectedProfit: toNumber(row.thesisExpectedProfit) ?? 0,
    expectedProfitPct: row.thesisExpectedProfitPct,
  };
  const latest = row.recheckSnapshots[0] ?? null;
  return {
    id: row.id,
    name: row.name,
    notes: row.notes,
    isActive: row.isActive,
    mode: row.mode as 'PLAN' | 'AD_HOC',
    sourcePlanId: row.sourcePlanId,
    inputRarity: row.inputRarity,
    targetRarity: row.targetRarity,
    thesisAt: row.thesisAt,
    thesis,
    latestSnapshot: latest ? snapshotToDTO(latest, thesis) : null,
    inputs: row.inputs
      .slice()
      .sort((a, b) => a.slotIndex - b.slotIndex)
      .map((input) => ({
        slotIndex: input.slotIndex,
        collection: input.collection,
        catalogSkinId: input.catalogSkinId,
        catalogCollectionId: input.catalogCollectionId,
        weaponName: input.weaponName,
        skinName: input.skinName,
        floatValue: input.floatValue,
        price: toNumber(input.price) ?? 0,
      })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function snapshotToDTO(
  snapshot: Prisma.TradeupCombinationSnapshotGetPayload<object>,
  thesis: CombinationDTO['thesis'],
): CombinationSnapshotDTO {
  const totalEV = toNumber(snapshot.totalEV) ?? 0;
  const expectedProfit = toNumber(snapshot.expectedProfit) ?? 0;
  return {
    id: snapshot.id,
    observedAt: snapshot.observedAt,
    totalCost: toNumber(snapshot.totalCost) ?? 0,
    totalEV,
    expectedProfit,
    expectedProfitPct: snapshot.expectedProfitPct,
    evDeltaVsThesis: roundMoney(totalEV - thesis.totalEV),
    profitDeltaVsThesis: roundMoney(expectedProfit - thesis.expectedProfit),
  };
}
