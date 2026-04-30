import { db } from '$lib/server/db/client';
import { reevaluateOpenCandidates } from '$lib/server/candidates/candidateService';
import { recomputeMetrics } from '$lib/server/tradeups/basketService';
import { refreshSteamMarketWatchlist, type MarketPriceRefreshJobResult } from './refreshJob';

export interface MarketPriceImportRefreshResult {
  candidatesReevaluated: number;
  basketsRecomputed: number;
  basketErrors: Array<{ id: string; message: string }>;
}

export interface MarketPriceFullRefreshResult {
  prices: MarketPriceRefreshJobResult;
  dependents: MarketPriceImportRefreshResult;
  sweepId?: string;
}

export type MarketPriceSweepTrigger = 'MANUAL' | 'LOOP' | 'CALC';

export async function refreshAfterMarketPriceImport(): Promise<MarketPriceImportRefreshResult> {
  const candidates = await reevaluateOpenCandidates();
  const baskets = await db.tradeupBasket.findMany({
    where: { status: { in: ['BUILDING', 'READY'] } },
    select: { id: true },
  });
  const basketErrors: MarketPriceImportRefreshResult['basketErrors'] = [];
  let basketsRecomputed = 0;

  for (const basket of baskets) {
    try {
      await recomputeMetrics(basket.id);
      basketsRecomputed += 1;
    } catch (err) {
      basketErrors.push({
        id: basket.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    candidatesReevaluated: candidates.count,
    basketsRecomputed,
    basketErrors,
  };
}

export async function refreshMarketPricesAndDependents(
  options: { trigger?: MarketPriceSweepTrigger; notes?: string } = {},
): Promise<MarketPriceFullRefreshResult> {
  const trigger: MarketPriceSweepTrigger = options.trigger ?? 'MANUAL';
  const sweep = await db.marketPriceSweep.create({
    data: { trigger, notes: options.notes ?? null },
    select: { id: true },
  });

  try {
    const prices = await refreshSteamMarketWatchlist();
    const dependents = await refreshAfterMarketPriceImport();

    const requested = prices.summaries.reduce((sum, s) => sum + s.requested, 0);
    const written = prices.summaries.reduce((sum, s) => sum + s.written, 0);
    const skipped = prices.summaries.reduce((sum, s) => sum + s.skipped, 0);
    const errors = prices.summaries.flatMap((s) =>
      s.errors.map((e) => ({ adapter: s.adapter, ...e })),
    );

    await db.marketPriceSweep.update({
      where: { id: sweep.id },
      data: {
        finishedAt: new Date(),
        watchlistCount: prices.watchlistCount,
        requested,
        written,
        skipped,
        errorCount: errors.length,
        candidatesReevaluated: dependents.candidatesReevaluated,
        basketsRecomputed: dependents.basketsRecomputed,
        errorsJson: errors.length > 0 ? errors : undefined,
      },
    });

    return { prices, dependents, sweepId: sweep.id };
  } catch (err) {
    await db.marketPriceSweep.update({
      where: { id: sweep.id },
      data: {
        finishedAt: new Date(),
        errorCount: 1,
        errorsJson: [{ message: err instanceof Error ? err.message : String(err) }],
      },
    });
    throw err;
  }
}
