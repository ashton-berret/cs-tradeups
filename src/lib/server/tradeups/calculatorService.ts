// Calculator service — sandbox EV evaluation.
//
// Two modes:
//   - Plan mode: outcomes come from the chosen plan. isActive is NOT enforced
//     because the calculator is a place to tweak both plans and inputs.
//   - Ad-hoc mode: outcomes are synthesized from the catalog snapshot —
//     every catalog skin at `targetRarity` in any input's collection. Pricing
//     uses the latest market observation; outcomes without a price contribute
//     0 with a warning.
//
// Per-input catalogSkinId enables correct output exterior projection: each
// input's float is normalized into its own skin range before averaging
// (`enrichSlotsWithInputRanges` + `averageWearProportion`).

import type { Prisma, TradeupPlan } from '@prisma/client';
import type { BasketEVBreakdown } from '$lib/types/services';
import { db } from '$lib/server/db/client';
import { NotFoundError, ValidationError } from '$lib/server/http/errors';
import { resolveCatalogCollectionIdentity } from '$lib/server/catalog/linkage';
import { getCatalogSnapshot } from '$lib/server/catalog/catalogService';
import { withCatalogOutcomeFloatRanges } from './evaluation/catalogOutcomes';
import { enrichSlotsWithInputRanges } from './evaluation/inputFloatRanges';
import { computeBasketEV } from './evaluation/expectedValue';
import { averageFloat, averageWearProportion } from '$lib/server/utils/float';
import { percentChange, roundMoney, sumMoney } from '$lib/server/utils/money';
import { getLatestMarketPricesForMarketHashNames } from '$lib/server/marketPrices/priceService';
import type { CalculatorRequest } from '$lib/schemas/calculator';
import type { CatalogSkin } from '$lib/schemas/catalog';
import type { ItemRarity } from '$lib/types/enums';

export interface CalculatorResult {
  totalCost: number;
  averageFloat: number | null;
  totalEV: number;
  expectedProfit: number;
  expectedProfitPct: number;
  ev: BasketEVBreakdown;
  /** Source of outcomes for the EV math, surfaced in the UI. */
  mode: 'PLAN' | 'AD_HOC';
  warnings: string[];
}

export async function calculate(request: CalculatorRequest): Promise<CalculatorResult> {
  const projectedPlan = request.planId
    ? await loadPlanForCalculator(request.planId)
    : await synthesizeAdHocPlan(request);

  const slotItems = await Promise.all(
    request.inputs.map(async (input, idx) => {
      const collectionMatch = input.catalogCollectionId
        ? null
        : await resolveCatalogCollectionIdentity(input.collection);
      return {
        id: `calc:${idx}`,
        catalogSkinId: input.catalogSkinId ?? null,
        collection: collectionMatch?.collection ?? input.collection,
        catalogCollectionId:
          input.catalogCollectionId ?? collectionMatch?.catalogCollectionId ?? null,
        exterior: null,
        floatValue: input.floatValue ?? null,
        rarity: projectedPlan.inputRarity,
      };
    }),
  );

  const slots = await enrichSlotsWithInputRanges(slotItems);
  const wearProp = averageWearProportion(
    slots.map((slot) => ({
      floatValue: slot.floatValue,
      inputMinFloat: slot.inputMinFloat ?? null,
      inputMaxFloat: slot.inputMaxFloat ?? null,
    })),
  );

  const totalCost = roundMoney(sumMoney(request.inputs.map((input) => input.price)));
  const avgFloat = averageFloat(request.inputs.map((input) => input.floatValue ?? null));
  const ev = computeBasketEV(slots, projectedPlan, { averageWearProportion: wearProp });
  const expectedProfit = roundMoney(ev.totalEV - totalCost);
  const expectedProfitPct = percentChange(totalCost, ev.totalEV);

  const warnings: string[] = [];
  if (request.inputs.length < 10) {
    warnings.push(
      `Only ${request.inputs.length} input${request.inputs.length === 1 ? '' : 's'} provided; CS2 trade-ups require exactly 10. EV is scaled by slot count.`,
    );
  }
  if (wearProp == null) {
    const missingSkin = slots.filter((slot) => slot.inputMinFloat == null).length;
    if (missingSkin > 0) {
      warnings.push(
        `${missingSkin} input${missingSkin === 1 ? '' : 's'} missing a catalog-linked skin or float — output exterior projection skipped. Pick skins from the dropdown to enable projection.`,
      );
    }
  }
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
    mode: request.planId ? 'PLAN' : 'AD_HOC',
    warnings,
  };
}

async function loadPlanForCalculator(planId: string) {
  const plan = await db.tradeupPlan.findUnique({
    where: { id: planId },
    include: { outcomeItems: true, rules: true },
  });
  if (!plan) {
    throw new NotFoundError(`Plan not found: ${planId}`);
  }
  return withCatalogOutcomeFloatRanges(plan);
}

// Ad-hoc plan: synthesize a plan-like object whose outcomes come from the
// catalog snapshot. We respect the user's targetRarity, default the input
// rarity to the rarity one tier below the target if not provided, and pull
// pricing from latest market observations. No DB persistence.
async function synthesizeAdHocPlan(request: CalculatorRequest) {
  const targetRarity = request.targetRarity;
  if (!targetRarity) {
    throw new ValidationError('targetRarity is required when planId is omitted.');
  }
  const inputRarity = request.inputRarity ?? defaultInputRarityFor(targetRarity);

  const snapshot = await getCatalogSnapshot();

  // Resolve each input's catalogCollectionId (if not provided) so we can
  // collect the unique set of collections to derive outcomes from.
  const resolved = await Promise.all(
    request.inputs.map(async (input) => {
      if (input.catalogCollectionId) {
        return input.catalogCollectionId;
      }
      const match = await resolveCatalogCollectionIdentity(input.collection);
      return match?.catalogCollectionId ?? null;
    }),
  );
  const collectionIds = new Set(resolved.filter((id): id is string => Boolean(id)));

  // For each collection, gather catalog skins at the target rarity.
  const matchingSkins: CatalogSkin[] = [];
  for (const skin of snapshot.skins) {
    if (skin.rarity !== targetRarity) continue;
    if (!collectionIds.has(skin.collectionId)) continue;
    matchingSkins.push(skin);
  }

  // Pre-fetch latest prices for both base names and per-exterior names so the
  // EV path can pick the projected exterior price when available.
  const allMarketHashNames = Array.from(
    new Set(
      matchingSkins.flatMap((skin) => [
        skin.baseMarketHashName,
        ...skin.marketHashNames.map((entry) => entry.marketHashName),
      ]),
    ),
  );
  const prices = await getLatestMarketPricesForMarketHashNames(allMarketHashNames);

  const stubPlan: TradeupPlan = {
    id: 'calc:adhoc',
    createdAt: new Date(0),
    updatedAt: new Date(0),
    name: 'Ad-hoc',
    description: null,
    inputRarity,
    targetRarity,
    isActive: false,
    minProfitThreshold: null,
    minProfitPctThreshold: null,
    minLiquidityScore: null,
    minCompositeScore: null,
    notes: null,
  };

  const outcomeItems = matchingSkins.map((skin) => {
    const projectedNames = skin.marketHashNames.map((entry) => entry.marketHashName);
    const latestMarketPrices = [skin.baseMarketHashName, ...projectedNames]
      .map((name) => prices.get(name) ?? null)
      .filter((price): price is NonNullable<typeof price> => price != null)
      .map((price) => ({
        marketHashName: price.marketHashName,
        marketValue: price.marketValue,
        source: price.source,
        observedAt: price.observedAt,
        freshness: price.freshness as string,
      }));

    return {
      id: `calc:outcome:${skin.id}`,
      planId: stubPlan.id,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      marketHashName: skin.baseMarketHashName,
      weaponName: skin.weaponName,
      skinName: skin.skinName,
      collection: skin.collectionName,
      catalogSkinId: skin.id,
      catalogCollectionId: skin.collectionId,
      catalogWeaponDefIndex: skin.defIndex,
      catalogPaintIndex: skin.paintIndex,
      rarity: targetRarity,
      estimatedMarketValue: 0 as unknown as Prisma.Decimal,
      probabilityWeight: 1.0,
      minFloat: skin.minFloat,
      maxFloat: skin.maxFloat,
      marketHashNames: skin.marketHashNames,
      latestMarketPrices,
    };
  });

  return { ...stubPlan, outcomeItems };
}

const RARITY_ORDER: ItemRarity[] = [
  'CONSUMER_GRADE',
  'INDUSTRIAL_GRADE',
  'MIL_SPEC',
  'RESTRICTED',
  'CLASSIFIED',
  'COVERT',
];

function defaultInputRarityFor(targetRarity: ItemRarity): ItemRarity {
  const idx = RARITY_ORDER.indexOf(targetRarity);
  if (idx <= 0) return targetRarity;
  return RARITY_ORDER[idx - 1];
}
