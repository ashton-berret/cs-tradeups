import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { applyMigrations, clearOperationalTables, configureTestDatabase } from '../helpers/db';

configureTestDatabase();

const db = new PrismaClient();
mock.module('$lib/server/db/client', () => ({ db }));

const { buildBuyQueue } = await import('$lib/server/tradeups/plannerService');
const { markBought } = await import('$lib/server/candidates/candidateService');

const PLAN_ID = 'plan-mil-spec';
const RULE_ID = 'rule-mil-spec';
const COLLECTION_A = 'Test Collection A';
const COLLECTION_B = 'Test Collection B';

async function seedPlan(): Promise<void> {
  await db.tradeupPlan.create({
    data: {
      id: PLAN_ID,
      name: 'Test Plan',
      inputRarity: 'MIL_SPEC',
      targetRarity: 'RESTRICTED',
      isActive: true,
    },
  });
  await db.tradeupPlanRule.create({
    data: {
      id: RULE_ID,
      planId: PLAN_ID,
      collection: COLLECTION_A,
      rarity: 'MIL_SPEC',
      minFloat: 0,
      maxFloat: 0.5,
    },
  });
  await db.tradeupPlanRule.create({
    data: {
      id: 'rule-mil-spec-b',
      planId: PLAN_ID,
      collection: COLLECTION_B,
      rarity: 'MIL_SPEC',
      minFloat: 0,
      maxFloat: 0.5,
    },
  });
  await db.tradeupOutcomeItem.create({
    data: {
      planId: PLAN_ID,
      marketHashName: 'Output A',
      collection: COLLECTION_A,
      rarity: 'RESTRICTED',
      estimatedMarketValue: 30,
      probabilityWeight: 1,
    },
  });
  await db.tradeupOutcomeItem.create({
    data: {
      planId: PLAN_ID,
      marketHashName: 'Output B',
      collection: COLLECTION_B,
      rarity: 'RESTRICTED',
      estimatedMarketValue: 25,
      probabilityWeight: 1,
    },
  });
}

async function seedCandidate(id: string, collection: string, listPrice = 1.0): Promise<void> {
  await db.candidateListing.create({
    data: {
      id,
      marketHashName: `Item ${id}`,
      collection,
      rarity: 'MIL_SPEC',
      exterior: 'FACTORY_NEW',
      floatValue: 0.05,
      listPrice,
      currency: 'USD',
      source: 'MANUAL',
      status: 'WATCHING',
    },
  });
}

describe('plannerService.buildBuyQueue integration', () => {
  beforeAll(async () => {
    await applyMigrations(db);
  });

  beforeEach(async () => {
    await clearOperationalTables(db);
    await seedPlan();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it('returns an empty queue when no candidates or inventory exist', async () => {
    const queue = await buildBuyQueue();
    expect(queue.assignments).toEqual([]);
    expect(queue.baskets).toEqual([]);
    expect(queue.viableBasketCount).toBe(0);
  });

  it('forms a single proposed basket with 10 same-collection candidates', async () => {
    for (let i = 0; i < 10; i++) {
      await seedCandidate(`cand-${i}`, COLLECTION_A);
    }

    const queue = await buildBuyQueue();

    expect(queue.baskets).toHaveLength(1);
    expect(queue.baskets[0].itemCount).toBe(10);
    expect(queue.baskets[0].isFull).toBe(true);
    expect(queue.baskets[0].basketId).toBeNull(); // proposed, not persisted
    expect(queue.viableBasketCount).toBe(1);
    expect(queue.assignments).toHaveLength(10);
    expect(queue.assignments.every((a) => a.role === 'NEW_BASKET')).toBe(true);
  });

  it('produces 4 viable baskets from a 40-item pool that splits 12/13/10/5', async () => {
    for (let i = 0; i < 12; i++) await seedCandidate(`a-${i}`, COLLECTION_A);
    for (let i = 0; i < 13; i++) await seedCandidate(`b-${i}`, COLLECTION_B);
    // Add a third and fourth collection that the plan doesn't accept — they
    // should be unassigned, not block the optimizer. To get 4 baskets within
    // this single plan, we'd need 40 plan-accepting items. Use COLLECTION_A
    // and COLLECTION_B to fill the basket count.
    for (let i = 0; i < 10; i++) await seedCandidate(`c-${i}`, COLLECTION_A);
    for (let i = 0; i < 5; i++) await seedCandidate(`d-${i}`, COLLECTION_B);

    // Pool: 22 A + 18 B = 40 → expect 2 pure-A baskets (20 items, leaves 2 A)
    // and 1 pure-B basket (10, leaves 8 B), then a mixed basket (2 A + 8 B).
    // Total: 4 full baskets, 0 reserved.
    const queue = await buildBuyQueue();

    expect(queue.viableBasketCount).toBe(4);
    expect(queue.unassigned).toHaveLength(0);
    const reserveCount = queue.assignments.filter((a) => a.role === 'RESERVE').length;
    expect(reserveCount).toBe(0);
  });

  it('honors items pinned to an existing BUILDING basket', async () => {
    // Seed 9 inventory items in an existing BUILDING basket and 1 candidate
    // that should fill the 10th slot.
    const basketId = 'basket-existing';
    await db.tradeupBasket.create({
      data: { id: basketId, planId: PLAN_ID, status: 'BUILDING' },
    });
    for (let i = 0; i < 9; i++) {
      const inv = await db.inventoryItem.create({
        data: {
          id: `inv-${i}`,
          marketHashName: `Held ${i}`,
          collection: COLLECTION_A,
          rarity: 'MIL_SPEC',
          exterior: 'FACTORY_NEW',
          floatValue: 0.05,
          purchasePrice: 0.5,
          status: 'RESERVED_FOR_BASKET',
        },
      });
      await db.tradeupBasketItem.create({
        data: { basketId, inventoryItemId: inv.id, slotIndex: i },
      });
    }
    await seedCandidate('cand-fill', COLLECTION_A);

    const queue = await buildBuyQueue();

    const target = queue.baskets.find((b) => b.basketId === basketId);
    expect(target).toBeTruthy();
    expect(target?.itemCount).toBe(10);
    expect(target?.isFull).toBe(true);
    const fillAssignment = queue.assignments.find(
      (a) => a.basketId === basketId && a.role === 'BASKET_FILL',
    );
    expect(fillAssignment).toBeTruthy();
    expect(fillAssignment?.poolItemKind).toBe('CANDIDATE');
  });

  it('produces deterministic assignments across repeated calls with unchanged input', async () => {
    for (let i = 0; i < 12; i++) await seedCandidate(`c-${i}`, COLLECTION_A);

    const a = await buildBuyQueue();
    const b = await buildBuyQueue();

    const aIds = a.assignments.map((x) => `${x.basketGroupId}:${x.basketSlotIndex}:${x.poolItemId}`);
    const bIds = b.assignments.map((x) => `${x.basketGroupId}:${x.basketSlotIndex}:${x.poolItemId}`);
    expect(aIds).toEqual(bIds);
  });

  it('markBought with intendedBasketId reserves the new inventory into the basket', async () => {
    // Existing 9-item basket waiting on one more slot.
    const basketId = 'basket-target';
    await db.tradeupBasket.create({
      data: { id: basketId, planId: PLAN_ID, status: 'BUILDING' },
    });
    for (let i = 0; i < 9; i++) {
      const inv = await db.inventoryItem.create({
        data: {
          id: `inv-${i}`,
          marketHashName: `Held ${i}`,
          collection: COLLECTION_A,
          rarity: 'MIL_SPEC',
          exterior: 'FACTORY_NEW',
          floatValue: 0.05,
          purchasePrice: 0.5,
          status: 'RESERVED_FOR_BASKET',
        },
      });
      await db.tradeupBasketItem.create({
        data: { basketId, inventoryItemId: inv.id, slotIndex: i },
      });
    }
    await seedCandidate('buy-me', COLLECTION_A, 2.0);

    const result = await markBought('buy-me', {
      purchasePrice: 2.0,
      intendedBasketId: basketId,
      intendedSlotIndex: 9,
    });

    expect(result.basketReservation).toEqual({ basketId, slotIndex: 9 });
    expect(result.inventoryItem.status).toBe('RESERVED_FOR_BASKET');
    const items = await db.tradeupBasketItem.findMany({ where: { basketId } });
    expect(items).toHaveLength(10);
  });

  it('markBought returns a warning when the intended slot is already occupied', async () => {
    const basketId = 'basket-occupied';
    await db.tradeupBasket.create({
      data: { id: basketId, planId: PLAN_ID, status: 'BUILDING' },
    });
    const occupant = await db.inventoryItem.create({
      data: {
        id: 'inv-occupant',
        marketHashName: 'Occupant',
        collection: COLLECTION_A,
        rarity: 'MIL_SPEC',
        exterior: 'FACTORY_NEW',
        floatValue: 0.05,
        purchasePrice: 0.5,
        status: 'RESERVED_FOR_BASKET',
      },
    });
    await db.tradeupBasketItem.create({
      data: { basketId, inventoryItemId: occupant.id, slotIndex: 3 },
    });
    await seedCandidate('buy-collide', COLLECTION_A, 1.0);

    const result = await markBought('buy-collide', {
      purchasePrice: 1.0,
      intendedBasketId: basketId,
      intendedSlotIndex: 3,
    });

    expect(result.basketReservation).toMatchObject({ warning: expect.stringContaining('already occupied') });
    expect(result.inventoryItem.status).toBe('HELD');
  });
});
