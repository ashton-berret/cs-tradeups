import type { TradeupOutcomeItem, TradeupPlan } from '@prisma/client';
import { getCatalogSkinFloatRange } from '$lib/server/catalog/linkage';
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
      }
    >;
  }
> {
  const outcomeItems = await Promise.all(
    plan.outcomeItems.map(async (outcome) => {
      const range = await getCatalogSkinFloatRange(outcome.catalogSkinId);

      return {
        ...outcome,
        minFloat: range?.minFloat ?? null,
        maxFloat: range?.maxFloat ?? null,
        marketHashNames: range?.marketHashNames ?? [],
      };
    }),
  );

  return {
    ...plan,
    outcomeItems,
  };
}
