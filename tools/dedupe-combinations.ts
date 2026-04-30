// Remove duplicate saved tradeup combinations.
//
// Two combinations are "duplicates" when they share a structural signature:
// same input rarity, target rarity, and the same set of (catalogSkinId,
// collection, floatValue, price) input rows. Title and computed profit
// numbers are derived from these fields, so they're not part of the key.
//
// For each duplicate group, the representative is the active row (if any),
// otherwise the most recently created. All other rows in the group are
// deleted (TradeupCombinationInput / TradeupCombinationSnapshot cascade via
// the schema).
//
// Usage:
//   bun run tools/dedupe-combinations.ts            # dry run, no writes
//   bun run tools/dedupe-combinations.ts --apply    # delete duplicates

import { db } from '../src/lib/server/db/client';

const apply = process.argv.includes('--apply');

const rows = await db.tradeupCombination.findMany({
  include: { inputs: { orderBy: { slotIndex: 'asc' } } },
});

interface Row {
  id: string;
  isActive: boolean;
  createdAt: Date;
  tradeupLabId: number | null;
}

const groups = new Map<string, Row[]>();
for (const row of rows) {
  const sig = signatureFor(row);
  const list = groups.get(sig);
  const lite: Row = {
    id: row.id,
    isActive: row.isActive,
    createdAt: row.createdAt,
    tradeupLabId: row.tradeupLabId,
  };
  if (list) list.push(lite);
  else groups.set(sig, [lite]);
}

let dupGroups = 0;
let toDelete = 0;
const deleteIds: string[] = [];
for (const list of groups.values()) {
  if (list.length === 1) continue;
  dupGroups++;
  list.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
  const [rep, ...rest] = list;
  toDelete += rest.length;
  for (const dupe of rest) deleteIds.push(dupe.id);
  console.log(
    `signature group: keeping ${labelFor(rep)} (${rep.isActive ? 'active' : 'newest'}); ` +
      `removing ${rest.length} dupes: ${rest.map(labelFor).join(', ')}`,
  );
}

console.log('---');
console.log(`Total combinations: ${rows.length}`);
console.log(`Duplicate groups: ${dupGroups}`);
console.log(`Rows to delete: ${toDelete}`);

if (!apply) {
  console.log('\nDry run. Re-run with --apply to delete.');
  process.exit(0);
}

if (deleteIds.length === 0) {
  console.log('Nothing to delete.');
  process.exit(0);
}

const result = await db.tradeupCombination.deleteMany({
  where: { id: { in: deleteIds } },
});
console.log(`Deleted ${result.count} duplicate combination${result.count === 1 ? '' : 's'}.`);

function signatureFor(row: {
  inputRarity: string;
  targetRarity: string;
  inputs: Array<{
    catalogSkinId: string | null;
    collection: string;
    floatValue: number | null;
    price: { toString(): string };
  }>;
}): string {
  const parts = row.inputs
    .map((i) => {
      const ident = i.catalogSkinId ?? `c:${i.collection}`;
      const fl = i.floatValue != null ? i.floatValue.toFixed(4) : '';
      const priceNum = Number(i.price.toString());
      const pr = Number.isFinite(priceNum) ? priceNum.toFixed(2) : '';
      return `${ident}|${fl}|${pr}`;
    })
    .sort()
    .join(';');
  return `${row.inputRarity}>${row.targetRarity}::${parts}`;
}

function labelFor(row: Row): string {
  return row.tradeupLabId != null ? `#${row.tradeupLabId}` : row.id.slice(0, 10);
}
