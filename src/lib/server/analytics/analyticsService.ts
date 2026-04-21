// Analytics service.
//
// Dashboard KPIs, plan-performance rollups, and expected-vs-realized series.
// All figures are plain `number` at the boundary. Analytics is read-only;
// it never mutates state.
//
// Phase 2 scope: the shapes defined in `$lib/types/services` plus the
// DashboardSummary already in `$lib/types/domain`. More detail (bucketing,
// cohort analysis, outcome-distribution fitting) is deferred to Phase 6.

import type { DashboardSummary } from '$lib/types/domain';
import type {
  ActivityEntry,
  EvRealizedPoint,
  PlanPerformanceRow,
} from '$lib/types/services';
import { db } from '$lib/server/db/client';
import { toNumber } from '$lib/server/utils/decimal';
import { roundMoney, sumMoney } from '$lib/server/utils/money';

/**
 * Snapshot numbers for the /dashboard page. Counts are live (not cached).
 *
 * Semantics:
 *   candidateCount       — total candidates not in INVALID/DUPLICATE
 *   goodBuyCount         — status = GOOD_BUY, still open
 *   boughtCount          — status = BOUGHT
 *   inventoryCount       — status in {HELD, RESERVED_FOR_BASKET}
 *   inventoryCostBasis   — sum of purchasePrice for the above
 *   activeBasketsCount   — status in {BUILDING, READY}
 *   readyBasketsCount    — status = READY
 *   executionCount       — lifetime executions
 *   totalRealizedProfit  — sum of realizedProfit over executions with sale
 *   avgExpectedProfit    — average of expectedProfit at execution time
 */
export function getDashboardSummary(): Promise<DashboardSummary> {
  return getDashboardSummaryImpl();
}

/**
 * Per-plan performance. If `planId` is given, returns a single row; else
 * returns one row per plan that has at least one execution.
 */
export function getPlanPerformance(
  planId?: string,
): Promise<PlanPerformanceRow[]> {
  return getPlanPerformanceImpl(planId);
}

/**
 * Recent workflow events for the dashboard activity feed. Union over
 * candidate ingestions, buys, basket readiness, and executions. No audit
 * table exists yet (see PLAN.md); this reads from the live rows using
 * createdAt/updatedAt timestamps as the activity signal.
 */
export function getRecentActivity(limit?: number): Promise<ActivityEntry[]> {
  return getRecentActivityImpl(limit);
}

/**
 * Expected-vs-realized series for the dashboard chart. One point per
 * execution with a recorded sale; points without a sale are excluded so
 * comparisons stay apples-to-apples.
 */
export function getExpectedVsRealized(range?: {
  from?: Date;
  to?: Date;
  planId?: string;
}): Promise<EvRealizedPoint[]> {
  return getExpectedVsRealizedImpl(range);
}

async function getDashboardSummaryImpl(): Promise<DashboardSummary> {
  const [
    candidateCount,
    goodBuyCount,
    boughtCount,
    activeInventory,
    activeBasketsCount,
    readyBasketsCount,
    executions,
  ] = await Promise.all([
    db.candidateListing.count({ where: { status: { notIn: ['INVALID', 'DUPLICATE'] } } }),
    db.candidateListing.count({ where: { status: 'GOOD_BUY' } }),
    db.candidateListing.count({ where: { status: 'BOUGHT' } }),
    db.inventoryItem.findMany({
      where: { status: { in: ['HELD', 'RESERVED_FOR_BASKET'] } },
      select: { purchasePrice: true },
    }),
    db.tradeupBasket.count({ where: { status: { in: ['BUILDING', 'READY'] } } }),
    db.tradeupBasket.count({ where: { status: 'READY' } }),
    db.tradeupExecution.findMany({
      select: { inputCost: true, expectedEV: true, realizedProfit: true },
    }),
  ]);
  const expectedProfits = executions
    .map((execution) => {
      const expectedEV = toNumber(execution.expectedEV);
      return expectedEV == null ? null : roundMoney(expectedEV - (toNumber(execution.inputCost) ?? 0));
    })
    .filter((value): value is number => value != null);

  return {
    candidateCount,
    goodBuyCount,
    boughtCount,
    inventoryCount: activeInventory.length,
    inventoryCostBasis: sumMoney(activeInventory.map((item) => toNumber(item.purchasePrice))),
    activeBasketsCount,
    readyBasketsCount,
    executionCount: executions.length,
    totalRealizedProfit: sumMoney(executions.map((execution) => toNumber(execution.realizedProfit))),
    avgExpectedProfit:
      expectedProfits.length === 0 ? 0 : roundMoney(sumMoney(expectedProfits) / expectedProfits.length),
  };
}

async function getPlanPerformanceImpl(planId?: string): Promise<PlanPerformanceRow[]> {
  const plans = await db.tradeupPlan.findMany({
    where: {
      ...(planId ? { id: planId } : {}),
      executions: { some: {} },
    },
    include: { executions: true },
    orderBy: { name: 'asc' },
  });

  return plans.map((plan) => {
    const expectedProfits = plan.executions
      .map((execution) => {
        const expectedEV = toNumber(execution.expectedEV);
        return expectedEV == null ? null : roundMoney(expectedEV - (toNumber(execution.inputCost) ?? 0));
      })
      .filter((value): value is number => value != null);
    const realizedProfits = plan.executions
      .map((execution) => toNumber(execution.realizedProfit))
      .filter((value): value is number => value != null);
    const deltas = plan.executions
      .map((execution) => {
        const expectedEV = toNumber(execution.expectedEV);
        const realizedProfit = toNumber(execution.realizedProfit);
        if (expectedEV == null || realizedProfit == null) {
          return null;
        }

        return roundMoney(expectedEV - (toNumber(execution.inputCost) ?? 0) - realizedProfit);
      })
      .filter((value): value is number => value != null);
    const totalRealized = sumMoney(
      plan.executions.map((execution) => {
        const salePrice = toNumber(execution.salePrice);
        if (salePrice == null) {
          return null;
        }

        return salePrice - (toNumber(execution.saleFees) ?? 0);
      }),
    );

    return {
      planId: plan.id,
      planName: plan.name,
      executions: plan.executions.length,
      totalInputCost: sumMoney(plan.executions.map((execution) => toNumber(execution.inputCost))),
      totalRealized,
      totalRealizedProfit: sumMoney(realizedProfits),
      avgExpectedProfit: averageOrNull(expectedProfits),
      avgRealizedProfit: averageOrNull(realizedProfits),
      evRealizedDelta: averageOrNull(deltas),
    };
  });
}

async function getRecentActivityImpl(limit = 20): Promise<ActivityEntry[]> {
  const cappedLimit = Math.max(1, Math.min(limit, 100));
  const [candidates, readyBaskets, executions, sales] = await Promise.all([
    db.candidateListing.findMany({
      orderBy: { createdAt: 'desc' },
      take: cappedLimit,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        marketHashName: true,
        status: true,
      },
    }),
    db.tradeupBasket.findMany({
      where: { status: 'READY' },
      orderBy: { updatedAt: 'desc' },
      take: cappedLimit,
      select: { id: true, updatedAt: true, name: true },
    }),
    db.tradeupExecution.findMany({
      orderBy: { createdAt: 'desc' },
      take: cappedLimit,
      select: { id: true, createdAt: true, resultMarketHashName: true },
    }),
    db.tradeupExecution.findMany({
      where: { saleDate: { not: null } },
      orderBy: { updatedAt: 'desc' },
      take: cappedLimit,
      select: { id: true, updatedAt: true, resultMarketHashName: true },
    }),
  ]);
  const activity: ActivityEntry[] = [];

  for (const candidate of candidates) {
    activity.push({
      at: candidate.createdAt,
      kind: 'CANDIDATE_INGESTED',
      refId: candidate.id,
      label: candidate.marketHashName,
    });

    if (candidate.status === 'BOUGHT') {
      activity.push({
        at: candidate.updatedAt,
        kind: 'CANDIDATE_BOUGHT',
        refId: candidate.id,
        label: candidate.marketHashName,
      });
    }

    if (candidate.status === 'PASSED') {
      activity.push({
        at: candidate.updatedAt,
        kind: 'CANDIDATE_PASSED',
        refId: candidate.id,
        label: candidate.marketHashName,
      });
    }
  }

  for (const basket of readyBaskets) {
    activity.push({
      at: basket.updatedAt,
      kind: 'BASKET_READY',
      refId: basket.id,
      label: basket.name ?? 'Ready basket',
    });
  }

  for (const execution of executions) {
    activity.push({
      at: execution.createdAt,
      kind: 'EXECUTION_RECORDED',
      refId: execution.id,
      label: execution.resultMarketHashName ?? 'Trade-up execution',
    });
  }

  for (const sale of sales) {
    activity.push({
      at: sale.updatedAt,
      kind: 'SALE_RECORDED',
      refId: sale.id,
      label: sale.resultMarketHashName ?? 'Trade-up sale',
    });
  }

  return activity.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, cappedLimit);
}

async function getExpectedVsRealizedImpl(range?: {
  from?: Date;
  to?: Date;
  planId?: string;
}): Promise<EvRealizedPoint[]> {
  const executions = await db.tradeupExecution.findMany({
    where: {
      saleDate: { not: null },
      ...(range?.planId ? { planId: range.planId } : {}),
      ...(range?.from || range?.to
        ? { executedAt: { gte: range.from, lte: range.to } }
        : {}),
    },
    include: { plan: true },
    orderBy: { executedAt: 'asc' },
  });

  return executions.map((execution) => {
    const expectedEV = toNumber(execution.expectedEV);
    const inputCost = toNumber(execution.inputCost) ?? 0;

    return {
      executedAt: execution.executedAt,
      planId: execution.planId,
      planName: execution.plan.name,
      expectedProfit: expectedEV == null ? null : roundMoney(expectedEV - inputCost),
      realizedProfit: toNumber(execution.realizedProfit),
    };
  });
}

function averageOrNull(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return roundMoney(sumMoney(values) / values.length);
}
