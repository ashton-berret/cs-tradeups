import { describe, expect, it } from 'bun:test';
import { buildPool, computeEligibility } from '$lib/server/tradeups/planner/eligibility';
import type { PlanWithRulesAndOutcomes } from '$lib/server/tradeups/planner/types';
import { candidateRow, decimal, outcome, plan, rule } from '../helpers/factories';
import { COLLECTION_A, COLLECTION_B, TEST_DATE } from '../helpers/fixtures';
import type { InventoryItem } from '@prisma/client';

function inventoryRow(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'inv-1',
    createdAt: TEST_DATE,
    updatedAt: TEST_DATE,
    marketHashName: 'Held Skin',
    weaponName: null,
    skinName: null,
    collection: COLLECTION_A,
    catalogSkinId: null,
    catalogCollectionId: null,
    catalogWeaponDefIndex: null,
    catalogPaintIndex: null,
    rarity: 'MIL_SPEC',
    exterior: 'FACTORY_NEW',
    floatValue: 0.1,
    pattern: null,
    inspectLink: null,
    purchasePrice: decimal(2),
    purchaseCurrency: 'USD',
    purchaseFees: null,
    purchaseDate: TEST_DATE,
    status: 'HELD',
    currentEstValue: null,
    notes: null,
    candidateId: null,
    ...overrides,
  };
}

describe('buildPool', () => {
  it('produces uniform PoolItems for candidates and inventory with stable ids', async () => {
    const cand = candidateRow({ id: 'c1', listPrice: decimal(5) });
    const inv = inventoryRow({ id: 'i1', purchasePrice: decimal(2) });

    const pool = await buildPool({
      candidates: [cand],
      inventory: [inv],
      inventoryBasketMap: new Map(),
    });

    expect(pool).toHaveLength(2);
    const candPool = pool.find((p) => p.poolItemId === 'candidate:c1');
    const invPool = pool.find((p) => p.poolItemId === 'inventory:i1');
    expect(candPool?.kind).toBe('CANDIDATE');
    expect(candPool?.currentPrice).toBe(5);
    expect(invPool?.kind).toBe('INVENTORY');
    expect(invPool?.currentPrice).toBe(2);
  });

  it('marks inventory items pinned to BUILDING baskets via the basket map', async () => {
    const inv = inventoryRow({ id: 'i1' });
    const pool = await buildPool({
      candidates: [],
      inventory: [inv],
      inventoryBasketMap: new Map([['i1', 'basket-7']]),
    });

    expect(pool[0].pinnedBasketId).toBe('basket-7');
  });

  it('prefers catalog collection id over text collection in collectionKey', async () => {
    const inv = inventoryRow({ id: 'i1', catalogCollectionId: 'col-x', collection: 'Some Other Name' });
    const [pooled] = await buildPool({ candidates: [], inventory: [inv], inventoryBasketMap: new Map() });
    expect(pooled.collectionKey).toBe('col-x');
  });
});

describe('computeEligibility', () => {
  function planWithRule(planId: string, ruleCollection: string): PlanWithRulesAndOutcomes {
    return plan(
      { id: planId, name: `Plan ${planId}` },
      {
        rules: [rule({ id: `rule-${planId}`, planId, collection: ruleCollection, minFloat: 0, maxFloat: 0.2 })],
        outcomeItems: [outcome({ id: `out-${planId}`, planId, collection: ruleCollection })],
      },
    );
  }

  it('returns empty eligibility for an item that no plan accepts', async () => {
    const cand = candidateRow({ id: 'c1', collection: 'Unknown Collection' });
    const pool = await buildPool({ candidates: [cand], inventory: [], inventoryBasketMap: new Map() });
    const eligible = computeEligibility(pool, [planWithRule('p1', COLLECTION_A)]);

    expect(eligible[0].eligibility).toEqual([]);
  });

  it('returns multiple plan eligibilities for an item that several plans accept', async () => {
    const cand = candidateRow({ id: 'c1', collection: COLLECTION_A });
    const planA = planWithRule('pa', COLLECTION_A);
    const planB = planWithRule('pb', COLLECTION_A);
    const pool = await buildPool({ candidates: [cand], inventory: [], inventoryBasketMap: new Map() });
    const eligible = computeEligibility(pool, [planA, planB]);

    expect(eligible[0].eligibility.map((e) => e.planId).sort()).toEqual(['pa', 'pb']);
  });

  it('rejects items whose collection no rule accepts even when rarity matches', async () => {
    const cand = candidateRow({ id: 'c1', collection: COLLECTION_B });
    const pool = await buildPool({ candidates: [cand], inventory: [], inventoryBasketMap: new Map() });
    const eligible = computeEligibility(pool, [planWithRule('p1', COLLECTION_A)]);

    expect(eligible[0].eligibility).toEqual([]);
  });
});
