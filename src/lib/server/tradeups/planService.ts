// Trade-up plan service.
//
// A plan bundles:
//   - metadata (name, rarities, thresholds)
//   - rules: input constraints (collection, rarity, float bands, max price)
//   - outcomeItems: possible outputs with estimated market values
//
// The rarity-tier invariant (target = input + 1) is enforced by Zod at the
// route boundary; this service only enforces what Zod can't express, namely
// referential integrity and the eager re-eval fan-out.
//
// Re-evaluation policy: any mutation that affects how candidates would score
// (adding/removing a rule, changing thresholds, changing outcome values,
// toggling `isActive`) triggers `candidateService.reevaluateOpenCandidates`
// restricted to candidates whose matchedPlanId equals this plan OR whose
// collection/rarity matches any rule on this plan. See `reevaluateAllForPlan`.

import type {
  CreatePlanInput,
  OutcomeItemInput,
  PlanFilter,
  PlanRuleInput,
  UpdatePlanInput,
  PaginatedResponse,
} from '$lib/types/domain';
import type { PlanDTO, PlanRuleDTO, OutcomeItemDTO } from '$lib/types/services';
import type { Prisma, TradeupOutcomeItem, TradeupPlan, TradeupPlanRule } from '@prisma/client';
import type { ItemExterior, ItemRarity } from '$lib/types/enums';
import { db } from '$lib/server/db/client';
import { toDecimal, toDecimalOrNull, toNumber } from '$lib/server/utils/decimal';
import { reevaluateCandidate } from '$lib/server/candidates/candidateService';

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function listPlans(filter: PlanFilter): Promise<PaginatedResponse<PlanDTO>> {
  return listPlansImpl(filter);
}

/** Fetch a plan including rules and outcomes. Null if not found. */
export function getPlan(id: string): Promise<PlanDTO | null> {
  return db.tradeupPlan
    .findUnique({ where: { id }, include: planInclude })
    .then((row) => (row ? toPlanDTO(row) : null));
}

/** All plans that accept `rarity` as input rarity. Cached where it matters. */
export function listActivePlansForRarity(rarity: string): Promise<PlanDTO[]> {
  return db.tradeupPlan
    .findMany({
      where: { isActive: true, inputRarity: rarity },
      include: planInclude,
      orderBy: { name: 'asc' },
    })
    .then((rows) => rows.map(toPlanDTO));
}

// ---------------------------------------------------------------------------
// Plan CRUD
// ---------------------------------------------------------------------------

/** Create a plan with its nested rules and outcomes in one transaction. */
export function createPlan(input: CreatePlanInput): Promise<PlanDTO> {
  return createPlanImpl(input);
}

/**
 * Patch plan metadata. Fans out a re-evaluation to matched candidates when
 * any scoring-relevant field changes (thresholds, isActive).
 */
export function updatePlan(
  id: string,
  input: UpdatePlanInput,
): Promise<PlanDTO> {
  return updatePlanImpl(id, input);
}

/**
 * Delete a plan. Blocked if any basket or execution references it (we keep
 * historical records intact). Use `updatePlan({ isActive: false })` to
 * retire a plan without deleting it.
 */
export function deletePlan(id: string): Promise<void> {
  return deletePlanImpl(id);
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export function addPlanRule(
  planId: string,
  rule: PlanRuleInput,
): Promise<PlanRuleDTO> {
  return addPlanRuleImpl(planId, rule);
}

export function updatePlanRule(
  ruleId: string,
  rule: PlanRuleInput,
): Promise<PlanRuleDTO> {
  return updatePlanRuleImpl(ruleId, rule);
}

export function removePlanRule(ruleId: string): Promise<void> {
  return removePlanRuleImpl(ruleId);
}

// ---------------------------------------------------------------------------
// Outcomes
// ---------------------------------------------------------------------------

/**
 * Outcomes must share the plan's targetRarity (Zod enforces tier, but not
 * equality against the plan). The service validates this and throws.
 */
export function addOutcomeItem(
  planId: string,
  outcome: OutcomeItemInput,
): Promise<OutcomeItemDTO> {
  return addOutcomeItemImpl(planId, outcome);
}

export function updateOutcomeItem(
  outcomeId: string,
  outcome: OutcomeItemInput,
): Promise<OutcomeItemDTO> {
  return updateOutcomeItemImpl(outcomeId, outcome);
}

export function removeOutcomeItem(outcomeId: string): Promise<void> {
  return removeOutcomeItemImpl(outcomeId);
}

// ---------------------------------------------------------------------------
// Re-eval fan-out
// ---------------------------------------------------------------------------

/**
 * Re-score every candidate affected by `planId`.
 *
 * Targets:
 *   - candidates currently matched to this plan
 *   - open candidates (WATCHING/GOOD_BUY) whose collection + rarity match
 *     any rule on this plan (they may now match where they previously did
 *     not, or vice versa)
 *
 * Returns the number of rows re-evaluated. Used by:
 *   - updatePlan / addPlanRule / removePlanRule / updateOutcomeItem
 *   - the manual "re-score for plan" action in the UI
 */
export function reevaluateAllForPlan(planId: string): Promise<{ count: number }> {
  return reevaluateAllForPlanImpl(planId);
}

const planInclude = {
  rules: { orderBy: [{ priority: 'desc' as const }, { createdAt: 'asc' as const }] },
  outcomeItems: { orderBy: { marketHashName: 'asc' as const } },
};

type PlanWithRelations = TradeupPlan & {
  rules: TradeupPlanRule[];
  outcomeItems: TradeupOutcomeItem[];
};

async function listPlansImpl(filter: PlanFilter): Promise<PaginatedResponse<PlanDTO>> {
  const where: Prisma.TradeupPlanWhereInput = {
    ...(filter.isActive != null ? { isActive: filter.isActive } : {}),
    ...(filter.inputRarity ? { inputRarity: filter.inputRarity } : {}),
    ...(filter.targetRarity ? { targetRarity: filter.targetRarity } : {}),
    ...(filter.search
      ? {
          OR: [
            { name: { contains: filter.search } },
            { description: { contains: filter.search } },
            { notes: { contains: filter.search } },
          ],
        }
      : {}),
  };
  const skip = (filter.page - 1) * filter.limit;
  const orderBy: Prisma.TradeupPlanOrderByWithRelationInput = { [filter.sortBy]: filter.sortDir };
  const [rows, total] = await Promise.all([
    db.tradeupPlan.findMany({ where, include: planInclude, orderBy, skip, take: filter.limit }),
    db.tradeupPlan.count({ where }),
  ]);

  return {
    data: rows.map(toPlanDTO),
    total,
    page: filter.page,
    limit: filter.limit,
    totalPages: Math.ceil(total / filter.limit),
  };
}

async function createPlanImpl(input: CreatePlanInput): Promise<PlanDTO> {
  for (const outcome of input.outcomeItems) {
    validateOutcomeRarity(input.targetRarity, outcome);
  }

  const row = await db.$transaction((tx) =>
    tx.tradeupPlan.create({
      data: {
        name: input.name,
        description: input.description,
        inputRarity: input.inputRarity,
        targetRarity: input.targetRarity,
        isActive: input.isActive,
        minProfitThreshold: toDecimalOrNull(input.minProfitThreshold),
        minProfitPctThreshold: input.minProfitPctThreshold,
        minLiquidityScore: input.minLiquidityScore,
        minCompositeScore: input.minCompositeScore,
        notes: input.notes,
        rules: { create: input.rules.map(planRuleCreateData) },
        outcomeItems: { create: input.outcomeItems.map(outcomeCreateData) },
      },
      include: planInclude,
    }),
  );

  if (row.isActive) {
    await reevaluateAllForPlan(row.id);
  }

  return toPlanDTO(row);
}

async function updatePlanImpl(id: string, input: UpdatePlanInput): Promise<PlanDTO> {
  const scoringRelevant =
    input.isActive != null ||
    input.minProfitThreshold != null ||
    input.minProfitPctThreshold != null ||
    input.minLiquidityScore != null ||
    input.minCompositeScore != null;
  const row = await db.tradeupPlan.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description,
      isActive: input.isActive,
      minProfitThreshold: input.minProfitThreshold !== undefined ? toDecimalOrNull(input.minProfitThreshold) : undefined,
      minProfitPctThreshold: input.minProfitPctThreshold,
      minLiquidityScore: input.minLiquidityScore,
      minCompositeScore: input.minCompositeScore,
      notes: input.notes,
    },
    include: planInclude,
  });

  if (scoringRelevant) {
    await reevaluateAllForPlan(id);
  }

  return toPlanDTO(row);
}

async function deletePlanImpl(id: string): Promise<void> {
  const [basketCount, executionCount] = await Promise.all([
    db.tradeupBasket.count({ where: { planId: id } }),
    db.tradeupExecution.count({ where: { planId: id } }),
  ]);

  if (basketCount > 0 || executionCount > 0) {
    throw new Error('Cannot delete a plan that has baskets or executions');
  }

  await db.tradeupPlan.delete({ where: { id } });
}

async function addPlanRuleImpl(planId: string, rule: PlanRuleInput): Promise<PlanRuleDTO> {
  const created = await db.tradeupPlanRule.create({
    data: { planId, ...planRuleCreateData(rule) },
  });

  await reevaluateAllForPlan(planId);
  return toPlanRuleDTO(created);
}

async function updatePlanRuleImpl(ruleId: string, rule: PlanRuleInput): Promise<PlanRuleDTO> {
  const existing = await db.tradeupPlanRule.findUnique({ where: { id: ruleId } });

  if (!existing) {
    throw new Error(`Plan rule not found: ${ruleId}`);
  }

  const updated = await db.tradeupPlanRule.update({
    where: { id: ruleId },
    data: planRuleCreateData(rule),
  });

  await reevaluateAllForPlan(existing.planId);
  return toPlanRuleDTO(updated);
}

async function removePlanRuleImpl(ruleId: string): Promise<void> {
  const existing = await db.tradeupPlanRule.findUnique({ where: { id: ruleId } });

  if (!existing) {
    throw new Error(`Plan rule not found: ${ruleId}`);
  }

  await db.tradeupPlanRule.delete({ where: { id: ruleId } });
  await reevaluateAllForPlan(existing.planId);
}

async function addOutcomeItemImpl(planId: string, outcome: OutcomeItemInput): Promise<OutcomeItemDTO> {
  const plan = await db.tradeupPlan.findUnique({ where: { id: planId } });

  if (!plan) {
    throw new Error(`Plan not found: ${planId}`);
  }

  validateOutcomeRarity(plan.targetRarity, outcome);

  const created = await db.tradeupOutcomeItem.create({
    data: { planId, ...outcomeCreateData(outcome) },
  });

  await reevaluateAllForPlan(planId);
  return toOutcomeItemDTO(created);
}

async function updateOutcomeItemImpl(outcomeId: string, outcome: OutcomeItemInput): Promise<OutcomeItemDTO> {
  const existing = await db.tradeupOutcomeItem.findUnique({
    where: { id: outcomeId },
    include: { plan: true },
  });

  if (!existing) {
    throw new Error(`Outcome item not found: ${outcomeId}`);
  }

  validateOutcomeRarity(existing.plan.targetRarity, outcome);

  const updated = await db.tradeupOutcomeItem.update({
    where: { id: outcomeId },
    data: outcomeCreateData(outcome),
  });

  await reevaluateAllForPlan(existing.planId);
  return toOutcomeItemDTO(updated);
}

async function removeOutcomeItemImpl(outcomeId: string): Promise<void> {
  const existing = await db.tradeupOutcomeItem.findUnique({ where: { id: outcomeId } });

  if (!existing) {
    throw new Error(`Outcome item not found: ${outcomeId}`);
  }

  await db.tradeupOutcomeItem.delete({ where: { id: outcomeId } });
  await reevaluateAllForPlan(existing.planId);
}

async function reevaluateAllForPlanImpl(planId: string): Promise<{ count: number }> {
  const plan = await db.tradeupPlan.findUnique({ where: { id: planId }, include: { rules: true } });

  if (!plan) {
    throw new Error(`Plan not found: ${planId}`);
  }

  const ruleCollections = Array.from(
    new Set(plan.rules.map((rule) => rule.collection).filter((collection): collection is string => Boolean(collection))),
  );
  const rows = await db.candidateListing.findMany({
    where: {
      OR: [
        { matchedPlanId: planId },
        {
          status: { in: ['WATCHING', 'GOOD_BUY'] },
          rarity: plan.inputRarity,
          ...(ruleCollections.length > 0 ? { collection: { in: ruleCollections } } : {}),
        },
      ],
    },
    select: { id: true },
  });

  for (const row of rows) {
    await reevaluateCandidate(row.id);
  }

  return { count: rows.length };
}

function planRuleCreateData(rule: PlanRuleInput): Omit<Prisma.TradeupPlanRuleUncheckedCreateInput, 'id' | 'planId' | 'createdAt' | 'updatedAt'> {
  return {
    collection: rule.collection,
    rarity: rule.rarity,
    exterior: rule.exterior,
    minFloat: rule.minFloat,
    maxFloat: rule.maxFloat,
    maxBuyPrice: toDecimalOrNull(rule.maxBuyPrice),
    minQuantity: rule.minQuantity,
    maxQuantity: rule.maxQuantity,
    priority: rule.priority,
    isPreferred: rule.isPreferred,
  };
}

function outcomeCreateData(outcome: OutcomeItemInput): Omit<Prisma.TradeupOutcomeItemUncheckedCreateInput, 'id' | 'planId' | 'createdAt' | 'updatedAt'> {
  return {
    marketHashName: outcome.marketHashName,
    weaponName: outcome.weaponName,
    skinName: outcome.skinName,
    collection: outcome.collection,
    rarity: outcome.rarity,
    estimatedMarketValue: toDecimal(outcome.estimatedMarketValue),
    probabilityWeight: outcome.probabilityWeight,
  };
}

function validateOutcomeRarity(targetRarity: string, outcome: OutcomeItemInput): void {
  if (outcome.rarity !== targetRarity) {
    throw new Error('Outcome rarity must match the plan target rarity');
  }
}

function toPlanDTO(row: PlanWithRelations): PlanDTO {
  return {
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    name: row.name,
    description: row.description,
    inputRarity: row.inputRarity as ItemRarity,
    targetRarity: row.targetRarity as ItemRarity,
    isActive: row.isActive,
    minProfitThreshold: toNumber(row.minProfitThreshold),
    minProfitPctThreshold: row.minProfitPctThreshold,
    minLiquidityScore: row.minLiquidityScore,
    minCompositeScore: row.minCompositeScore,
    notes: row.notes,
    rules: row.rules.map(toPlanRuleDTO),
    outcomeItems: row.outcomeItems.map(toOutcomeItemDTO),
  };
}

function toPlanRuleDTO(row: TradeupPlanRule): PlanRuleDTO {
  return {
    id: row.id,
    planId: row.planId,
    collection: row.collection,
    rarity: row.rarity as ItemRarity | null,
    exterior: row.exterior as ItemExterior | null,
    minFloat: row.minFloat,
    maxFloat: row.maxFloat,
    maxBuyPrice: toNumber(row.maxBuyPrice),
    minQuantity: row.minQuantity,
    maxQuantity: row.maxQuantity,
    priority: row.priority,
    isPreferred: row.isPreferred,
  };
}

function toOutcomeItemDTO(row: TradeupOutcomeItem): OutcomeItemDTO {
  return {
    id: row.id,
    planId: row.planId,
    marketHashName: row.marketHashName,
    weaponName: row.weaponName,
    skinName: row.skinName,
    collection: row.collection,
    rarity: row.rarity as ItemRarity,
    estimatedMarketValue: toNumber(row.estimatedMarketValue) ?? 0,
    probabilityWeight: row.probabilityWeight,
  };
}
