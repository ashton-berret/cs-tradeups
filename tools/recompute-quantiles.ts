// Recompute price quantile snapshots without the dev server.
//
// Usage:
//   bun run tools/recompute-quantiles.ts
//   bun run tools/recompute-quantiles.ts --exclude-source=TRADEUPLAB_IMPORT
//
// Runs a full quantile recompute across all observed (catalogSkinId, exterior, statTrak)
// cells with observations in the 14-day window. Writes directly through Prisma.

import { recomputeQuantiles, type QuantileSourceFilter } from '../src/lib/server/engine/priceQuantileService';

const args = process.argv.slice(2);
const excludeSources: string[] = [];

for (const arg of args) {
  if (arg.startsWith('--exclude-source=')) {
    excludeSources.push(arg.slice('--exclude-source='.length));
  }
}

const sourceFilter: QuantileSourceFilter | undefined =
  excludeSources.length > 0 ? { exclude: excludeSources } : undefined;

console.log('Recomputing price quantiles...');
if (sourceFilter) {
  console.log(`  Source filter: exclude ${sourceFilter.exclude!.join(', ')}`);
}

const result = await recomputeQuantiles(undefined, sourceFilter);

const coldCount = result.snapshots.filter((s) => s.coldStart).length;
console.log(
  `Done in ${result.durationMs}ms: ${result.snapshots.length} snapshots computed, ${coldCount} cold-start.`,
);
