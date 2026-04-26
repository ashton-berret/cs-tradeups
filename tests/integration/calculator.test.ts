import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { applyMigrations, clearOperationalTables, configureTestDatabase } from '../helpers/db';

configureTestDatabase();

const db = new PrismaClient();
mock.module('$lib/server/db/client', () => ({ db }));

const { calculate } = await import('$lib/server/tradeups/calculatorService');

const PLAN_ID = 'plan-calc';
const COLLECTION_A = 'Collection Alpha';
const COLLECTION_B = 'Collection Bravo';

async function seedPlan(): Promise<void> {
  await db.tradeupPlan.create({
    data: {
      id: PLAN_ID,
      name: 'Calc Plan',
      inputRarity: 'MIL_SPEC',
      targetRarity: 'RESTRICTED',
      isActive: true,
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
      estimatedMarketValue: 10,
      probabilityWeight: 1,
    },
  });
}

describe('calculatorService.calculate', () => {
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

  it('returns the collection-weighted EV for a single-collection 10-input basket', async () => {
    const result = await calculate({
      planId: PLAN_ID,
      inputs: Array.from({ length: 10 }, () => ({
        collection: COLLECTION_A,
        floatValue: 0.1,
        price: 1,
      })),
    });

    // 10 slots all in Alpha → P(Alpha)=1.0, EV = 30 (the only Alpha outcome).
    expect(result.totalEV).toBe(30);
    expect(result.totalCost).toBe(10);
    expect(result.expectedProfit).toBe(20);
    expect(result.ev.perCollectionChance[COLLECTION_A]).toBeCloseTo(1.0, 5);
  });

  it('weights mixed-collection baskets by slot count', async () => {
    const inputs = [
      ...Array.from({ length: 4 }, () => ({ collection: COLLECTION_A, price: 1 })),
      ...Array.from({ length: 6 }, () => ({ collection: COLLECTION_B, price: 1 })),
    ];
    const result = await calculate({ planId: PLAN_ID, inputs });

    // 0.4 * 30 + 0.6 * 10 = 12 + 6 = 18
    expect(result.totalEV).toBeCloseTo(18, 5);
    expect(result.ev.perCollectionChance[COLLECTION_A]).toBeCloseTo(0.4, 5);
    expect(result.ev.perCollectionChance[COLLECTION_B]).toBeCloseTo(0.6, 5);
  });

  it('emits a warning when fewer than 10 inputs are provided', async () => {
    const result = await calculate({
      planId: PLAN_ID,
      inputs: Array.from({ length: 5 }, () => ({ collection: COLLECTION_A, price: 1 })),
    });
    expect(result.warnings.some((w) => w.includes('Only 5 inputs provided'))).toBe(true);
  });

  it('always emits the output-projection warning in v1', async () => {
    const result = await calculate({
      planId: PLAN_ID,
      inputs: [{ collection: COLLECTION_A, price: 1 }],
    });
    expect(result.warnings.some((w) => w.includes('exterior projection skipped'))).toBe(true);
  });

  it('throws NotFoundError for a missing plan id', async () => {
    await expect(
      calculate({ planId: 'plan-missing', inputs: [{ collection: COLLECTION_A, price: 1 }] }),
    ).rejects.toThrow();
  });
});
