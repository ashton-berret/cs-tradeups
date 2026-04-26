// Calculator service — pure scratchpad EV evaluation against a plan.
//
// Differs from `evaluateBasket` in three ways:
//   1. Inputs are transient — no DB row exists for them.
//   2. The plan's outcomes still need catalog/price enrichment so EV math
//      uses observed prices when available.
//   3. Output exterior projection is intentionally skipped in v1 because
//      we don't have per-input skin information (so we can't compute each
//      input's wear proportion). The collection-weighted EV is still
//      mathematically correct; it just defaults each outcome to its base
//      market hash name and `estimatedMarketValue`.

import type { BasketEVBreakdown } from '$lib/types/services';
import { db } from '$lib/server/db/client';
import { NotFoundError, ValidationError } from '$lib/server/http/errors';
import { resolveCatalogCollectionIdentity } from '$lib/server/catalog/linkage';
import { withCatalogOutcomeFloatRanges } from './evaluation/catalogOutcomes';
import {
  computeBasketEV,
  type BasketSlotContext,
} from './evaluation/expectedValue';
import { averageFloat } from '$lib/server/utils/float';
import { percentChange, roundMoney, sumMoney } from '$lib/server/utils/money';
import type { CalculatorRequest } from '$lib/schemas/calculator';

export interface CalculatorResult {
  totalCost: number;
  averageFloat: number | null;
  totalEV: number;
  expectedProfit: number;
  expectedProfitPct: number;
  ev: BasketEVBreakdown;
  /** User-facing notes about approximations and skipped projections. */
  warnings: string[];
}

export async function calculate(request: CalculatorRequest): Promise<CalculatorResult> {
  const plan = await db.tradeupPlan.findUnique({
    where: { id: request.planId },
    include: { outcomeItems: true, rules: true },
  });

  if (!plan) {
    throw new NotFoundError(`Plan not found: ${request.planId}`);
  }

  if (!plan.isActive) {
    throw new ValidationError('Plan is not active');
  }

  const projectedPlan = await withCatalogOutcomeFloatRanges(plan);

  // Resolve each input's collection to a catalogCollectionId where possible
  // so EV grouping uses stable ids. Falls back to the typed string when no
  // catalog match exists — matches the same fallback the planner uses.
  const slots: BasketSlotContext[] = await Promise.all(
    request.inputs.map(async (input, idx) => {
      const collectionMatch = await resolveCatalogCollectionIdentity(input.collection);
      return {
        inventoryItemId: `calc:${idx}`,
        collection: collectionMatch?.collection ?? input.collection,
        catalogCollectionId: collectionMatch?.catalogCollectionId ?? null,
        exterior: null,
        floatValue: input.floatValue ?? null,
        rarity: plan.inputRarity,
        // Per-input min/max not provided in v1 — output projection is skipped.
        inputMinFloat: null,
        inputMaxFloat: null,
      };
    }),
  );

  const totalCost = roundMoney(sumMoney(request.inputs.map((input) => input.price)));
  const avgFloat = averageFloat(request.inputs.map((input) => input.floatValue ?? null));

  // Pass null for averageWearProportion — without per-input min/max we
  // explicitly skip projection rather than approximate. The EV from
  // collection weighting remains exact.
  const ev = computeBasketEV(slots, projectedPlan, { averageWearProportion: null });

  const expectedProfit = roundMoney(ev.totalEV - totalCost);
  const expectedProfitPct = percentChange(totalCost, ev.totalEV);

  const warnings: string[] = [];
  if (request.inputs.length < 10) {
    warnings.push(
      `Only ${request.inputs.length} inputs provided; CS2 trade-ups require exactly 10. EV is scaled by slot count.`,
    );
  }
  warnings.push(
    'Output exterior projection skipped: requires per-input skin selection so each input\'s float range can be normalized. Coming in a future update.',
  );
  const unmatchedCollections = slots.filter((slot) => !slot.catalogCollectionId).length;
  if (unmatchedCollections > 0) {
    warnings.push(
      `${unmatchedCollections} input${unmatchedCollections === 1 ? '' : 's'} did not match a known catalog collection. EV will only group those by exact collection text.`,
    );
  }

  return {
    totalCost,
    averageFloat: avgFloat,
    totalEV: ev.totalEV,
    expectedProfit,
    expectedProfitPct,
    ev,
    warnings,
  };
}
