import { db } from '$lib/server/db/client';
import { reevaluateOpenCandidates } from '$lib/server/candidates/candidateService';
import { recomputeMetrics } from '$lib/server/tradeups/basketService';

export interface MarketPriceImportRefreshResult {
  candidatesReevaluated: number;
  basketsRecomputed: number;
  basketErrors: Array<{ id: string; message: string }>;
}

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
