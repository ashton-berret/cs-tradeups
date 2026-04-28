import { db } from '$lib/server/db/client';

export interface MarketPriceWatchlist {
  marketHashNames: string[];
  counts: {
    activePlanOutcomes: number;
    combinationSnapshotOutcomes: number;
    openCandidates: number;
    inventoryItems: number;
    executionResults: number;
  };
}

export async function buildMarketPriceWatchlist(): Promise<MarketPriceWatchlist> {
  const [plans, combinations, candidates, inventoryItems, executions] = await Promise.all([
    db.tradeupPlan.findMany({
      where: { isActive: true },
      select: { outcomeItems: { select: { marketHashName: true } } },
    }),
    db.tradeupCombination.findMany({
      where: { isActive: true },
      select: { thesisPlanSnapshot: true },
    }),
    db.candidateListing.findMany({
      where: { status: { in: ['WATCHING', 'GOOD_BUY'] } },
      select: { marketHashName: true },
    }),
    db.inventoryItem.findMany({
      where: { status: { in: ['HELD', 'RESERVED_FOR_BASKET'] } },
      select: { marketHashName: true },
    }),
    db.tradeupExecution.findMany({
      where: { resultMarketHashName: { not: null } },
      orderBy: { executedAt: 'desc' },
      take: 100,
      select: { resultMarketHashName: true },
    }),
  ]);

  const activePlanOutcomes = plans.flatMap((plan) =>
    plan.outcomeItems.map((outcome) => outcome.marketHashName),
  );
  const combinationSnapshotOutcomes = combinations.flatMap((combination) =>
    marketHashNamesFromPlanSnapshot(combination.thesisPlanSnapshot),
  );
  const openCandidates = candidates.map((candidate) => candidate.marketHashName);
  const inventoryNames = inventoryItems.map((item) => item.marketHashName);
  const executionResults = executions
    .map((execution) => execution.resultMarketHashName)
    .filter((name): name is string => Boolean(name));

  return {
    marketHashNames: uniqueMarketHashNames([
      ...activePlanOutcomes,
      ...combinationSnapshotOutcomes,
      ...openCandidates,
      ...inventoryNames,
      ...executionResults,
    ]),
    counts: {
      activePlanOutcomes: activePlanOutcomes.length,
      combinationSnapshotOutcomes: combinationSnapshotOutcomes.length,
      openCandidates: openCandidates.length,
      inventoryItems: inventoryNames.length,
      executionResults: executionResults.length,
    },
  };
}

export function marketHashNamesFromPlanSnapshot(snapshot: unknown): string[] {
  if (!snapshot || typeof snapshot !== 'object') return [];
  const outcomes = (snapshot as { outcomes?: unknown }).outcomes;
  if (!Array.isArray(outcomes)) return [];

  return outcomes
    .map((outcome) =>
      outcome && typeof outcome === 'object'
        ? (outcome as { marketHashName?: unknown }).marketHashName
        : null,
    )
    .filter((name): name is string => typeof name === 'string' && name.trim() !== '');
}

export function uniqueMarketHashNames(names: string[]): string[] {
  return Array.from(new Set(names.map((name) => name.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );
}
