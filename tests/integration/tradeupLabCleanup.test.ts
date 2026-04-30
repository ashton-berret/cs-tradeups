import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { applyMigrations, clearOperationalTables, configureTestDatabase } from '../helpers/db';

configureTestDatabase();

const db = new PrismaClient();
mock.module('$lib/server/db/client', () => ({ db }));

const { deleteTradeupLabCombinations } = await import('$lib/server/tradeups/combinationService');

describe('TradeUpLab saved tradeup cleanup', () => {
  beforeAll(async () => {
    await applyMigrations(db);
  });

  beforeEach(async () => {
    await clearOperationalTables(db);
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it('deletes imported combinations and eligible generated plans only', async () => {
    const generatedPlan = await db.tradeupPlan.create({
      data: {
        id: 'generated-plan',
        name: 'Generated plan',
        description: 'Created from saved tradeup imported-combo',
        inputRarity: 'MIL_SPEC',
        targetRarity: 'RESTRICTED',
        isActive: true,
      },
    });
    const blockedPlan = await db.tradeupPlan.create({
      data: {
        id: 'blocked-generated-plan',
        name: 'Blocked generated plan',
        description: 'Created from saved tradeup blocked-combo',
        inputRarity: 'MIL_SPEC',
        targetRarity: 'RESTRICTED',
        isActive: true,
      },
    });
    await db.tradeupBasket.create({
      data: {
        id: 'blocking-basket',
        planId: blockedPlan.id,
        name: 'Blocking basket',
      },
    });
    await db.tradeupCombination.create({
      data: {
        id: 'imported-combo',
        name: 'TradeUpLab combo',
        isActive: true,
        mode: 'PLAN',
        sourcePlanId: generatedPlan.id,
        inputRarity: 'MIL_SPEC',
        targetRarity: 'RESTRICTED',
        thesisTotalCost: 10,
        thesisTotalEV: 12,
        thesisExpectedProfit: 2,
        thesisExpectedProfitPct: 20,
        thesisPlanSnapshot: { mode: 'AD_HOC', rules: [], outcomes: [] },
        tradeupLabId: 12345,
      },
    });
    await db.tradeupCombination.create({
      data: {
        id: 'blocked-combo',
        name: 'Blocked TradeUpLab combo',
        isActive: true,
        mode: 'PLAN',
        sourcePlanId: blockedPlan.id,
        inputRarity: 'MIL_SPEC',
        targetRarity: 'RESTRICTED',
        thesisTotalCost: 10,
        thesisTotalEV: 12,
        thesisExpectedProfit: 2,
        thesisExpectedProfitPct: 20,
        thesisPlanSnapshot: { mode: 'AD_HOC', rules: [], outcomes: [] },
        tradeupLabId: 12346,
      },
    });
    await db.tradeupCombination.create({
      data: {
        id: 'local-combo',
        name: 'Local combo',
        isActive: false,
        mode: 'AD_HOC',
        inputRarity: 'MIL_SPEC',
        targetRarity: 'RESTRICTED',
        thesisTotalCost: 10,
        thesisTotalEV: 12,
        thesisExpectedProfit: 2,
        thesisExpectedProfitPct: 20,
        thesisPlanSnapshot: { mode: 'AD_HOC', rules: [], outcomes: [] },
      },
    });

    const result = await deleteTradeupLabCombinations();

    expect(result).toEqual({
      combinationsDeleted: 2,
      generatedPlansDeleted: 1,
      generatedPlansSkipped: 1,
    });
    expect(await db.tradeupCombination.findUnique({ where: { id: 'imported-combo' } })).toBeNull();
    expect(await db.tradeupCombination.findUnique({ where: { id: 'blocked-combo' } })).toBeNull();
    expect(await db.tradeupCombination.findUnique({ where: { id: 'local-combo' } })).toBeTruthy();
    expect(await db.tradeupPlan.findUnique({ where: { id: generatedPlan.id } })).toBeNull();
    expect(await db.tradeupPlan.findUnique({ where: { id: blockedPlan.id } })).toBeTruthy();
  });
});
