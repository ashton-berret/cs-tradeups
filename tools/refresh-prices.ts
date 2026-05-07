// Refresh targeted Steam Market price observations without the dev server.
//
// Usage:
//   bun run tools/refresh-prices.ts
//   bun run tools/refresh-prices.ts --list-engine-collections
//   bun run tools/refresh-prices.ts --preview --engine-only --engine-collection="The Snakebite Collection"
//   bun run tools/refresh-prices.ts --engine-only --engine-collection=set_community_8 --limit=25
//   bun run tools/refresh-prices.ts --engine-only --loop
//
// This runs the same local job as POST /api/market-prices/refresh and writes
// directly through Prisma. It reads prices only; buying/selling remains manual.

import { getCatalogSnapshot } from '../src/lib/server/catalog/catalogService';
import { db } from '../src/lib/server/db/client';
import { buildMarketPriceWatchlist } from '../src/lib/server/marketPrices/watchlist';
import { refreshMarketPricesAndDependents } from '../src/lib/server/marketPrices/refreshService';
import type { MarketPriceRefreshProgress } from '../src/lib/server/marketPrices/refreshJob';

const DEFAULT_ENGINE_BATCH_LIMIT = 500;
const DEFAULT_ENGINE_DELAY_MS = 6000;
const DEFAULT_ENGINE_RECENT_SKIP_MS = 14 * 24 * 60 * 60 * 1000;
const DEFAULT_LOOP_INTERVAL_MS = 3 * 60 * 60 * 1000;

const options = parseArgs(process.argv.slice(2));
let progressRendered = false;
let lastProgressLineLength = 0;
let stopping = false;

process.on('SIGINT', () => {
  if (stopping) process.exit(1);
  stopping = true;
  console.log('\n[refresh-prices] stopping after current sweep...');
});
process.on('SIGTERM', () => {
  stopping = true;
});

if (options.help) {
  printUsage();
  process.exit(0);
}

if (options.listEngineCollections) {
  await printEngineCollections();
  process.exit(0);
}

const engineCollectionIds = await resolveEngineCollectionInputs(options.engineCollections);
applySafeEngineDefaults(options);

if (options.preview) {
  const watchlist = await buildMarketPriceWatchlist({
    engineOnly: options.engineOnly,
    engineCollectionIds,
  });
  const names = options.limit == null
    ? watchlist.marketHashNames
    : watchlist.marketHashNames.slice(0, options.limit);

  console.log(`Watchlist: ${names.length} item${names.length === 1 ? '' : 's'}`);
  console.log(`Source counts: ${JSON.stringify(watchlist.counts, null, 2)}`);
  if (options.limit != null && watchlist.marketHashNames.length > options.limit) {
    console.log(`Limited from ${watchlist.marketHashNames.length} total item${watchlist.marketHashNames.length === 1 ? '' : 's'}.`);
  }
  for (const name of names.slice(0, 25)) {
    console.log(`  ${name}`);
  }
  if (names.length > 25) {
    console.log(`  ... ${names.length - 25} more`);
  }
  process.exit(0);
}

if (options.loop) {
  console.log(
    `[refresh-prices] loop starting; interval=${formatDuration(options.loopIntervalMs)} ` +
      `(Ctrl+C to stop)`,
  );
  while (!stopping) {
    await runRefresh();
    if (stopping) break;
    console.log(`[refresh-prices] sleeping ${formatDuration(options.loopIntervalMs)}...`);
    await sleep(options.loopIntervalMs);
  }
  console.log('[refresh-prices] loop stopped');
} else {
  const hadErrors = await runRefresh();
  if (hadErrors) {
    process.exitCode = 1;
  }
}

async function runRefresh(): Promise<boolean> {
  progressRendered = false;
  lastProgressLineLength = 0;

  console.log(
    `[refresh-prices] starting sweep: limit=${options.limit ?? 'none'} ` +
      `delay=${options.delayMs ?? 3000}ms recentSkip=${formatDuration(options.recentSkipMs ?? 30 * 60 * 1000)}`,
  );

  const result = await refreshMarketPricesAndDependents({
    notes: options.notes,
    prices: {
      watchlist: {
        engineOnly: options.engineOnly,
        engineCollectionIds,
      },
      limit: options.limit,
      recentSkipMs: options.recentSkipMs,
      steam: options.delayMs == null ? undefined : { delayMs: options.delayMs },
      stopOnRateLimit: options.stopOnRateLimit,
      maxConsecutiveRateLimitErrors: options.maxConsecutiveRateLimitErrors,
      onProgress: renderProgress,
    },
  });

  if (progressRendered) {
    process.stdout.write('\n');
  }

  for (const summary of result.prices.summaries) {
    console.log(
      `${summary.adapter}: ${summary.written} written, ${summary.skipped} skipped, ${summary.requested} requested, ${summary.errors.length} errors`,
    );
    if (summary.stoppedEarlyReason) {
      console.log(`  ${summary.stoppedEarlyReason}`);
    }
    for (const error of summary.errors.slice(0, options.maxPrintedErrors)) {
      console.log(`  ${error.marketHashName}: ${error.message}`);
    }
    if (summary.errors.length > options.maxPrintedErrors) {
      console.log(`  ... ${summary.errors.length - options.maxPrintedErrors} more errors`);
    }
  }

  console.log(
    `Dependents: ${result.dependents.candidatesReevaluated} candidates, ${result.dependents.basketsRecomputed} baskets, ${result.dependents.basketErrors.length} basket errors`,
  );

  return result.prices.summaries.some((summary) => summary.errors.length > 0);
}

function renderProgress(progress: MarketPriceRefreshProgress): void {
  const denominator = Math.max(progress.total, 1);
  const ratio = progress.processed / denominator;
  const barWidth = 24;
  const filled = Math.min(barWidth, Math.round(ratio * barWidth));
  const bar = `${'#'.repeat(filled)}${'-'.repeat(barWidth - filled)}`;
  const remaining = progress.total - progress.processed;
  const eta =
    progress.processed > 0 && remaining > 0
      ? formatDuration((progress.elapsedMs / progress.processed) * remaining)
      : '0s';
  const current = progress.currentMarketHashName
    ? truncate(progress.currentMarketHashName, 42)
    : 'starting';
  const line =
    `[${bar}] ${(ratio * 100).toFixed(1).padStart(5)}% ` +
    `${formatCount(progress.processed)}/${formatCount(progress.total)} ` +
    `written ${formatCount(progress.written)} · skipped ${formatCount(progress.skipped)} · errors ${formatCount(progress.errors)} ` +
    `· elapsed ${formatDuration(progress.elapsedMs)} · eta ${eta} · ${current}`;

  progressRendered = true;
  const padding = ' '.repeat(Math.max(0, lastProgressLineLength - line.length));
  process.stdout.write(`\r${line}${padding}`);
  lastProgressLineLength = line.length;
}

function formatCount(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

interface CliOptions {
  engineOnly: boolean;
  engineCollections: string[];
  limit?: number;
  delayMs?: number;
  recentSkipMs?: number;
  preview: boolean;
  loop: boolean;
  loopIntervalMs: number;
  help: boolean;
  listEngineCollections: boolean;
  notes?: string;
  stopOnRateLimit: boolean;
  maxConsecutiveRateLimitErrors: number;
  maxPrintedErrors: number;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    engineOnly: false,
    engineCollections: [],
    preview: false,
    loop: false,
    loopIntervalMs: DEFAULT_LOOP_INTERVAL_MS,
    help: false,
    listEngineCollections: false,
    stopOnRateLimit: true,
    maxConsecutiveRateLimitErrors: 3,
    maxPrintedErrors: 25,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const [flag, inlineValue] = arg.split('=', 2);
    const readValue = () => inlineValue ?? args[++index] ?? '';

    switch (flag) {
      case '--engine-only':
        options.engineOnly = true;
        break;
      case '--engine-collection':
      case '--collection':
        options.engineCollections.push(...splitCsv(readValue()));
        break;
      case '--limit':
        options.limit = parsePositiveInteger(readValue(), '--limit');
        break;
      case '--delay-ms':
        options.delayMs = parseNonNegativeInteger(readValue(), '--delay-ms');
        break;
      case '--recent-skip-ms':
        options.recentSkipMs = parseNonNegativeInteger(readValue(), '--recent-skip-ms');
        break;
      case '--recent-skip-hours':
        options.recentSkipMs = parseNonNegativeInteger(readValue(), '--recent-skip-hours') * 60 * 60 * 1000;
        break;
      case '--recent-skip-days':
        options.recentSkipMs = parseNonNegativeInteger(readValue(), '--recent-skip-days') * 24 * 60 * 60 * 1000;
        break;
      case '--max-consecutive-429':
        options.maxConsecutiveRateLimitErrors = parsePositiveInteger(readValue(), '--max-consecutive-429');
        break;
      case '--no-stop-on-429':
        options.stopOnRateLimit = false;
        break;
      case '--max-printed-errors':
        options.maxPrintedErrors = parseNonNegativeInteger(readValue(), '--max-printed-errors');
        break;
      case '--preview':
      case '--dry-run':
        options.preview = true;
        break;
      case '--loop':
        options.loop = true;
        break;
      case '--interval':
      case '--loop-interval':
        options.loopIntervalMs = parseIntervalMs(readValue(), flag);
        break;
      case '--notes':
        options.notes = readValue();
        break;
      case '--list-engine-collections':
        options.listEngineCollections = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  options.engineCollections = [...new Set(options.engineCollections)].sort((a, b) =>
    a.localeCompare(b),
  );
  return options;
}

function applySafeEngineDefaults(options: CliOptions): void {
  if (!options.engineOnly) return;
  options.limit ??= DEFAULT_ENGINE_BATCH_LIMIT;
  options.delayMs ??= DEFAULT_ENGINE_DELAY_MS;
  options.recentSkipMs ??= DEFAULT_ENGINE_RECENT_SKIP_MS;
}

async function resolveEngineCollectionInputs(inputs: string[]): Promise<string[]> {
  if (inputs.length === 0) return [];

  const catalog = await getCatalogSnapshot();
  const engineCollectionIds = await listEngineCollectionIds();
  const engineCollections = catalog.collections.filter((collection) =>
    engineCollectionIds.has(collection.id),
  );
  const resolved: string[] = [];

  for (const input of inputs) {
    const normalized = normalizeCollectionLookup(input);
    const exact = engineCollections.find(
      (collection) =>
        normalizeCollectionLookup(collection.id) === normalized ||
        normalizeCollectionLookup(collection.name) === normalized,
    );
    if (exact) {
      resolved.push(exact.id);
      continue;
    }

    const partialMatches = engineCollections.filter(
      (collection) =>
        normalizeCollectionLookup(collection.id).includes(normalized) ||
        normalizeCollectionLookup(collection.name).includes(normalized),
    );
    if (partialMatches.length === 1) {
      resolved.push(partialMatches[0].id);
      continue;
    }

    if (partialMatches.length > 1) {
      throw new Error(
        `Ambiguous collection "${input}". Matches: ${partialMatches
          .slice(0, 10)
          .map((collection) => `${collection.name} (${collection.id})`)
          .join(', ')}${partialMatches.length > 10 ? ', ...' : ''}`,
      );
    }

    throw new Error(
      `Unknown engine collection "${input}". Run: bun run tools/refresh-prices.ts --list-engine-collections`,
    );
  }

  return [...new Set(resolved)].sort((a, b) => a.localeCompare(b));
}

async function printEngineCollections(): Promise<void> {
  const catalog = await getCatalogSnapshot();
  const engineCollectionIds = await listEngineCollectionIds();
  const collections = catalog.collections
    .filter((collection) => engineCollectionIds.has(collection.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  console.log(`Engine collections: ${collections.length}`);
  for (const collection of collections) {
    console.log(`${collection.id.padEnd(24)} ${collection.name}`);
  }
}

async function listEngineCollectionIds(): Promise<Set<string>> {
  const rows = await db.$queryRaw<Array<{ collectionId: string }>>`
    SELECT DISTINCT collection.value AS "collectionId"
    FROM "TradeupComboBase" b
    JOIN json_each(b."collections") collection
    WHERE b."catalogVersion" = (
      SELECT latest."catalogVersion"
      FROM "TradeupComboBase" latest
      ORDER BY latest."createdAt" DESC
      LIMIT 1
    )
      AND typeof(collection.value) = 'text'
    ORDER BY collection.value ASC
  `;

  return new Set(rows.map((row) => row.collectionId));
}

function normalizeCollectionLookup(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/^the\s+/, '')
    .replace(/\s+collection$/, '')
    .replace(/\band\b/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer.`);
  }
  return parsed;
}

function parseNonNegativeInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a non-negative integer.`);
  }
  return parsed;
}

function parseIntervalMs(value: string, flag: string): number {
  const match = value.match(/^(\d+)(ms|s|m|h|d)?$/);
  if (!match) {
    throw new Error(`${flag} must be an interval like 30m, 3h, or 1d.`);
  }
  const amount = parsePositiveInteger(match[1], flag);
  const unit = match[2] ?? 'ms';
  switch (unit) {
    case 'ms':
      return amount;
    case 's':
      return amount * 1000;
    case 'm':
      return amount * 60 * 1000;
    case 'h':
      return amount * 60 * 60 * 1000;
    case 'd':
      return amount * 24 * 60 * 60 * 1000;
    default:
      throw new Error(`${flag} has unsupported interval unit.`);
  }
}

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

function printUsage() {
  console.log(`Usage:
  bun run tools/refresh-prices.ts [options]

Options:
  --preview                         Build and print the watchlist without fetching Steam.
  --engine-only                     Exclude active plans/candidates/inventory from the watchlist.
                                    Defaults to --limit=500 --delay-ms=6000 --recent-skip-days=14.
  --engine-collection=<id|name>      Limit engine combo outputs to combo collections.
                                    Accepts IDs, exact names, or unique partial names.
  --list-engine-collections         Print valid engine collection IDs and names.
  --limit=<n>                       Refresh only the first n market hashes.
  --delay-ms=<n>                    Override Steam request delay for local testing.
  --recent-skip-hours=<n>           Skip items observed in the last n hours.
  --recent-skip-days=<n>            Skip items observed in the last n days.
  --loop                            Repeat sweeps until stopped.
  --interval=<duration>             Loop interval, e.g. 30m, 3h, 1d. Default 3h.
  --max-consecutive-429=<n>         Stop after this many consecutive Steam 429s (default 3).
  --no-stop-on-429                  Keep going after Steam 429s. Not recommended.
  --max-printed-errors=<n>          Limit per-item errors printed after the run (default 25).
  --notes=<text>                    Store notes on the MarketPriceSweep row.
  --help                            Show this message.
`);
}
