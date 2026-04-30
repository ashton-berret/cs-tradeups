import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { applyMigrations, clearOperationalTables, configureTestDatabase } from '../helpers/db';

configureTestDatabase();

const db = new PrismaClient();
mock.module('$lib/server/db/client', () => ({ db }));

const { patchCombination } = await import('$lib/server/tradeups/combinationService');

describe('combinationService.patchCombination', () => {
  beforeAll(async () => {
    await applyMigrations(db);
  });

  beforeEach(async () => {
    await clearOperationalTables(db);
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it('creates and links an active plan when an ad-hoc saved combination is activated', async () => {
    const combination = await db.tradeupCombination.create({
      data: {
        name: 'Saved Chroma tradeup',
        notes: JSON.stringify({
          outcomes: [
            {
              marketHashName: 'AK-47 | Example (Field-Tested)',
              displayName: 'AK-47 | Example',
              price: 25,
              probability: 1,
            },
          ],
        }),
        isActive: false,
        mode: 'AD_HOC',
        inputRarity: 'MIL_SPEC',
        targetRarity: 'RESTRICTED',
        thesisTotalCost: 10,
        thesisTotalEV: 25,
        thesisExpectedProfit: 15,
        thesisExpectedProfitPct: 150,
        thesisPlanSnapshot: { mode: 'AD_HOC', rules: [], outcomes: [] },
        inputs: {
          create: Array.from({ length: 10 }, (_, slotIndex) => ({
            slotIndex,
            collection: 'The Chroma Collection',
            floatValue: 0.12,
            price: 1,
          })),
        },
      },
    });

    const updated = await patchCombination(combination.id, { isActive: true });

    expect(updated.isActive).toBe(true);
    expect(updated.mode).toBe('PLAN');
    expect(updated.sourcePlanId).toBeTruthy();

    const plan = await db.tradeupPlan.findUnique({
      where: { id: updated.sourcePlanId! },
      include: { rules: true, outcomeItems: true },
    });
    expect(plan?.isActive).toBe(true);
    expect(plan?.name).toBe('Saved Chroma tradeup');
    expect(plan?.rules).toHaveLength(1);
    expect(plan?.rules[0].collection).toBe('The Chroma Collection');
    expect(plan?.rules[0].minQuantity).toBe(10);
    expect(plan?.rules[0].maxFloat).toBe(0.12);
    expect(plan?.outcomeItems).toHaveLength(1);
    expect(plan?.outcomeItems[0].marketHashName).toBe('AK-47 | Example (Field-Tested)');
  });

  it('reactivates an existing source plan instead of creating a duplicate', async () => {
    const plan = await db.tradeupPlan.create({
      data: {
        name: 'Existing plan',
        inputRarity: 'MIL_SPEC',
        targetRarity: 'RESTRICTED',
        isActive: false,
      },
    });
    const combination = await db.tradeupCombination.create({
      data: {
        name: 'Plan-backed saved tradeup',
        isActive: false,
        mode: 'PLAN',
        sourcePlanId: plan.id,
        inputRarity: 'MIL_SPEC',
        targetRarity: 'RESTRICTED',
        thesisTotalCost: 10,
        thesisTotalEV: 11,
        thesisExpectedProfit: 1,
        thesisExpectedProfitPct: 10,
        thesisPlanSnapshot: { mode: 'PLAN', rules: [], outcomes: [] },
      },
    });

    const updated = await patchCombination(combination.id, { isActive: true });

    expect(updated.sourcePlanId).toBe(plan.id);
    expect(await db.tradeupPlan.count()).toBe(1);
    expect(await db.tradeupPlan.findUnique({ where: { id: plan.id } })).toMatchObject({
      isActive: true,
    });
  });
});
