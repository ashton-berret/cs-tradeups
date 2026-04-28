import type { TradeupOutcomeItem, TradeupPlan } from '@prisma/client';
import { getCatalogSkinFloatRange } from '$lib/server/catalog/linkage';
import { getLatestMarketPricesForMarketHashNames } from '$lib/server/marketPrices/priceService';
import type { ItemExterior } from '$lib/types/enums';

type PlanWithOutcomeItems<TOutcome extends TradeupOutcomeItem> = TradeupPlan & {
  outcomeItems: TOutcome[];
};

export async function withCatalogOutcomeFloatRanges<TOutcome extends TradeupOutcomeItem>(
  plan: PlanWithOutcomeItems<TOutcome>,
): Promise<
  TradeupPlan & {
    outcomeItems: Array<
      TOutcome & {
        minFloat: number | null;
        maxFloat: number | null;
        marketHashNames: Array<{ exterior: ItemExterior; marketHashName: string }>;
        latestMarketPrices: Array<{
          marketHashName: string;
          marketValue: number | null;
          source: string;
          observedAt: Date;
          freshness: string;
        }>;
      }
    >;
  }
> {
  const outcomeRanges = await Promise.all(
    plan.outcomeItems.map(async (outcome) => {
      const range = await getCatalogSkinFloatRange(outcome.catalogSkinId);
      return { outcomeId: outcome.id, range };
    }),
  );
  const rangeByOutcomeId = new Map(outcomeRanges.map((entry) => [entry.outcomeId, entry.range]));
  const marketHashNames = Array.from(
    new Set(
      plan.outcomeItems.flatMap((outcome) => [
        outcome.marketHashName,
        ...(rangeByOutcomeId.get(outcome.id)?.marketHashNames.map((entry) => entry.marketHashName) ?? []),
      ]),
    ),
  );
  const prices = await getLatestMarketPricesForMarketHashNames(marketHashNames);
  const outcomeItems = await Promise.all(
    plan.outcomeItems.map(async (outcome) => {
      const range = rangeByOutcomeId.get(outcome.id);
      const projectedNames = range?.marketHashNames.map((entry) => entry.marketHashName) ?? [];
      const latestMarketPrices = [outcome.marketHashName, ...projectedNames]
        .map((marketHashName) => prices.get(marketHashName) ?? null)
        .filter((price): price is NonNullable<typeof price> => price != null)
        .map((price) => ({
          marketHashName: price.marketHashName,
          marketValue: price.marketValue,
          source: price.source,
          observedAt: price.observedAt,
          freshness: price.freshness,
        }));

      return {
        ...outcome,
        minFloat: range?.minFloat ?? null,
        maxFloat: range?.maxFloat ?? null,
        marketHashNames: range?.marketHashNames ?? [],
        latestMarketPrices,
      };
    }),
  );

  return {
    ...plan,
    outcomeItems,
  };
}
