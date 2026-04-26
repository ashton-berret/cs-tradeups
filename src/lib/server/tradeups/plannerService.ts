// Planner service — global partition optimizer that produces the buy queue.
//
// Pipeline:
//   1. Load: active plans (with rules + outcomes), open candidates,
//      held/reserved inventory, BUILDING baskets with their items.
//   2. Enrich plans with catalog float ranges + latest market prices via
//      withCatalogOutcomeFloatRanges so EV computations use observed prices
//      and projected exteriors when available.
//   3. Build the pool — uniform PoolItem[] across candidates and inventory.
//   4. Compute eligibility — for each item, which plans accept it.
//   5. Cross-plan exclusivity — assign each multi-plan-eligible item to its
//      highest-EV plan deterministically. Items pinned to existing baskets
//      stay where they are.
//   6. Per plan, partition → fill existing baskets, form new pure-collection
//      baskets, then mixed baskets, then run local-search swap optimization.
//   7. Build CandidateAssignment[] with reasons + alternatives.
//
// Caveats / deferred:
//   - Cross-plan rebalancing (moving items across plans after partition) is
//     not implemented; the highest-EV-plan greedy is good enough until the
//     operator reports specific bad assignments.
//   - Alternatives are computed locally (next-best plan, next-best basket
//     within the plan); they are illustrative, not exhaustive.
//   - All output is transient. The buy queue endpoint recomputes on demand.

import type {
  AssignmentAlternative,
  AssignmentRole,
  BuyQueueResult,
  CandidateAssignment,
  ProposedBasketSummary,
} from '$lib/types/services';
import type { CandidateDecisionStatus } from '$lib/types/enums';
import { db } from '$lib/server/db/client';
import { withCatalogOutcomeFloatRanges } from './evaluation/catalogOutcomes';
import { computeBasketEV } from './evaluation/expectedValue';
import { averageFloat as avgFloat } from '$lib/server/utils/float';
import { percentChange, roundMoney, sumMoney } from '$lib/server/utils/money';
import { buildPool, computeEligibility } from './planner/eligibility';
import { basketEV, basketSlots, partitionPlan } from './planner/partition';
import type { EligiblePoolItem, PlannerBasket, PlanWithRulesAndOutcomes, PoolItem } from './planner/types';

export interface BuildBuyQueueOptions {
  /** Restrict the queue to a single plan. Other plans are still loaded so cross-plan exclusivity is honored. */
  planId?: string;
}

export async function buildBuyQueue(opts: BuildBuyQueueOptions = {}): Promise<BuyQueueResult> {
  const [plansRaw, candidates, inventoryRows, basketRows] = await Promise.all([
    db.tradeupPlan.findMany({
      where: { isActive: true },
      include: { rules: true, outcomeItems: true },
    }),
    db.candidateListing.findMany({
      where: { status: { in: ['WATCHING', 'GOOD_BUY'] } },
    }),
    db.inventoryItem.findMany({
      where: { status: { in: ['HELD', 'RESERVED_FOR_BASKET'] } },
    }),
    db.tradeupBasket.findMany({
      where: { status: 'BUILDING' },
      include: {
        items: { include: { inventoryItem: true }, orderBy: { slotIndex: 'asc' } },
      },
    }),
  ]);

  if (plansRaw.length === 0) {
    return emptyResult();
  }

  // Enrich every plan once so EV is consistent across all evaluations below.
  const plans: PlanWithRulesAndOutcomes[] = await Promise.all(
    plansRaw.map(async (plan) => {
      const enriched = await withCatalogOutcomeFloatRanges(plan);
      return {
        ...plan,
        outcomeItems: enriched.outcomeItems,
      } as PlanWithRulesAndOutcomes;
    }),
  );

  // Map inventory item id → existing basket id (for items already in baskets).
  const inventoryBasketMap = new Map<string, string>();
  for (const basket of basketRows) {
    for (const item of basket.items) {
      inventoryBasketMap.set(item.inventoryItemId, basket.id);
    }
  }

  const pool = await buildPool({
    candidates,
    inventory: inventoryRows,
    inventoryBasketMap,
  });
  const eligible = computeEligibility(pool, plans);

  // Allocate each item to a single plan. Items pinned to baskets follow the
  // basket's plan; everyone else goes to their highest-EV eligible plan.
  const planAssignment = assignItemsToPlans(eligible, plans, basketRows);

  // Per plan, partition into baskets.
  const partitions = new Map<string, ReturnType<typeof partitionPlan>>();
  for (const plan of plans) {
    const itemsForPlan = planAssignment.byPlan.get(plan.id) ?? [];
    const existingBaskets = basketRows
      .filter((b) => b.planId === plan.id)
      .map((b) => ({
        basketId: b.id,
        items: b.items
          .map((bi) => pool.find((p) => p.poolItemId === `inventory:${bi.inventoryItemId}`))
          .filter((p): p is PoolItem => p != null),
      }));
    // Only items not already pinned to an existing basket are "free" for partition.
    const freeItems = itemsForPlan.filter((item) => item.pinnedBasketId == null);
    partitions.set(plan.id, partitionPlan({ plan, freeItems, existingBaskets }));
  }

  // Build CandidateAssignment[] from partitions.
  const assignments: CandidateAssignment[] = [];
  const basketSummaries: ProposedBasketSummary[] = [];
  let totalProfit = 0;
  let viableCount = 0;

  for (const plan of plans) {
    if (opts.planId && plan.id !== opts.planId) continue;
    const partition = partitions.get(plan.id);
    if (!partition) continue;

    for (const basket of partition.baskets) {
      const summary = summarizeBasket(basket, plan);
      basketSummaries.push(summary);
      if (summary.expectedProfit != null) totalProfit += summary.expectedProfit;
      if (summary.isFull) viableCount += 1;

      const slotItems = [...basket.fixedItems, ...basket.placedItems];
      slotItems.forEach((item, slotIndex) => {
        const isFixed = slotIndex < basket.fixedItems.length;
        const role: AssignmentRole = isFixed
          ? 'PINNED'
          : basket.basketId
            ? 'BASKET_FILL'
            : 'NEW_BASKET';
        assignments.push(
          buildAssignment({
            item,
            plan,
            plans,
            basket,
            slotIndex,
            role,
            summary,
            planAssignment: planAssignment.itemPlans,
          }),
        );
      });
    }

    for (const reservedItem of partition.reserved) {
      assignments.push(
        buildReserveAssignment({ item: reservedItem, plan, plans, planAssignment: planAssignment.itemPlans }),
      );
    }
  }

  // Items the optimizer didn't assign to any plan (no eligibility, or filtered out).
  const assignedIds = new Set(assignments.map((a) => a.poolItemId));
  const unassigned = eligible
    .filter((item) => !assignedIds.has(item.poolItemId))
    .map((item) => ({
      poolItemId: item.poolItemId,
      poolItemKind: item.kind,
      sourceId: item.sourceId,
      reason:
        item.eligibility.length === 0
          ? 'No active plan accepts this item.'
          : 'Eligible but no basket formed under any plan.',
    }));

  // Sort assignments: plan name → basket group → slot.
  assignments.sort((a, b) => {
    if (a.planName !== b.planName) return a.planName.localeCompare(b.planName);
    if (a.basketGroupId !== b.basketGroupId) return a.basketGroupId.localeCompare(b.basketGroupId);
    return a.basketSlotIndex - b.basketSlotIndex;
  });
  basketSummaries.sort((a, b) => {
    if (a.planName !== b.planName) return a.planName.localeCompare(b.planName);
    return a.basketGroupId.localeCompare(b.basketGroupId);
  });

  return {
    assignments,
    baskets: basketSummaries,
    unassigned,
    totalExpectedProfit: roundMoney(totalProfit),
    viableBasketCount: viableCount,
  };
}

// --------------------------------------------------------------------------
// Cross-plan allocation
// --------------------------------------------------------------------------

interface PlanAllocation {
  /** Map of planId → items allocated to that plan. */
  byPlan: Map<string, EligiblePoolItem[]>;
  /** For each item, ranked plan ids by collection-EV desc (used for alternatives). */
  itemPlans: Map<string, string[]>;
}

function assignItemsToPlans(
  eligible: EligiblePoolItem[],
  plans: PlanWithRulesAndOutcomes[],
  basketRows: Array<{ id: string; planId: string }>,
): PlanAllocation {
  const planById = new Map(plans.map((p) => [p.id, p]));
  const basketPlan = new Map(basketRows.map((b) => [b.id, b.planId]));
  const byPlan = new Map<string, EligiblePoolItem[]>();
  const itemPlans = new Map<string, string[]>();

  for (const plan of plans) byPlan.set(plan.id, []);

  for (const item of eligible) {
    if (item.eligibility.length === 0) {
      itemPlans.set(item.poolItemId, []);
      continue;
    }

    // Pinned items follow their basket's plan unconditionally.
    if (item.pinnedBasketId) {
      const pinnedPlanId = basketPlan.get(item.pinnedBasketId);
      if (pinnedPlanId && byPlan.has(pinnedPlanId)) {
        byPlan.get(pinnedPlanId)!.push(item);
        itemPlans.set(item.poolItemId, [pinnedPlanId]);
        continue;
      }
    }

    // Rank eligible plans by single-collection EV (the upper bound the item
    // can contribute). Tiebreak deterministically on planId.
    const ranked = item.eligibility
      .map((e) => {
        const plan = planById.get(e.planId);
        if (!plan) return null;
        return { planId: e.planId, ev: itemCollectionEV(item, plan) };
      })
      .filter((entry): entry is { planId: string; ev: number } => entry != null)
      .sort((a, b) => {
        if (b.ev !== a.ev) return b.ev - a.ev;
        return a.planId.localeCompare(b.planId);
      });

    itemPlans.set(item.poolItemId, ranked.map((r) => r.planId));

    if (ranked.length > 0) {
      byPlan.get(ranked[0].planId)!.push(item);
    }
  }

  return { byPlan, itemPlans };
}

// EV the item's collection contributes to a basket fully populated with that
// collection. Same as the helper in partition.ts but local to keep the modules
// independent of each other's privates.
function itemCollectionEV(item: PoolItem, plan: PlanWithRulesAndOutcomes): number {
  if (!item.collectionKey) return 0;
  const slots = Array.from({ length: 10 }, (_, idx) => ({
    inventoryItemId: `__phantom__:${idx}`,
    collection: item.collectionKey,
    catalogCollectionId: null,
    exterior: null,
    floatValue: null,
    rarity: item.rarity,
  }));
  return computeBasketEV(slots, plan).totalEV;
}

// --------------------------------------------------------------------------
// Assignment construction
// --------------------------------------------------------------------------

interface BuildAssignmentInput {
  item: PoolItem;
  plan: PlanWithRulesAndOutcomes;
  plans: PlanWithRulesAndOutcomes[];
  basket: PlannerBasket;
  slotIndex: number;
  role: AssignmentRole;
  summary: ProposedBasketSummary;
  planAssignment: Map<string, string[]>;
}

function buildAssignment(input: BuildAssignmentInput): CandidateAssignment {
  const { item, plan, plans, basket, slotIndex, role, summary, planAssignment } = input;

  const baseSlots = basketSlots(basket).filter((_, idx) => idx !== slotIndex);
  const baseEV = computeBasketEV(baseSlots, plan).totalEV;
  const fullEV = basketEV(basket, plan);
  const marginal = roundMoney(fullEV - baseEV);

  const perSlotEV = summary.expectedEV != null ? summary.expectedEV / 10 : null;
  const expectedProfit = perSlotEV != null ? roundMoney(perSlotEV - item.currentPrice) : null;
  const expectedProfitPct = perSlotEV != null ? percentChange(item.currentPrice, perSlotEV) : null;

  const eligibility = (item as EligiblePoolItem).eligibility ?? [];
  const matchedRule = eligibility.find((e) => e.planId === plan.id);
  const maxBuy = matchedRule?.maxBuyPrice ?? null;

  const observedSource = plan.outcomeItems.some(
    (o: any) => Array.isArray(o.latestMarketPrices) && o.latestMarketPrices.length > 0,
  )
    ? 'OBSERVED'
    : 'PLAN_FALLBACK';

  const alternatives = computeAlternatives(item, plan, plans, planAssignment, marginal);

  return {
    poolItemId: item.poolItemId,
    poolItemKind: item.kind,
    sourceId: item.sourceId,
    planId: plan.id,
    planName: plan.name,
    basketId: basket.basketId,
    basketGroupId: basket.basketGroupId,
    basketSlotIndex: slotIndex,
    role,
    recommendation:
      item.kind === 'CANDIDATE' && item.candidateRow
        ? (item.candidateRow.status as CandidateDecisionStatus)
        : null,
    maxBuyPrice: maxBuy,
    currentPrice: item.currentPrice,
    marginalEVContribution: marginal,
    expectedProfit,
    expectedProfitPct,
    floatFit: describeFloatFit(item, plan, basket),
    pricing: { source: observedSource, freshness: null },
    reason: describeReason(role, plan, basket, slotIndex, summary, marginal),
    alternatives,
  };
}

function buildReserveAssignment(input: {
  item: PoolItem;
  plan: PlanWithRulesAndOutcomes;
  plans: PlanWithRulesAndOutcomes[];
  planAssignment: Map<string, string[]>;
}): CandidateAssignment {
  const { item, plan, plans, planAssignment } = input;
  const eligibility = (item as EligiblePoolItem).eligibility ?? [];
  const matchedRule = eligibility.find((e) => e.planId === plan.id);
  const alts: AssignmentAlternative[] = (planAssignment.get(item.poolItemId) ?? [])
    .filter((pid) => pid !== plan.id)
    .slice(0, 3)
    .map((pid) => {
      const altPlan = plans.find((p) => p.id === pid);
      return {
        planId: pid,
        planName: altPlan?.name ?? pid,
        basketId: null,
        marginalEVContribution: altPlan ? roundMoney(itemCollectionEV(item, altPlan) / 10) : null,
        deltaFromPrimary: 0,
        whyNotChosen: 'Lower expected EV than the assigned plan.',
      };
    });

  return {
    poolItemId: item.poolItemId,
    poolItemKind: item.kind,
    sourceId: item.sourceId,
    planId: plan.id,
    planName: plan.name,
    basketId: null,
    basketGroupId: `reserve:${plan.id}`,
    basketSlotIndex: 0,
    role: 'RESERVE',
    recommendation:
      item.kind === 'CANDIDATE' && item.candidateRow
        ? (item.candidateRow.status as CandidateDecisionStatus)
        : null,
    maxBuyPrice: matchedRule?.maxBuyPrice ?? null,
    currentPrice: item.currentPrice,
    marginalEVContribution: null,
    expectedProfit: null,
    expectedProfitPct: null,
    floatFit: { score: 0, explanation: 'Held in reserve; not yet placed in a basket.' },
    pricing: { source: 'PLAN_FALLBACK', freshness: null },
    reason: `Reserve under ${plan.name} — not enough compatible items to form a basket yet.`,
    alternatives: alts,
  };
}

function computeAlternatives(
  item: PoolItem,
  primaryPlan: PlanWithRulesAndOutcomes,
  plans: PlanWithRulesAndOutcomes[],
  planAssignment: Map<string, string[]>,
  primaryMarginal: number,
): AssignmentAlternative[] {
  const ranked = (planAssignment.get(item.poolItemId) ?? []).filter((pid) => pid !== primaryPlan.id);
  const alts: AssignmentAlternative[] = [];

  for (const pid of ranked.slice(0, 3)) {
    const altPlan = plans.find((p) => p.id === pid);
    if (!altPlan) continue;
    // Approximate marginal contribution = single-slot value (1/10 of single-collection EV).
    const altMarginal = roundMoney(itemCollectionEV(item, altPlan) / 10);
    alts.push({
      planId: pid,
      planName: altPlan.name,
      basketId: null,
      marginalEVContribution: altMarginal,
      deltaFromPrimary: roundMoney(Math.max(0, primaryMarginal - altMarginal)),
      whyNotChosen:
        altMarginal < primaryMarginal
          ? `EV $${altMarginal.toFixed(2)} vs $${primaryMarginal.toFixed(2)} in ${primaryPlan.name}.`
          : 'Tied EV; deterministic tiebreaker preferred the primary.',
    });
  }

  return alts;
}

function describeFloatFit(
  item: PoolItem,
  plan: PlanWithRulesAndOutcomes,
  _basket: PlannerBasket,
): { score: number; explanation: string } {
  const eligibility = (item as EligiblePoolItem).eligibility ?? [];
  const matchedRule = eligibility.find((e) => e.planId === plan.id);
  if (item.floatValue == null) {
    return { score: 0.5, explanation: 'No float value recorded.' };
  }
  if (!matchedRule) {
    return { score: 0.5, explanation: `Float ${item.floatValue.toFixed(4)} (no rule float bounds).` };
  }
  return {
    score: matchedRule.fitScore,
    explanation: `Float ${item.floatValue.toFixed(4)} accepted by plan rule (fit ${matchedRule.fitScore.toFixed(2)}).`,
  };
}

function describeReason(
  role: AssignmentRole,
  plan: PlanWithRulesAndOutcomes,
  basket: PlannerBasket,
  slotIndex: number,
  summary: ProposedBasketSummary,
  marginal: number,
): string {
  const slotLabel = `slot ${slotIndex + 1}/10`;
  const evLabel = summary.expectedEV != null ? `basket EV $${summary.expectedEV.toFixed(2)}` : 'basket EV pending';
  const marginalLabel = `+$${marginal.toFixed(2)} marginal`;
  switch (role) {
    case 'PINNED':
      return `Pinned in ${plan.name} basket (${slotLabel}, ${evLabel}).`;
    case 'BASKET_FILL':
      return `Fills ${slotLabel} of existing ${plan.name} basket — ${marginalLabel}, ${evLabel}.`;
    case 'NEW_BASKET':
      return `${slotLabel} of proposed ${plan.name} basket ${basket.basketGroupId} — ${marginalLabel}, ${evLabel}.`;
    case 'RESERVE':
      return `Reserve under ${plan.name}.`;
  }
}

// --------------------------------------------------------------------------
// Basket summary
// --------------------------------------------------------------------------

function summarizeBasket(basket: PlannerBasket, plan: PlanWithRulesAndOutcomes): ProposedBasketSummary {
  const items = [...basket.fixedItems, ...basket.placedItems];
  const itemCount = items.length;
  const isFull = itemCount === 10;
  const totalCost = roundMoney(sumMoney(items.map((it) => it.currentPrice)));
  const expectedEV = isFull ? basketEV(basket, plan) : null;
  const expectedProfit = expectedEV != null ? roundMoney(expectedEV - totalCost) : null;
  const expectedProfitPct = expectedEV != null ? percentChange(totalCost, expectedEV) : null;
  const averageFloat = avgFloat(items.map((it) => it.floatValue));

  return {
    basketGroupId: basket.basketGroupId,
    basketId: basket.basketId,
    planId: plan.id,
    planName: plan.name,
    itemCount,
    isFull,
    totalCost,
    expectedEV,
    expectedProfit,
    expectedProfitPct,
    averageFloat,
  };
}

function emptyResult(): BuyQueueResult {
  return {
    assignments: [],
    baskets: [],
    unassigned: [],
    totalExpectedProfit: 0,
    viableBasketCount: 0,
  };
}
