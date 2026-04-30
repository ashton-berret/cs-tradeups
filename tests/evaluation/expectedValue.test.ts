import { describe, expect, it } from 'bun:test';
import { computeBasketEV } from '$lib/server/tradeups/evaluation/expectedValue';
import { COLLECTION_A, COLLECTION_B } from '../helpers/fixtures';
import { decimal, outcome, plan, slot } from '../helpers/factories';

describe('expected value', () => {
  it('computes a homogeneous single-collection basket as the weighted average of outcomes', () => {
    const testPlan = plan({}, {
      outcomeItems: [
        outcome({ id: 'a-low', collection: COLLECTION_A, estimatedMarketValue: decimal(20), probabilityWeight: 1 }),
        outcome({ id: 'a-high', collection: COLLECTION_A, estimatedMarketValue: decimal(40), probabilityWeight: 1 }),
      ],
    });
    const slots = Array.from({ length: 10 }, (_, index) => slot({ inventoryItemId: `item-${index}` }));

    expect(computeBasketEV(slots, testPlan).totalEV).toBe(30);
  });

  it('weights mixed baskets by source collection slot count', () => {
    const testPlan = plan({}, {
      outcomeItems: [
        outcome({ id: 'alpha', collection: COLLECTION_A, estimatedMarketValue: decimal(10) }),
        outcome({ id: 'bravo', collection: COLLECTION_B, estimatedMarketValue: decimal(30) }),
      ],
    });
    const slots = [
      ...Array.from({ length: 5 }, (_, index) => slot({ inventoryItemId: `a-${index}`, collection: COLLECTION_A })),
      ...Array.from({ length: 5 }, (_, index) => slot({ inventoryItemId: `b-${index}`, collection: COLLECTION_B })),
    ];

    expect(computeBasketEV(slots, testPlan).totalEV).toBe(20);
  });

  it('prefers catalog collection ids over display collection strings', () => {
    const testPlan = plan({}, {
      outcomeItems: [
        outcome({
          id: 'stable-output',
          collection: 'Renamed Alpha Collection',
          catalogCollectionId: 'collection-alpha',
          estimatedMarketValue: decimal(25),
        }),
      ],
    });
    const slots = Array.from({ length: 10 }, (_, index) =>
      slot({
        inventoryItemId: `item-${index}`,
        collection: COLLECTION_A,
        catalogCollectionId: 'collection-alpha',
      }),
    );

    expect(computeBasketEV(slots, testPlan).totalEV).toBe(25);
  });

  it('projects catalog outcome float and exterior when average relative input float is supplied', () => {
    const testPlan = plan({}, {
      outcomeItems: [
        withProjection(outcome({
          id: 'projected-output',
          estimatedMarketValue: decimal(20),
        })),
      ],
    });
    const slots = Array.from({ length: 10 }, (_, index) =>
      slot({ inventoryItemId: `item-${index}`, floatValue: 0.5 }),
    );

    expect(computeBasketEV(slots, testPlan, { averageWearProportion: 0.5 }).perOutcomeContribution[0]).toMatchObject({
      projectedFloat: 0.4,
      projectedExterior: 'WELL_WORN',
      projectedMarketHashName: 'Output Skin (Well-Worn)',
    });
  });

  it('uses latest market price for projected exterior when one is available', () => {
    const testPlan = plan({}, {
      outcomeItems: [
        withProjection({
          ...outcome({
            id: 'projected-priced-output',
            estimatedMarketValue: decimal(20),
          }),
          latestMarketPrices: [
            {
              marketHashName: 'Output Skin (Well-Worn)',
              marketValue: 35,
              observedAt: new Date('2026-04-24T18:00:00Z'),
              freshness: 'FRESH',
            },
          ],
        }),
      ],
    });
    const slots = Array.from({ length: 10 }, (_, index) =>
      slot({ inventoryItemId: `item-${index}`, floatValue: 0.5 }),
    );
    const ev = computeBasketEV(slots, testPlan, { averageWearProportion: 0.5 });

    expect(ev.totalEV).toBe(35);
    expect(ev.perOutcomeContribution[0]).toMatchObject({
      estimatedValue: 35,
      projectedMarketHashName: 'Output Skin (Well-Worn)',
      priceSource: 'OBSERVED_MARKET',
      priceMarketHashName: 'Output Skin (Well-Worn)',
      priceObservedAt: new Date('2026-04-24T18:00:00Z'),
      priceFreshness: 'FRESH',
      priceBasis: 'MANUAL_ESTIMATE',
    });
  });

  it('uses Steam observed prices as net sale proceeds', () => {
    const testPlan = plan({}, {
      outcomeItems: [
        withLatestPrices(
          outcome({
            id: 'steam-priced-output',
            estimatedMarketValue: decimal(20),
          }),
          [
            {
              marketHashName: 'Output Skin',
              marketValue: 11.5,
              source: 'STEAM_PRICEOVERVIEW',
              observedAt: new Date('2026-04-24T18:00:00Z'),
              freshness: 'FRESH',
            },
          ],
        ),
      ],
    });
    const slots = Array.from({ length: 10 }, (_, index) => slot({ inventoryItemId: `item-${index}` }));
    const ev = computeBasketEV(slots, testPlan);

    expect(ev.totalEV).toBe(10);
    expect(ev.perOutcomeContribution[0]).toMatchObject({
      estimatedValue: 10,
      priceSource: 'OBSERVED_BASE_NAME',
      priceBasis: 'STEAM_NET',
    });
  });

  it('falls back to the plan outcome value when no latest market price exists', () => {
    const testPlan = plan({}, {
      outcomeItems: [
        withProjection(outcome({
          id: 'unpriced-output',
          estimatedMarketValue: decimal(20),
        })),
      ],
    });
    const slots = Array.from({ length: 10 }, (_, index) =>
      slot({ inventoryItemId: `item-${index}`, floatValue: 0.5 }),
    );

    const ev = computeBasketEV(slots, testPlan, { averageWearProportion: 0.5 });

    expect(ev.totalEV).toBe(20);
    expect(ev.perOutcomeContribution[0]).toMatchObject({
      priceSource: 'PLAN_FALLBACK',
      priceMarketHashName: 'Output Skin (Well-Worn)',
      priceBasis: 'MANUAL_ESTIMATE',
    });
  });

  it('returns zero EV when a plan has no matching outcomes', () => {
    const testPlan = plan({}, { outcomeItems: [] });
    const slots = Array.from({ length: 10 }, (_, index) => slot({ inventoryItemId: `item-${index}` }));

    expect(computeBasketEV(slots, testPlan).totalEV).toBe(0);
  });
});

function withProjection<T extends ReturnType<typeof outcome>>(base: T) {
  return {
    ...base,
    minFloat: 0,
    maxFloat: 0.8,
    marketHashNames: [
      { exterior: 'FIELD_TESTED' as const, marketHashName: 'Output Skin (Field-Tested)' },
      { exterior: 'WELL_WORN' as const, marketHashName: 'Output Skin (Well-Worn)' },
    ],
  };
}

function withLatestPrices<T extends ReturnType<typeof outcome>>(
  base: T,
  latestMarketPrices: Array<{
    marketHashName: string;
    marketValue: number;
    source?: string;
    observedAt: Date;
    freshness: string;
  }>,
) {
  return { ...base, latestMarketPrices };
}
