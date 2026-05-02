// Enumerate static Tier-0 trade-up combos from the committed catalog snapshot.
//
// Usage:
//   bun run tools/enumerate-combos.ts
//   bun run tools/enumerate-combos.ts --dry-run --rarity=RESTRICTED --collection=set_mirage
//   bun run tools/enumerate-combos.ts --estimate-only --max-distinct-collections=2

import {
  enumerateCombos,
  estimateCombos,
  TRADEUP_INPUT_RARITIES,
  type EnumerateEstimate,
  type EnumerateProgress,
} from '../src/lib/server/engine/comboEnumerator';
import { getCatalogSnapshot } from '../src/lib/server/catalog/catalogService';
import { ITEM_RARITIES, type ItemRarity } from '../src/lib/types/enums';

const args = parseArgs(process.argv.slice(2));
let progressRendered = false;
let lastProgressLineLength = 0;
const commonOptions = {
  inputRarities: args.rarity ? [args.rarity] : undefined,
  statTrakValues: args.statTrak == null ? undefined : [args.statTrak],
  collectionIds: args.collection ? [args.collection] : undefined,
  maxCollectionsPerPartition: args.maxCollectionsPerPartition,
  keepNonAnchorMultiCollection: args.keepNonAnchorMultiCollection,
  maxCombos: args.maxCombos,
};
const snapshot = await getCatalogSnapshot();
const estimate = estimateCombos(snapshot, commonOptions);
renderEstimate(estimate);

if (args.estimateOnly) {
  process.exit(0);
}

if (estimate.totalCombos > args.largeRunLimit && !args.forceLargeRun) {
  console.error(
    [
      `Refusing to start: estimated combo count ${formatCount(estimate.totalCombos)} exceeds safety limit ${formatCount(args.largeRunLimit)}.`,
      'Narrow the run with --rarity, --collection, --normal/--stat-trak, or --max-distinct-collections.',
      'Use --force-large-run only when you intentionally want to run this full estimate.',
    ].join('\n'),
  );
  process.exit(1);
}

const result = await enumerateCombos(args.catalogVersion, {
  dryRun: args.dryRun,
  ...commonOptions,
  onProgress: renderProgress,
});

if (progressRendered) {
  process.stdout.write('\n');
}

console.log(`Catalog version: ${result.catalogVersion}`);
console.log(`Generated: ${result.generated}`);
console.log(args.dryRun ? `Dry run skipped writes: ${result.skipped}` : `Written: ${result.written} · skipped existing: ${result.skipped}`);
console.log('');
console.log('Counts by rarity / StatTrak:');

const countByKey = new Map(result.counts.map((count) => [`${count.inputRarity}:${count.statTrak}`, count.combos]));
for (const rarity of args.rarity ? [args.rarity] : TRADEUP_INPUT_RARITIES) {
  for (const statTrak of args.statTrak == null ? [false, true] : [args.statTrak]) {
    console.log(`${rarity.padEnd(18)} ${statTrak ? 'StatTrak' : 'Normal  '} ${countByKey.get(`${rarity}:${statTrak}`) ?? 0}`);
  }
}

interface Args {
  dryRun: boolean;
  rarity?: ItemRarity;
  statTrak?: boolean;
  collection?: string;
  catalogVersion?: string;
  maxCollectionsPerPartition?: number;
  estimateOnly: boolean;
  forceLargeRun: boolean;
  largeRunLimit: number;
  maxCombos?: number;
  keepNonAnchorMultiCollection?: boolean;
}

function renderEstimate(estimate: EnumerateEstimate): void {
  console.log(
    `Estimated partitions: ${formatCount(estimate.totalPartitions)} · estimated combos: ${formatCount(estimate.totalCombos)}`,
  );
}

function renderProgress(progress: EnumerateProgress): void {
  const overshoot = progress.estimatedTotal > 0 && progress.generated > progress.estimatedTotal;
  // When the actual count exceeds the estimate, the bar would peg at 100%
  // and ETA would read 0s — both misleading. Inflate the denominator by 25%
  // beyond the current count so the bar continues moving and ETA stays
  // meaningful. Annotate the percentage with ">" so the operator can see
  // we've outrun the estimate.
  const denominator = overshoot
    ? Math.max(progress.generated * 1.25, progress.estimatedTotal)
    : Math.max(progress.estimatedTotal, progress.generated, 1);
  const ratio = progress.generated / denominator;
  const barWidth = 24;
  const filled = Math.min(barWidth, Math.round(ratio * barWidth));
  const bar = `${'#'.repeat(filled)}${'-'.repeat(barWidth - filled)}`;
  const elapsed = formatDuration(progress.elapsedMs);
  const remainingEstimate = denominator - progress.generated;
  const eta = progress.generated > 0 && remainingEstimate > 0
    ? formatDuration((progress.elapsedMs / progress.generated) * remainingEstimate)
    : '0s';
  const phase =
    progress.currentInputRarity == null
      ? 'starting'
      : `${progress.currentInputRarity}/${progress.currentStatTrak ? 'StatTrak' : 'Normal'}`;
  const pctLabel = `${overshoot ? '>' : ' '}${(ratio * 100).toFixed(1).padStart(5)}%`;
  const line =
    `[${bar}] ${pctLabel} ` +
    `generated ${formatCount(progress.generated)}/${formatCount(denominator)} ` +
    `written ${formatCount(progress.written)} · ${phase} · elapsed ${elapsed} · eta ${eta}`;

  progressRendered = true;
  // Always overwrite-in-place. `bun run` reports isTTY=false even in real
  // terminals, and PowerShell/bash/cmd all honor \r correctly. CI environments
  // that genuinely strip CR will still see the bar progress (just messily) —
  // acceptable trade vs. spamming every progress line during a normal run.
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

function parseArgs(argv: string[]): Args {
  const args: Args = {
    dryRun: false,
    estimateOnly: false,
    forceLargeRun: false,
    largeRunLimit: 500_000,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (arg === '--stat-trak') {
      args.statTrak = true;
      continue;
    }
    if (arg === '--normal') {
      args.statTrak = false;
      continue;
    }
    if (arg === '--estimate-only') {
      args.estimateOnly = true;
      continue;
    }
    if (arg === '--force-large-run') {
      args.forceLargeRun = true;
      continue;
    }
    if (arg === '--keep-non-anchor-multi') {
      args.keepNonAnchorMultiCollection = true;
      continue;
    }

    const [key, value] = arg.split('=', 2);
    if (!value) {
      throw new Error(`Unsupported argument: ${arg}`);
    }

    switch (key) {
      case '--rarity':
        args.rarity = parseRarity(value);
        break;
      case '--collection':
        args.collection = value;
        break;
      case '--catalog-version':
        args.catalogVersion = value;
        break;
      case '--max-distinct-collections':
        args.maxCollectionsPerPartition = parsePositiveInteger(value, key);
        break;
      case '--large-run-limit':
        args.largeRunLimit = parsePositiveInteger(value, key);
        break;
      case '--max-combos':
        args.maxCombos = parsePositiveInteger(value, key);
        break;
      default:
        throw new Error(`Unsupported argument: ${arg}`);
    }
  }

  return args;
}

function parseRarity(value: string): ItemRarity {
  const rarity = value.toUpperCase() as ItemRarity;
  if (!ITEM_RARITIES.includes(rarity)) {
    throw new Error(`Invalid rarity: ${value}`);
  }
  if (!TRADEUP_INPUT_RARITIES.includes(rarity)) {
    throw new Error(`Rarity is not trade-up input eligible: ${value}`);
  }
  return rarity;
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}
