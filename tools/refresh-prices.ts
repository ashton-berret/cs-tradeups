// Refresh targeted Steam Market price observations without the dev server.
//
// Usage:
//   bun run tools/refresh-prices.ts
//
// This runs the same local job as POST /api/market-prices/refresh and writes
// directly through Prisma. It reads prices only; buying/selling remains manual.

import { refreshMarketPricesAndDependents } from '../src/lib/server/marketPrices/refreshService';

const result = await refreshMarketPricesAndDependents();

for (const summary of result.prices.summaries) {
  console.log(
    `${summary.adapter}: ${summary.written} written, ${summary.skipped} skipped, ${summary.requested} requested, ${summary.errors.length} errors`,
  );
  for (const error of summary.errors) {
    console.log(`  ${error.marketHashName}: ${error.message}`);
  }
}

console.log(
  `Dependents: ${result.dependents.candidatesReevaluated} candidates, ${result.dependents.basketsRecomputed} baskets, ${result.dependents.basketErrors.length} basket errors`,
);

if (result.prices.summaries.some((summary) => summary.errors.length > 0)) {
  process.exitCode = 1;
}
