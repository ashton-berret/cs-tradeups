import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { applyMigrations, clearOperationalTables, configureTestDatabase } from '../helpers/db';

configureTestDatabase();

const db = new PrismaClient();
mock.module('$lib/server/db/client', () => ({ db }));

const { deleteIngestedCandidates } = await import('$lib/server/candidates/candidateService');

describe('candidate reset', () => {
  beforeAll(async () => {
    await applyMigrations(db);
  });

  beforeEach(async () => {
    await clearOperationalTables(db);
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it('deletes extension-ingested candidates while preserving manual and inventory-linked rows', async () => {
    await db.candidateListing.create({
      data: {
        id: 'candidate-extension',
        marketHashName: 'AK-47 | Slate (Field-Tested)',
        listPrice: 1,
        currency: 'USD',
        source: 'EXTENSION',
      },
    });
    await db.candidateListing.create({
      data: {
        id: 'candidate-manual',
        marketHashName: 'Manual item',
        listPrice: 2,
        currency: 'USD',
        source: 'MANUAL',
      },
    });
    await db.candidateListing.create({
      data: {
        id: 'candidate-bought',
        marketHashName: 'Bought bridge item',
        listPrice: 3,
        currency: 'USD',
        source: 'EXTENSION',
      },
    });
    await db.inventoryItem.create({
      data: {
        marketHashName: 'Bought bridge item',
        purchasePrice: 3,
        purchaseCurrency: 'USD',
        candidateId: 'candidate-bought',
      },
    });

    const result = await deleteIngestedCandidates();

    expect(result).toEqual({ count: 1, skippedLinkedInventory: 1 });
    expect(await db.candidateListing.findUnique({ where: { id: 'candidate-extension' } })).toBeNull();
    expect(await db.candidateListing.findUnique({ where: { id: 'candidate-manual' } })).toBeTruthy();
    expect(await db.candidateListing.findUnique({ where: { id: 'candidate-bought' } })).toBeTruthy();
  });
});
