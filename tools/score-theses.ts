#!/usr/bin/env bun
import { parseArgs } from 'node:util';
import { scoreTheses, SCORE_VERSION } from '../src/lib/server/engine/thesisScorer';
import type { ItemRarity } from '../src/lib/types/enums';

const { values } = parseArgs({
  options: {
    rarity: { type: 'string' },
    'stat-trak': { type: 'boolean', default: false },
    normal: { type: 'boolean', default: false },
    collection: { type: 'string', multiple: true },
    'catalog-version': { type: 'string' },
    'max-missing-pct': { type: 'string' },
    limit: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
  strict: false,
});

if (values.help) {
  console.log(`
Usage: bun run tools/score-theses.ts [options]

Score enumerated combos against latest price quantiles to produce ranked theses.

Options:
  --rarity <RARITY>         Filter to a specific input rarity (MIL_SPEC, RESTRICTED, etc.)
  --stat-trak               Only score StatTrak combos
  --normal                  Only score non-StatTrak combos
  --collection <ID>         Filter to combos involving this collection (repeatable)
  --catalog-version <VER>   Target a specific catalog version
  --max-missing-pct <0-1>   Max fraction of missing output prices to tolerate (default: 0.5)
  --limit <N>               Max combos to process
  -h, --help                Show this help

Score version: ${SCORE_VERSION}
`);
  process.exit(0);
}

const inputRarities = values.rarity ? [values.rarity as ItemRarity] : undefined;
const statTrakValues =
  values['stat-trak'] && !values.normal ? [true]
  : values.normal && !values['stat-trak'] ? [false]
  : undefined;
const collectionIds = (values.collection as string[] | undefined)?.length
  ? (values.collection as string[])
  : undefined;

console.log(`\n🔬 Scoring theses (${SCORE_VERSION})...`);
if (inputRarities) console.log(`   Rarity filter: ${inputRarities.join(', ')}`);
if (statTrakValues) console.log(`   StatTrak: ${statTrakValues[0] ? 'yes' : 'no'}`);
if (collectionIds) console.log(`   Collections: ${collectionIds.join(', ')}`);

const startedAt = Date.now();

const result = await scoreTheses({
  inputRarities,
  statTrakValues,
  collectionIds,
  catalogVersion: values['catalog-version'] as string | undefined,
  maxMissingOutputPricePct: values['max-missing-pct'] ? Number(values['max-missing-pct']) : undefined,
  limit: values.limit ? Number(values.limit) : undefined,
  onProgress: (p) => {
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    process.stdout.write(
      `\r   [${elapsed}s] Processed: ${p.processed} | Scored: ${p.scored} | Skipped: ${p.skipped}`,
    );
  },
});

console.log(`\n\n✅ Scoring complete in ${(result.durationMs / 1000).toFixed(1)}s`);
console.log(`   Processed: ${result.processed}`);
console.log(`   Scored:    ${result.scored}`);
console.log(`   Skipped:   ${result.skipped} (insufficient price data)`);
