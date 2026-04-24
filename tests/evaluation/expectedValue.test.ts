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

  it('projects catalog outcome float and exterior when average input float is supplied', () => {
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

    expect(computeBasketEV(slots, testPlan, { averageInputFloat: 0.5 }).perOutcomeContribution[0]).toMatchObject({
      projectedFloat: 0.4,
      projectedExterior: 'WELL_WORN',
      projectedMarketHashName: 'Output Skin (Well-Worn)',
    });
  });

  it('returns zero EV when a plan has no matching outcomes', () => {
    const testPlan = plan({}, { outcomeItems: [] });
    const slots = Array.from({ length: 10 }, (_, index) => slot({ inventoryItemId: `item-${index}` }));

    expect(computeBasketEV(slots, testPlan).totalEV).toBe(0);
  });
});

function withProjection(base: ReturnType<typeof outcome>) {
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
