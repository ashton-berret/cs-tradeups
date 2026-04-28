import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';

const TEST_DB_NAME = 'test-integration.db';
const TEST_DB_PATHS = [join(process.cwd(), TEST_DB_NAME), join(process.cwd(), 'prisma', TEST_DB_NAME)];

export function configureTestDatabase(): void {
  process.env.DATABASE_URL = `file:./${TEST_DB_NAME}`;
  process.env.NODE_ENV = 'test';

  for (const path of TEST_DB_PATHS) {
    if (existsSync(path)) {
      rmSync(path);
    }
  }
}

export async function applyMigrations(db: PrismaClient): Promise<void> {
  const migrationFiles = [
    '20260421000000_init/migration.sql',
    '20260422120000_phase5_schema_additions/migration.sql',
    '20260424000000_catalog_identity_linkage/migration.sql',
    '20260424010000_plan_catalog_identity_linkage/migration.sql',
    '20260424020000_market_price_observations/migration.sql',
    '20260426165249_phase8_tradeup_combinations/migration.sql',
    '20260426180000_phase8_inventory_steam_asset/migration.sql',
    '20260427120000_tradeup_combination_lab_id/migration.sql',
  ];

  for (const file of migrationFiles) {
    const sql = readFileSync(join(process.cwd(), 'prisma', 'migrations', file), 'utf8');
    for (const statement of splitSqlStatements(sql)) {
      await db.$executeRawUnsafe(statement);
    }
  }
}

export async function clearOperationalTables(db: PrismaClient): Promise<void> {
  await db.marketPriceObservation.deleteMany();
  await db.tradeupCombinationSnapshot.deleteMany();
  await db.tradeupCombinationInput.deleteMany();
  await db.tradeupCombination.deleteMany();
  await db.tradeupExecution.deleteMany();
  await db.tradeupBasketItem.deleteMany();
  await db.tradeupBasket.deleteMany();
  await db.inventoryItem.deleteMany();
  await db.candidateListing.deleteMany();
  await db.tradeupOutcomeItem.deleteMany();
  await db.tradeupPlanRule.deleteMany();
  await db.tradeupPlan.deleteMany();
}

function splitSqlStatements(sql: string): string[] {
  const withoutLineComments = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  return withoutLineComments
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}
