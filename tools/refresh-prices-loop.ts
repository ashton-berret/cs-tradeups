// Long-running daily sweep for Steam market prices.
//
// Usage:
//   bun run tools/refresh-prices-loop.ts
//   bun run tools/refresh-prices-loop.ts --interval 12h
//
// Stays in the foreground; SIGINT (Ctrl+C) exits cleanly.

import { refreshMarketPricesAndDependents } from '../src/lib/server/marketPrices/refreshService';

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;

const intervalMs = parseInterval(process.argv) ?? DEFAULT_INTERVAL_MS;

let stopping = false;
process.on('SIGINT', () => {
  if (stopping) process.exit(1);
  stopping = true;
  console.log('\n[refresh-prices-loop] stopping after current sweep…');
});
process.on('SIGTERM', () => {
  stopping = true;
});

console.log(
  `[refresh-prices-loop] starting; interval=${formatInterval(intervalMs)} (Ctrl+C to stop)`,
);

while (!stopping) {
  const startedAt = new Date();
  console.log(`[refresh-prices-loop] sweep starting at ${startedAt.toISOString()}`);

  try {
    const result = await refreshMarketPricesAndDependents({ trigger: 'LOOP' });
    const written = result.prices.summaries.reduce((s, x) => s + x.written, 0);
    const skipped = result.prices.summaries.reduce((s, x) => s + x.skipped, 0);
    const requested = result.prices.summaries.reduce((s, x) => s + x.requested, 0);
    const errors = result.prices.summaries.reduce((s, x) => s + x.errors.length, 0);
    console.log(
      `[refresh-prices-loop] done: ${written} written, ${skipped} skipped, ${requested} requested, ${errors} errors; ` +
        `${result.dependents.candidatesReevaluated} candidates, ${result.dependents.basketsRecomputed} baskets`,
    );
  } catch (err) {
    console.error('[refresh-prices-loop] sweep failed:', err);
  }

  if (stopping) break;
  await sleep(intervalMs);
}

console.log('[refresh-prices-loop] stopped');
process.exit(0);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const handle = setTimeout(resolve, ms);
    const cancel = () => {
      clearTimeout(handle);
      resolve();
    };
    process.once('SIGINT', cancel);
    process.once('SIGTERM', cancel);
  });
}

function parseInterval(argv: string[]): number | null {
  const idx = argv.findIndex((a) => a === '--interval' || a === '-i');
  if (idx < 0 || idx + 1 >= argv.length) return null;
  const raw = argv[idx + 1];
  const match = raw.match(/^(\d+)(ms|s|m|h|d)?$/);
  if (!match) {
    console.warn(`[refresh-prices-loop] could not parse --interval ${raw}; using default`);
    return null;
  }
  const value = Number(match[1]);
  const unit = match[2] ?? 'ms';
  switch (unit) {
    case 'ms':
      return value;
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}

function formatInterval(ms: number): string {
  if (ms % (24 * 60 * 60 * 1000) === 0) return `${ms / (24 * 60 * 60 * 1000)}d`;
  if (ms % (60 * 60 * 1000) === 0) return `${ms / (60 * 60 * 1000)}h`;
  if (ms % (60 * 1000) === 0) return `${ms / (60 * 1000)}m`;
  return `${ms}ms`;
}
