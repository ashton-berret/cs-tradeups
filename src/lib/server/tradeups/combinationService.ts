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
import { percentChange, roundMoney } from '$lib/server/utils/money';
import { steamGrossToNetSaleValue } from '$lib/server/marketPrices/fees';
import { getCatalogSkinById } from '$lib/server/catalog/linkage';
import type { PaginatedResponse } from '$lib/types/domain';
import type { ItemRarity } from '$lib/types/enums';
import { createPlan, getPlan, updatePlan } from './planService';

export interface CombinationDTO {
  id: string;
  name: string;
  notes: string | null;
  isActive: boolean;
  mode: 'PLAN' | 'AD_HOC';
  sourcePlanId: string | null;
  tradeupLabId: number | null;
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
  /** Distinct collections across all inputs, in first-seen order. */
  collections: string[];
  /** Max input float across all inputs (null when no input has a float). */
  maxInputFloat: number | null;
  /** Max per-item input price across all inputs. */
  maxInputPrice: number | null;
  /** Possible outputs (parsed from imported notes or thesisPlanSnapshot). */
  outputs: CombinationOutputDTO[];
  /** Chance of profit ≥ 0 as a 0–100 percentage. Null when unknown. */
  profitChance: number | null;
  /** Structural signature for duplicate detection. */
  signature: string;
  /** Other combinations sharing this signature (excludes self). */
  duplicates: Array<{
    id: string;
    tradeupLabId: number | null;
    createdAt: Date;
    isActive: boolean;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CombinationOutputDTO {
  marketHashName: string | null;
  displayName: string;
  exterior: string | null;
  floatValue: number | null;
  price: number | null;
  /** Probability as a 0–1 fraction. */
  probability: number;
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

export interface CombinationListFilter {
  search?: string;
  mode?: 'PLAN' | 'AD_HOC';
  targetRarity?: string;
  inputRarity?: string;
  collection?: string;
  status?: 'active' | 'draft';
  source?: 'imported' | 'local';
  minProfit?: number;
  minProfitPct?: number;
  minProfitChance?: number;
  maxInputFloat?: number;
  maxInputPrice?: number;
  recheckStatus?: 'rechecked' | 'never';
  outputs?: 'with' | 'without';
  sortBy?:
    | 'createdAt'
    | 'name'
    | 'inputCost'
    | 'estimatedValue'
    | 'thesisProfit'
    | 'thesisProfitPct'
    | 'profitChance'
    | 'latestProfit'
    | 'latestDelta'
    | 'targetRarity'
    | 'inputRarity'
    | 'collection'
    | 'maxFloat'
    | 'maxInputPrice';
  sortDir?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  /** When true (default), collapse rows with the same structural signature. */
  collapseDuplicates?: boolean;
}

/**
 * Stable structural signature for a combination. Two combinations with the
 * same signature describe the same tradeup (same input/target tier, same
 * inputs at the same float and price). Title and computed profit numbers
 * are derived from these fields so they need not be in the signature.
 */
function computeSignature(args: {
  inputRarity: string;
  targetRarity: string;
  inputs: Array<{
    catalogSkinId: string | null;
    collection: string;
    floatValue: number | null;
    price: { toString(): string } | number;
  }>;
}): string {
  const parts = args.inputs
    .map((i) => {
      const ident = i.catalogSkinId ?? `c:${i.collection}`;
      const fl = i.floatValue != null ? i.floatValue.toFixed(4) : '';
      const priceNum = typeof i.price === 'number' ? i.price : Number(i.price.toString());
      const pr = Number.isFinite(priceNum) ? priceNum.toFixed(2) : '';
      return `${ident}|${fl}|${pr}`;
    })
    .sort()
    .join(';');
  return `${args.inputRarity}>${args.targetRarity}::${parts}`;
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

  // Backfill weaponName/skinName from the catalog when the input carries a
  // catalogSkinId. Saves the UI from having to do a per-row catalog lookup
  // and keeps the columns useful for search.
  const inputRows = await Promise.all(
    request.inputs.map(async (input, idx) => {
      const skin = input.catalogSkinId ? await getCatalogSkinById(input.catalogSkinId) : null;
      return {
        slotIndex: idx,
        collection: input.collection,
        catalogSkinId: input.catalogSkinId ?? null,
        catalogCollectionId: input.catalogCollectionId ?? null,
        weaponName: skin?.weaponName ?? null,
        skinName: skin?.skinName ?? null,
        floatValue: input.floatValue ?? null,
        price: toDecimal(input.price),
      };
    }),
  );

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
        inputs: { create: inputRows },
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

export async function listCombinations(
  filter: CombinationListFilter = {},
): Promise<PaginatedResponse<CombinationDTO>> {
  const page = Math.max(1, filter.page ?? 1);
  const limit = Math.min(200, Math.max(1, filter.limit ?? 25));
  const sortDir = filter.sortDir ?? 'desc';
  const collapse = filter.collapseDuplicates ?? true;

  const where: Prisma.TradeupCombinationWhereInput = {};
  if (filter.search && filter.search.trim()) {
    const q = filter.search.trim();
    where.OR = [
      { name: { contains: q } },
      { notes: { contains: q } },
      { inputs: { some: { weaponName: { contains: q } } } },
      { inputs: { some: { skinName: { contains: q } } } },
      { inputs: { some: { collection: { contains: q } } } },
    ];
  }
  if (filter.mode) where.mode = filter.mode;
  if (filter.targetRarity) where.targetRarity = filter.targetRarity;
  if (filter.inputRarity) where.inputRarity = filter.inputRarity;
  if (filter.status === 'active') where.isActive = true;
  if (filter.status === 'draft') where.isActive = false;
  if (filter.source === 'imported') where.tradeupLabId = { not: null };
  if (filter.source === 'local') where.tradeupLabId = null;
  const needsDerivedFilter = Boolean(
    filter.collection ||
      filter.minProfit != null ||
      filter.minProfitPct != null ||
      filter.minProfitChance != null ||
      filter.maxInputFloat != null ||
      filter.maxInputPrice != null ||
      filter.recheckStatus ||
      filter.outputs,
  );

  // Sorts that don't require post-load joining. latestProfit / latestDelta need
  // the snapshot data, so we sort those in-memory after toDTO. Duplicate
  // collapsing also forces in-memory grouping over the full match set.
  const dbSortable = new Set([
    'createdAt',
    'name',
    'inputCost',
  ]);
  const useDbPath = !collapse && !needsDerivedFilter && dbSortable.has(filter.sortBy ?? 'createdAt');

  if (useDbPath) {
    const orderBy: Prisma.TradeupCombinationOrderByWithRelationInput[] = [
      filter.sortBy === 'thesisProfit'
        ? { thesisExpectedProfit: sortDir }
        : filter.sortBy === 'thesisProfitPct'
          ? { thesisExpectedProfitPct: sortDir }
          : filter.sortBy === 'inputCost'
            ? { thesisTotalCost: sortDir }
            : filter.sortBy === 'estimatedValue'
              ? { thesisTotalEV: sortDir }
              : filter.sortBy === 'name'
                ? { name: sortDir }
                : { createdAt: sortDir },
    ];
    const total = await db.tradeupCombination.count({ where });
    const rows = await db.tradeupCombination.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        inputs: { orderBy: { slotIndex: 'asc' } },
        recheckSnapshots: { orderBy: { observedAt: 'desc' }, take: 1 },
      },
    });
    const data = rows.map(toDTO);
    await backfillSkinNames(data);
    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  // In-memory path: load all matching rows, optionally collapse duplicates,
  // sort, paginate. Bounded by the full combination count (~hundreds) which
  // is fine for the local single-user model.
  const allRows = await db.tradeupCombination.findMany({
    where,
    include: {
      inputs: { orderBy: { slotIndex: 'asc' } },
      recheckSnapshots: { orderBy: { observedAt: 'desc' }, take: 1 },
    },
  });
  let allDTOs = allRows.map(toDTO);
  await backfillSkinNames(allDTOs);

  if (collapse) {
    allDTOs = collapseBySignature(allDTOs);
  }
  allDTOs = applyDerivedFilters(allDTOs, filter);

  const sorted = allDTOs.slice().sort((a, b) => {
    const cmp = compareCombinations(a, b, filter.sortBy);
    return sortDir === 'asc' ? cmp : -cmp;
  });
  const total = sorted.length;
  const start = (page - 1) * limit;
  return {
    data: sorted.slice(start, start + limit),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

/**
 * Group combinations by structural signature. For each group with >1 member,
 * the representative is the active one (if any), otherwise the most recently
 * created. Other members are attached to `representative.duplicates` so the UI
 * can surface and expand them.
 */
function collapseBySignature(combinations: CombinationDTO[]): CombinationDTO[] {
  const groups = new Map<string, CombinationDTO[]>();
  for (const c of combinations) {
    const list = groups.get(c.signature);
    if (list) list.push(c);
    else groups.set(c.signature, [c]);
  }

  const result: CombinationDTO[] = [];
  for (const list of groups.values()) {
    if (list.length === 1) {
      result.push(list[0]);
      continue;
    }
    list.sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    const [rep, ...rest] = list;
    rep.duplicates = rest.map((d) => ({
      id: d.id,
      tradeupLabId: d.tradeupLabId,
      createdAt: d.createdAt,
      isActive: d.isActive,
    }));
    result.push(rep);
  }
  return result;
}

const RARITY_RANK: Record<string, number> = {
  CONSUMER_GRADE: 0,
  INDUSTRIAL_GRADE: 1,
  MIL_SPEC: 2,
  RESTRICTED: 3,
  CLASSIFIED: 4,
  COVERT: 5,
};

/**
 * Returns the ascending comparator value for two combinations under a given
 * sort key. Numeric sorts return numbers; string sorts return -1/0/1 from
 * locale comparison. Missing values sort last in ascending order.
 */
function compareCombinations(
  a: CombinationDTO,
  b: CombinationDTO,
  sortBy: CombinationListFilter['sortBy'],
): number {
  // String sorts.
  if (sortBy === 'targetRarity' || sortBy === 'inputRarity') {
    const av = RARITY_RANK[sortBy === 'targetRarity' ? a.targetRarity : a.inputRarity] ?? 99;
    const bv = RARITY_RANK[sortBy === 'targetRarity' ? b.targetRarity : b.inputRarity] ?? 99;
    return av - bv;
  }
  if (sortBy === 'collection') {
    const av = (a.collections[0] ?? '').toLowerCase();
    const bv = (b.collections[0] ?? '').toLowerCase();
    return av < bv ? -1 : av > bv ? 1 : 0;
  }
  if (sortBy === 'name') {
    return a.name.localeCompare(b.name);
  }

  // Numeric sorts. NaN/null sentinels go to the end in ascending order
  // by mapping to -Infinity (so descending lifts real numbers above missing).
  const av = numericSortValue(a, sortBy);
  const bv = numericSortValue(b, sortBy);
  return av - bv;
}

function numericSortValue(c: CombinationDTO, sortBy: CombinationListFilter['sortBy']): number {
  switch (sortBy) {
    case 'inputCost':
      return c.thesis.totalCost;
    case 'estimatedValue':
      return c.thesis.totalEV;
    case 'thesisProfit':
      return c.thesis.expectedProfit;
    case 'thesisProfitPct':
      return c.thesis.expectedProfitPct;
    case 'profitChance':
      return c.profitChance ?? Number.NEGATIVE_INFINITY;
    case 'latestProfit':
      return c.latestSnapshot?.expectedProfit ?? Number.NEGATIVE_INFINITY;
    case 'latestDelta':
      return c.latestSnapshot?.profitDeltaVsThesis ?? Number.NEGATIVE_INFINITY;
    case 'maxFloat':
      return c.maxInputFloat ?? Number.NEGATIVE_INFINITY;
    case 'maxInputPrice':
      return c.maxInputPrice ?? Number.NEGATIVE_INFINITY;
    case 'createdAt':
    default:
      return c.createdAt.getTime();
  }
}

export async function recheckBatch(ids: string[]): Promise<{
  succeeded: string[];
  failed: Array<{ id: string; message: string }>;
}> {
  const succeeded: string[] = [];
  const failed: Array<{ id: string; message: string }> = [];
  for (const id of ids) {
    try {
      await recheckCombination(id);
      succeeded.push(id);
    } catch (err) {
      failed.push({ id, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return { succeeded, failed };
}

export async function getCombination(id: string): Promise<CombinationDTO> {
  const row = await db.tradeupCombination.findUnique({
    where: { id },
    include: { inputs: { orderBy: { slotIndex: 'asc' } }, recheckSnapshots: { orderBy: { observedAt: 'desc' }, take: 1 } },
  });
  if (!row) throw new NotFoundError(`Combination not found: ${id}`);
  const dto = toDTO(row);
  await backfillSkinNames([dto]);
  return dto;
}

export async function patchCombination(
  id: string,
  patch: CombinationPatchRequest,
): Promise<CombinationDTO> {
  const existing = await db.tradeupCombination.findUnique({
    where: { id },
    include: { inputs: { orderBy: { slotIndex: 'asc' } }, recheckSnapshots: { orderBy: { observedAt: 'desc' }, take: 1 } },
  });
  if (!existing) throw new NotFoundError(`Combination not found: ${id}`);

  let sourcePlanId: string | undefined;
  if (patch.isActive === true && !existing.isActive) {
    sourcePlanId = await ensureActivePlanForCombination(toDTO(existing));
  }

  await db.tradeupCombination.update({
    where: { id },
    data: {
      name: patch.name,
      notes: patch.notes,
      isActive: patch.isActive,
      sourcePlanId,
      mode: sourcePlanId ? 'PLAN' : undefined,
    },
  });
  return getCombination(id);
}

async function ensureActivePlanForCombination(combination: CombinationDTO): Promise<string> {
  if (combination.sourcePlanId) {
    const plan = await getPlan(combination.sourcePlanId);
    if (plan) {
      if (!plan.isActive) {
        await updatePlan(plan.id, { isActive: true });
      }
      return plan.id;
    }
  }

  const primaryCollection = combination.collections[0] ?? combination.inputs[0]?.collection ?? 'Unknown';
  const inputGroups = groupInputsForPlanRules(combination.inputs);
  const outcomeItems = combination.outputs
    .filter((output) => output.price != null)
    .map((output) => ({
      marketHashName: output.marketHashName ?? output.displayName,
      collection: primaryCollection,
      rarity: combination.targetRarity as ItemRarity,
      estimatedMarketValue: output.price ?? 0,
      probabilityWeight: output.probability > 0 ? output.probability : 1,
    }));

  const plan = await createPlan({
    name: combination.name,
    description: `Created from saved tradeup ${combination.id}.`,
    inputRarity: combination.inputRarity as ItemRarity,
    targetRarity: combination.targetRarity as ItemRarity,
    isActive: true,
    minProfitThreshold: Math.max(0, combination.thesis.expectedProfit),
    minProfitPctThreshold: combination.thesis.expectedProfitPct,
    notes: combination.notes ?? undefined,
    rules: inputGroups.map((group, index) => ({
      collection: group.collection,
      rarity: combination.inputRarity as ItemRarity,
      maxFloat: group.maxFloat ?? undefined,
      maxBuyPrice: group.maxBuyPrice ?? undefined,
      minQuantity: group.quantity,
      maxQuantity: group.quantity,
      priority: inputGroups.length - index,
      isPreferred: true,
    })),
    outcomeItems,
  });

  return plan.id;
}

function groupInputsForPlanRules(inputs: CombinationDTO['inputs']): Array<{
  collection: string;
  quantity: number;
  maxFloat: number | null;
  maxBuyPrice: number | null;
}> {
  const groups = new Map<string, { collection: string; quantity: number; maxFloat: number | null; maxBuyPrice: number | null }>();
  for (const input of inputs) {
    const key = input.catalogCollectionId ?? input.collection;
    const existing = groups.get(key);
    if (existing) {
      existing.quantity += 1;
      if (input.floatValue != null && (existing.maxFloat == null || input.floatValue > existing.maxFloat)) {
        existing.maxFloat = input.floatValue;
      }
      if (existing.maxBuyPrice == null || input.price > existing.maxBuyPrice) {
        existing.maxBuyPrice = input.price;
      }
      continue;
    }
    groups.set(key, {
      collection: input.collection,
      quantity: 1,
      maxFloat: input.floatValue,
      maxBuyPrice: input.price,
    });
  }
  return [...groups.values()];
}

export async function deleteCombination(id: string): Promise<void> {
  const existing = await db.tradeupCombination.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new NotFoundError(`Combination not found: ${id}`);
  await db.tradeupCombination.delete({ where: { id } });
}

export async function deleteTradeupLabCombinations(): Promise<{
  combinationsDeleted: number;
  generatedPlansDeleted: number;
  generatedPlansSkipped: number;
}> {
  const imported = await db.tradeupCombination.findMany({
    where: { tradeupLabId: { not: null } },
    select: { sourcePlanId: true },
  });
  const sourcePlanIds = Array.from(
    new Set(imported.map((row) => row.sourcePlanId).filter((id): id is string => Boolean(id))),
  );

  const generatedPlans =
    sourcePlanIds.length > 0
      ? await db.tradeupPlan.findMany({
          where: {
            id: { in: sourcePlanIds },
            description: { startsWith: 'Created from saved tradeup ' },
          },
          select: {
            id: true,
            _count: { select: { baskets: true, executions: true } },
          },
        })
      : [];

  const deletablePlanIds = generatedPlans
    .filter((plan) => plan._count.baskets === 0 && plan._count.executions === 0)
    .map((plan) => plan.id);
  const generatedPlansSkipped = generatedPlans.length - deletablePlanIds.length;

  const [deletedCombinations, deletedPlans] = await db.$transaction([
    db.tradeupCombination.deleteMany({ where: { tradeupLabId: { not: null } } }),
    db.tradeupPlan.deleteMany({ where: { id: { in: deletablePlanIds } } }),
  ]);

  return {
    combinationsDeleted: deletedCombinations.count,
    generatedPlansDeleted: deletedPlans.count,
    generatedPlansSkipped,
  };
}

function applyDerivedFilters(
  combinations: CombinationDTO[],
  filter: CombinationListFilter,
): CombinationDTO[] {
  const collection = filter.collection?.trim().toLowerCase();
  return combinations.filter((c) => {
    if (collection && !c.collections.some((value) => value.toLowerCase().includes(collection))) {
      return false;
    }
    if (filter.minProfit != null && c.thesis.expectedProfit < filter.minProfit) {
      return false;
    }
    if (filter.minProfitPct != null && c.thesis.expectedProfitPct < filter.minProfitPct) {
      return false;
    }
    if (filter.minProfitChance != null && (c.profitChance == null || c.profitChance < filter.minProfitChance)) {
      return false;
    }
    if (filter.maxInputFloat != null && (c.maxInputFloat == null || c.maxInputFloat > filter.maxInputFloat)) {
      return false;
    }
    if (filter.maxInputPrice != null && (c.maxInputPrice == null || c.maxInputPrice > filter.maxInputPrice)) {
      return false;
    }
    if (filter.recheckStatus === 'rechecked' && !c.latestSnapshot) {
      return false;
    }
    if (filter.recheckStatus === 'never' && c.latestSnapshot) {
      return false;
    }
    if (filter.outputs === 'with' && c.outputs.length === 0) {
      return false;
    }
    if (filter.outputs === 'without' && c.outputs.length > 0) {
      return false;
    }
    return true;
  });
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
  let thesis = {
    totalCost: toNumber(row.thesisTotalCost) ?? 0,
    totalEV: toNumber(row.thesisTotalEV) ?? 0,
    expectedProfit: toNumber(row.thesisExpectedProfit) ?? 0,
    expectedProfitPct: row.thesisExpectedProfitPct,
  };
  const latest = row.recheckSnapshots[0] ?? null;

  const collections: string[] = [];
  const seen = new Set<string>();
  let maxFloat: number | null = null;
  let maxPrice: number | null = null;
  for (const input of row.inputs) {
    if (!seen.has(input.collection)) {
      seen.add(input.collection);
      collections.push(input.collection);
    }
    if (input.floatValue != null && (maxFloat == null || input.floatValue > maxFloat)) {
      maxFloat = input.floatValue;
    }
    const price = toNumber(input.price) ?? 0;
    if (maxPrice == null || price > maxPrice) maxPrice = price;
  }

  const { outputs, profitChance } = deriveOutputsAndChance(
    row.notes,
    row.thesisPlanSnapshot,
    thesis.totalCost,
    row.tradeupLabId != null,
  );
  thesis = steamNetThesisForImportedCombination(row.notes, row.tradeupLabId != null, thesis, outputs);

  const signature = computeSignature({
    inputRarity: row.inputRarity,
    targetRarity: row.targetRarity,
    inputs: row.inputs.map((input) => ({
      catalogSkinId: input.catalogSkinId,
      collection: input.collection,
      floatValue: input.floatValue,
      price: input.price,
    })),
  });

  return {
    id: row.id,
    name: row.name,
    notes: row.notes,
    isActive: row.isActive,
    mode: row.mode as 'PLAN' | 'AD_HOC',
    sourcePlanId: row.sourcePlanId,
    tradeupLabId: row.tradeupLabId,
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
    collections,
    maxInputFloat: maxFloat,
    maxInputPrice: maxPrice,
    outputs,
    profitChance,
    signature,
    duplicates: [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Derive output list + profit chance from whichever source has them.
 * - Imported (tradeuplab) combos stash a JSON blob in `notes` with `outcomes`
 *   and `published.successRate`.
 * - Local plan-mode saves keep the plan's outcome rows in `thesisPlanSnapshot`.
 *   Profit chance is derived by summing per-outcome probability × (price > totalCost).
 * Returns empty/null on parse failure or when neither source has usable data.
 */
function deriveOutputsAndChance(
  notes: string | null,
  thesisPlanSnapshot: unknown,
  totalCost: number,
  isTradeUpLabRow = false,
): { outputs: CombinationOutputDTO[]; profitChance: number | null } {
  const fromNotes = parseImportedNotes(notes, totalCost, isTradeUpLabRow);
  if (fromNotes && fromNotes.outputs.length > 0) {
    return fromNotes;
  }

  const fromSnapshot = parsePlanSnapshotOutcomes(thesisPlanSnapshot);
  if (fromSnapshot.length === 0) {
    return { outputs: [], profitChance: null };
  }
  const totalProb = fromSnapshot.reduce((sum, o) => sum + o.probability, 0);
  const profitableProb = fromSnapshot.reduce(
    (sum, o) => sum + (o.price != null && o.price > totalCost ? o.probability : 0),
    0,
  );
  const profitChance = totalProb > 0 ? (profitableProb / totalProb) * 100 : null;
  return { outputs: fromSnapshot, profitChance };
}

function parseImportedNotes(
  notes: string | null,
  totalCost: number,
  isTradeUpLabRow = false,
): { outputs: CombinationOutputDTO[]; profitChance: number | null } | null {
  if (!notes) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(notes);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const obj = parsed as Record<string, unknown>;
  const published = obj.published as Record<string, unknown> | undefined;
  const outcomes = Array.isArray(obj.outcomes) ? (obj.outcomes as Record<string, unknown>[]) : [];
  const steamNet = isTradeUpLabRow || isTradeUpLabNotes(obj);

  const outputs: CombinationOutputDTO[] = outcomes.map((o) => ({
    marketHashName: typeof o.marketHashName === 'string' ? o.marketHashName : null,
    displayName:
      (typeof o.displayName === 'string' && o.displayName) ||
      (typeof o.marketHashName === 'string' && o.marketHashName) ||
      'Unknown',
    exterior: typeof o.exterior === 'string' ? o.exterior : null,
    floatValue: typeof o.floatValue === 'number' ? o.floatValue : null,
    price:
      typeof o.price === 'number'
        ? steamNet
          ? steamGrossToNetSaleValue(o.price)
          : o.price
        : null,
    probability: typeof o.probability === 'number' ? o.probability : 0,
  }));

  const successRate = steamNet
    ? profitChanceFromOutputs(outputs, totalCost)
    : published && typeof published.successRate === 'number'
      ? (published.successRate as number)
      : null;

  return { outputs, profitChance: successRate };
}

function isTradeUpLabNotes(obj: Record<string, unknown>): boolean {
  return (
    (typeof obj.source === 'string' && obj.source.toLowerCase().includes('tradeuplab')) ||
    typeof obj.tradeupLabId === 'number'
  );
}

function profitChanceFromOutputs(outputs: CombinationOutputDTO[], totalCost: number): number | null {
  const totalProb = outputs.reduce((sum, o) => sum + o.probability, 0);
  if (totalProb <= 0) return null;
  const profitableProb = outputs.reduce(
    (sum, o) => sum + (o.price != null && o.price > totalCost ? o.probability : 0),
    0,
  );
  return (profitableProb / totalProb) * 100;
}

function steamNetThesisForImportedCombination(
  notes: string | null,
  isTradeUpLabRow: boolean,
  thesis: CombinationDTO['thesis'],
  outputs: CombinationOutputDTO[],
): CombinationDTO['thesis'] {
  if (!notes || outputs.length === 0) return thesis;
  let parsed: unknown;
  try {
    parsed = JSON.parse(notes);
  } catch {
    return thesis;
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    (!isTradeUpLabRow && !isTradeUpLabNotes(parsed as Record<string, unknown>))
  ) {
    return thesis;
  }

  const totalEV = roundMoney(
    outputs.reduce((sum, output) => sum + (output.price ?? 0) * output.probability, 0),
  );
  const expectedProfit = roundMoney(totalEV - thesis.totalCost);
  return {
    totalCost: thesis.totalCost,
    totalEV,
    expectedProfit,
    expectedProfitPct: percentChange(thesis.totalCost, totalEV),
  };
}

function parsePlanSnapshotOutcomes(snapshot: unknown): CombinationOutputDTO[] {
  if (!snapshot || typeof snapshot !== 'object') return [];
  const arr = (snapshot as Record<string, unknown>).outcomes;
  if (!Array.isArray(arr)) return [];

  // First pass: extract usable fields and a raw weight (probabilityWeight).
  type Raw = { displayName: string; marketHashName: string | null; weight: number; price: number | null; exterior: string | null };
  const raw: Raw[] = arr.map((o) => {
    const row = o as Record<string, unknown>;
    const weaponName = typeof row.weaponName === 'string' ? row.weaponName : null;
    const skinName = typeof row.skinName === 'string' ? row.skinName : null;
    const marketHashName = typeof row.marketHashName === 'string' ? row.marketHashName : null;
    const composed = [weaponName, skinName].filter(Boolean).join(' | ');
    const displayName = marketHashName ?? (composed || 'Unknown');
    const weight = typeof row.probabilityWeight === 'number' ? row.probabilityWeight : 1;
    const price =
      typeof row.estimatedMarketValue === 'number'
        ? row.estimatedMarketValue
        : typeof row.estimatedMarketValue === 'string'
          ? Number(row.estimatedMarketValue)
          : null;
    return { displayName, marketHashName, weight, price: Number.isFinite(price as number) ? (price as number) : null, exterior: null };
  });

  const totalWeight = raw.reduce((sum, r) => sum + (r.weight > 0 ? r.weight : 0), 0);
  if (totalWeight <= 0) return [];

  return raw.map((r) => ({
    marketHashName: r.marketHashName,
    displayName: r.displayName,
    exterior: r.exterior,
    floatValue: null,
    price: r.price,
    probability: r.weight / totalWeight,
  }));
}

/**
 * Resolve missing weaponName/skinName on combination inputs from the catalog
 * snapshot. Mutates the DTOs in place. Used after listing/loading legacy rows
 * (557 imported combos predate the save-time backfill and have null name
 * columns even when catalogSkinId is set).
 */
async function backfillSkinNames(combinations: CombinationDTO[]): Promise<void> {
  const missing = new Set<string>();
  for (const c of combinations) {
    for (const input of c.inputs) {
      if (input.catalogSkinId && (!input.weaponName || !input.skinName)) {
        missing.add(input.catalogSkinId);
      }
    }
  }
  if (missing.size === 0) return;

  const cache = new Map<string, { weaponName: string; skinName: string } | null>();
  await Promise.all(
    [...missing].map(async (id) => {
      const skin = await getCatalogSkinById(id);
      cache.set(id, skin ? { weaponName: skin.weaponName, skinName: skin.skinName } : null);
    }),
  );

  for (const c of combinations) {
    for (const input of c.inputs) {
      if (!input.catalogSkinId) continue;
      const hit = cache.get(input.catalogSkinId);
      if (!hit) continue;
      if (!input.weaponName) input.weaponName = hit.weaponName;
      if (!input.skinName) input.skinName = hit.skinName;
    }
  }
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
