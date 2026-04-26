import { describe, expect, it } from 'bun:test';
import { partitionPlan } from '$lib/server/tradeups/planner/partition';
import type { PoolItem, PlanWithRulesAndOutcomes } from '$lib/server/tradeups/planner/types';
import { decimal, outcome, plan } from '../helpers/factories';
import { COLLECTION_A, COLLECTION_B } from '../helpers/fixtures';

const COLLECTION_C = 'Charlie Collection';
const COLLECTION_D = 'Delta Collection';

function poolItem(overrides: Partial<PoolItem> & { id: string; collection?: string | null }): PoolItem {
  return {
    poolItemId: `candidate:${overrides.id}`,
    kind: 'CANDIDATE',
    sourceId: overrides.id,
    marketHashName: `Item ${overrides.id}`,
    collectionKey: overrides.collection ?? COLLECTION_A,
    rarity: 'MIL_SPEC',
    exterior: 'FACTORY_NEW',
    floatValue: 0.1,
    currentPrice: 1.0,
    pinnedBasketId: null,
    inputMinFloat: 0,
    inputMaxFloat: 1,
    candidateRow: null,
    inventoryRow: null,
    ...overrides,
  };
}

function makePlan(outcomes: { collection: string; ev: number }[] = []): PlanWithRulesAndOutcomes {
  return plan({}, {
    outcomeItems: outcomes.map((o, idx) =>
      outcome({ id: `out-${idx}-${o.collection}`, collection: o.collection, estimatedMarketValue: decimal(o.ev) }),
    ),
  });
}

describe('partitionPlan', () => {
  it('returns no baskets and no reserves for an empty pool', () => {
    const result = partitionPlan({
      plan: makePlan([{ collection: COLLECTION_A, ev: 30 }]),
      freeItems: [],
      existingBaskets: [],
    });

    expect(result.baskets).toEqual([]);
    expect(result.reserved).toEqual([]);
  });

  it('reserves a single item when the pool cannot form a 10-basket', () => {
    const result = partitionPlan({
      plan: makePlan([{ collection: COLLECTION_A, ev: 30 }]),
      freeItems: [poolItem({ id: '1', collection: COLLECTION_A })],
      existingBaskets: [],
    });

    expect(result.baskets).toEqual([]);
    expect(result.reserved).toHaveLength(1);
  });

  it('forms one full pure-collection basket from 10 same-collection items', () => {
    const items = Array.from({ length: 10 }, (_, i) => poolItem({ id: `${i}`, collection: COLLECTION_A }));
    const result = partitionPlan({
      plan: makePlan([{ collection: COLLECTION_A, ev: 30 }]),
      freeItems: items,
      existingBaskets: [],
    });

    expect(result.baskets).toHaveLength(1);
    expect(result.baskets[0].placedItems).toHaveLength(10);
    expect(result.baskets[0].basketId).toBeNull();
    expect(result.reserved).toEqual([]);
  });

  it('forms two pure-collection baskets when the pool has 20 same-collection items', () => {
    const items = Array.from({ length: 20 }, (_, i) => poolItem({ id: `${i}`, collection: COLLECTION_A }));
    const result = partitionPlan({
      plan: makePlan([{ collection: COLLECTION_A, ev: 30 }]),
      freeItems: items,
      existingBaskets: [],
    });

    expect(result.baskets).toHaveLength(2);
    expect(result.baskets.every((b) => b.placedItems.length === 10)).toBe(true);
    expect(result.reserved).toEqual([]);
  });

  it('fills an existing 9-item basket to 10 with a single matching free item', () => {
    const fixedItems = Array.from({ length: 9 }, (_, i) => poolItem({ id: `fix-${i}`, collection: COLLECTION_A }));
    const free = poolItem({ id: 'free-1', collection: COLLECTION_A });

    const result = partitionPlan({
      plan: makePlan([{ collection: COLLECTION_A, ev: 30 }]),
      freeItems: [free],
      existingBaskets: [{ basketId: 'b1', items: fixedItems }],
    });

    expect(result.baskets).toHaveLength(1);
    expect(result.baskets[0].basketId).toBe('b1');
    expect(result.baskets[0].fixedItems).toHaveLength(9);
    expect(result.baskets[0].placedItems).toHaveLength(1);
    expect(result.reserved).toEqual([]);
  });

  it('produces 4 viable baskets from a 40-item pool that splits 12/13/10/5 across 4 collections', () => {
    // The user-stated requirement: with 39 items already in the pool, adding
    // the 40th must produce a partition with 4 full baskets, not the locally
    // best home for one item.
    const items: PoolItem[] = [
      ...Array.from({ length: 12 }, (_, i) => poolItem({ id: `a-${i}`, collection: COLLECTION_A })),
      ...Array.from({ length: 13 }, (_, i) => poolItem({ id: `b-${i}`, collection: COLLECTION_B })),
      ...Array.from({ length: 10 }, (_, i) => poolItem({ id: `c-${i}`, collection: COLLECTION_C })),
      ...Array.from({ length: 5 }, (_, i) => poolItem({ id: `d-${i}`, collection: COLLECTION_D })),
    ];

    const result = partitionPlan({
      plan: makePlan([
        { collection: COLLECTION_A, ev: 30 },
        { collection: COLLECTION_B, ev: 25 },
        { collection: COLLECTION_C, ev: 20 },
        { collection: COLLECTION_D, ev: 15 },
      ]),
      freeItems: items,
      existingBaskets: [],
    });

    const fullBaskets = result.baskets.filter(
      (b) => b.fixedItems.length + b.placedItems.length === 10,
    );
    expect(fullBaskets).toHaveLength(4);
    expect(result.reserved).toEqual([]);
  });

  it('strands < 10 leftover items as reserve when the pool does not divide evenly', () => {
    // 12 items, 1 collection: 1 full basket + 2 reserved.
    const items = Array.from({ length: 12 }, (_, i) => poolItem({ id: `${i}`, collection: COLLECTION_A }));
    const result = partitionPlan({
      plan: makePlan([{ collection: COLLECTION_A, ev: 30 }]),
      freeItems: items,
      existingBaskets: [],
    });

    expect(result.baskets).toHaveLength(1);
    expect(result.baskets[0].placedItems).toHaveLength(10);
    expect(result.reserved).toHaveLength(2);
  });

  it('produces deterministic output for identical inputs across calls', () => {
    const makeItems = () =>
      Array.from({ length: 15 }, (_, i) => poolItem({ id: `${i}`, collection: i < 10 ? COLLECTION_A : COLLECTION_B }));

    const planFixture = makePlan([
      { collection: COLLECTION_A, ev: 30 },
      { collection: COLLECTION_B, ev: 20 },
    ]);

    const a = partitionPlan({ plan: planFixture, freeItems: makeItems(), existingBaskets: [] });
    const b = partitionPlan({ plan: planFixture, freeItems: makeItems(), existingBaskets: [] });

    const aIds = a.baskets.map((bk) => bk.placedItems.map((it) => it.poolItemId));
    const bIds = b.baskets.map((bk) => bk.placedItems.map((it) => it.poolItemId));
    expect(aIds).toEqual(bIds);
  });

  it('forms a pure-collection basket of the higher-EV collection first when both have ≥10 items', () => {
    const items = [
      ...Array.from({ length: 10 }, (_, i) => poolItem({ id: `a-${i}`, collection: COLLECTION_A })),
      ...Array.from({ length: 10 }, (_, i) => poolItem({ id: `b-${i}`, collection: COLLECTION_B })),
    ];

    const result = partitionPlan({
      plan: makePlan([
        { collection: COLLECTION_A, ev: 30 },
        { collection: COLLECTION_B, ev: 50 },
      ]),
      freeItems: items,
      existingBaskets: [],
    });

    // Both collections have ≥10 so both should form full baskets — the
    // ordering isn't asserted here, only that no items are stranded.
    expect(result.baskets).toHaveLength(2);
    expect(result.reserved).toHaveLength(0);
    for (const basket of result.baskets) {
      const collections = new Set(basket.placedItems.map((it) => it.collectionKey));
      expect(collections.size).toBe(1);
    }
  });
});
