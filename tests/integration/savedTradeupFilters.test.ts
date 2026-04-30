import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { applyMigrations, clearOperationalTables, configureTestDatabase } from '../helpers/db';

configureTestDatabase();

const db = new PrismaClient();
mock.module('$lib/server/db/client', () => ({ db }));

const { listCombinations } = await import('$lib/server/tradeups/combinationService');

describe('saved tradeup filters', () => {
  beforeAll(async () => {
    await applyMigrations(db);
  });

  beforeEach(async () => {
    await clearOperationalTables(db);
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it('filters by derived operator fields', async () => {
    await createCombination({
      id: 'good-combo',
      name: 'Good combo',
      collection: 'The Alpha Collection',
      inputRarity: 'MIL_SPEC',
      targetRarity: 'RESTRICTED',
      expectedProfit: 4,
      expectedProfitPct: 40,
      maxFloat: 0.12,
      maxPrice: 1.5,
      successRate: 92,
      withSnapshot: true,
    });
    await createCombination({
      id: 'bad-combo',
      name: 'Bad combo',
      collection: 'The Beta Collection',
      inputRarity: 'RESTRICTED',
      targetRarity: 'CLASSIFIED',
      expectedProfit: -1,
      expectedProfitPct: -10,
      maxFloat: 0.32,
      maxPrice: 4,
      successRate: 35,
      withSnapshot: false,
    });

    const result = await listCombinations({
      collection: 'alpha',
      inputRarity: 'MIL_SPEC',
      minProfit: 0,
      minProfitPct: 10,
      minProfitChance: 80,
      maxInputFloat: 0.15,
      maxInputPrice: 2,
      recheckStatus: 'rechecked',
      outputs: 'with',
      page: 1,
      limit: 25,
    });

    expect(result.total).toBe(1);
    expect(result.data[0].id).toBe('good-combo');
  });

  it('presents TradeUpLab output prices and thesis profitability as Steam net', async () => {
    await db.tradeupCombination.create({
      data: {
        id: 'tradeuplab-gross-combo',
        name: 'TradeUpLab gross combo',
        isActive: false,
        mode: 'AD_HOC',
        inputRarity: 'MIL_SPEC',
        targetRarity: 'RESTRICTED',
        thesisTotalCost: 10,
        thesisTotalEV: 11.5,
        thesisExpectedProfit: 1.5,
        thesisExpectedProfitPct: 15,
        thesisPlanSnapshot: { mode: 'AD_HOC', rules: [], outcomes: [] },
        tradeupLabId: 1234,
        notes: JSON.stringify({
          source: 'tradeuplab.com',
          tradeupLabId: 1234,
          published: { successRate: 100 },
          outcomes: [
            {
              marketHashName: 'Gross Output (Field-Tested)',
              displayName: 'Gross Output',
              exterior: 'Field-Tested',
              price: 11.5,
              probability: 1,
            },
          ],
        }),
        inputs: {
          create: Array.from({ length: 10 }, (_, slotIndex) => ({
            slotIndex,
            collection: 'The Gross Collection',
            price: 1,
          })),
        },
      },
    });

    const result = await listCombinations({ minProfit: 0.01, page: 1, limit: 25 });
    expect(result.total).toBe(0);

    const unfiltered = await listCombinations({ page: 1, limit: 25 });
    const combo = unfiltered.data[0];
    expect(combo.outputs[0].price).toBe(10);
    expect(combo.thesis.totalEV).toBe(10);
    expect(combo.thesis.expectedProfit).toBe(0);
    expect(combo.profitChance).toBe(0);
  });
});

async function createCombination(args: {
  id: string;
  name: string;
  collection: string;
  inputRarity: string;
  targetRarity: string;
  expectedProfit: number;
  expectedProfitPct: number;
  maxFloat: number;
  maxPrice: number;
  successRate: number;
  withSnapshot: boolean;
}) {
  await db.tradeupCombination.create({
    data: {
      id: args.id,
      name: args.name,
      isActive: false,
      mode: 'AD_HOC',
      inputRarity: args.inputRarity,
      targetRarity: args.targetRarity,
      thesisTotalCost: 10,
      thesisTotalEV: 10 + args.expectedProfit,
      thesisExpectedProfit: args.expectedProfit,
      thesisExpectedProfitPct: args.expectedProfitPct,
      thesisPlanSnapshot: { mode: 'AD_HOC', rules: [], outcomes: [] },
      notes: JSON.stringify({
        published: { successRate: args.successRate },
        outcomes: [
          {
            marketHashName: `${args.name} Output (Field-Tested)`,
            displayName: `${args.name} Output`,
            exterior: 'Field-Tested',
            price: 12,
            probability: 1,
          },
        ],
      }),
      inputs: {
        create: Array.from({ length: 10 }, (_, slotIndex) => ({
          slotIndex,
          collection: args.collection,
          floatValue: args.maxFloat,
          price: args.maxPrice,
        })),
      },
      recheckSnapshots: args.withSnapshot
        ? {
            create: {
              totalCost: 10,
              totalEV: 12,
              expectedProfit: 2,
              expectedProfitPct: 20,
            },
          }
        : undefined,
    },
  });
}
