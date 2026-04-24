# CS2 Catalog Pipeline

**Last Updated:** 2026-04-24

## Purpose

This slice adds a reproducible static CS2 catalog pipeline that uses the
local game install as the primary source of truth and keeps that catalog
separate from dynamic candidate, listing, and inventory data.

The catalog itself is served from a generated snapshot file, not from runtime
database tables. Dynamic rows can store nullable catalog identity references
so evaluation code can prefer stable IDs without mixing static catalog data
into operator-owned state.

## Source Of Truth

Primary source files come from the local CS2 install:

- `D:\SteamLibrary\steamapps\common\Counter-Strike Global Offensive\game\csgo\pak01_dir.vpk`
  entry `scripts/items/items_game.txt`
- `D:\SteamLibrary\steamapps\common\Counter-Strike Global Offensive\game\csgo\pak01_dir.vpk`
  entry `resource/csgo_english.txt`

The importer reads those VPK entries directly and derives the catalog by:

1. parsing Valve KeyValues text from the VPK payloads
2. merging repeated top-level sections such as `items`, `item_sets`,
   `paint_kits`, and `paint_kits_rarity`
3. resolving weapon/item prefab inheritance so base weapon definitions
   expose stable `defIndex`, `item_class`, and localized market names
4. joining `item_sets` to `paint_kits` to derive collection-linked skins
5. deriving exterior compatibility from per-skin `wear_remap_min` /
   `wear_remap_max`

The app does **not** read raw Valve files at runtime. The normalized
snapshot is the app-facing boundary.

## Snapshot Shape

Generated file:

- `src/lib/server/catalog/generated/cs2-catalog.snapshot.json`

Top-level entities:

- `collections`
  - `id`, `key`, `itemSetKey`, `name`, `skinCount`
  - `source`
- `weapons`
  - `defIndex`, `key`, `className`, `marketName`
  - `source`
- `paintKits`
  - `paintIndex`, `key`, `name`, `descriptionTag`
  - `rarity`
  - `minFloat`, `maxFloat`
  - `exteriors`
  - `weaponDefIndexes`
  - `collectionIds`
  - `source`
- `skins`
  - `id` = `${defIndex}:${paintIndex}`
  - `defIndex`, `paintIndex`
  - `weaponKey`, `weaponName`, `skinName`
  - `baseMarketHashName`
  - `collectionId`, `collectionName`
  - `rarity`
  - `minFloat`, `maxFloat`
  - `exteriors`
  - `marketHashNames[]` for normalized market-hash names per exterior
  - `source`

Stable identifiers:

- weapon identity: `defIndex`
- paint identity: `paintIndex`
- concrete weapon-finish identity: `id = defIndex:paintIndex`

Provenance:

- snapshot-level `sourceFiles[]` records the VPK path, entry path, file
  timestamp, and SHA-256 of the extracted entry payload
- entity-level `source.details[]` records which source sections produced
  the normalized row

## Importer Workflow

Tooling lives in:

- `tools/cs2-catalog/vpk.ts`
- `tools/cs2-catalog/keyvalues.ts`
- `tools/cs2-catalog/import.ts`

Commands:

```bash
bun run catalog:inspect
bun run catalog:import
bun run catalog:backfill-db
```

Optional custom path:

```bash
bunx tsx tools/cs2-catalog/import.ts --game-path "D:\SteamLibrary\steamapps\common\Counter-Strike Global Offensive"
```

Pipeline stages:

1. local CS2 VPK entries
2. normalized snapshot JSON
3. app loader in `src/lib/server/catalog/catalogService.ts`
4. read-only endpoints:
   - `GET /api/catalog`
   - `GET /api/catalog/summary`

## App Availability

Runtime access is through the server-layer loader:

- `src/lib/server/catalog/catalogService.ts`

This loader:

- validates the snapshot with Zod on read
- caches by file mtime
- exposes the full snapshot and a lighter summary DTO

This keeps static catalog data isolated from:

- `CandidateListing`
- `InventoryItem`
- trade-up plans / baskets / executions

Those rows remain dynamic operator data.

## Dynamic Row Linkage

Dynamic rows use nullable additive columns for catalog identity:

- `CandidateListing` and `InventoryItem`
  - `catalogSkinId`
  - `catalogCollectionId`
  - `catalogWeaponDefIndex`
  - `catalogPaintIndex`
- `TradeupOutcomeItem`
  - `catalogSkinId`
  - `catalogCollectionId`
  - `catalogWeaponDefIndex`
  - `catalogPaintIndex`
- `TradeupPlanRule`
  - `catalogCollectionId`

Evaluation and basket-readiness logic prefer `catalogCollectionId` when both
sides have it, then fall back to legacy collection strings. Outcome EV
grouping uses the same preference. This keeps existing manual plans and
unmatched seed/filler rows valid while making real catalog-linked rows stable
across display-name drift.

For basket EV breakdowns, catalog-linked outcomes also provide min/max float
ranges and exterior-specific market hash names. The EV engine uses those to
project the output float/exterior from the basket average float. Estimated
market values remain operator-managed dynamic plan data; the catalog does not
provide prices.

## Rerun / Update Process

When CS2 updates or you want to refresh the catalog:

1. update the local CS2 install in Steam
2. run `bun run catalog:inspect` if you want to confirm the source shape
3. run `bun run catalog:import`
4. apply schema changes if needed:
   - `bunx prisma migrate deploy`
5. backfill dynamic rows into catalog identity columns:
   - `bun run catalog:backfill-db`
6. run verification:
   - `bun test tests/catalog/catalogSnapshot.test.ts`
   - `bun test tests/catalog/linkage.test.ts`
   - `bun test tests/evaluation/expectedValue.test.ts`
   - `bun test tests/evaluation/ruleMatching.test.ts`
   - `bun test tests/tradeups/basketReadiness.test.ts`
   - `bun run check`

If Valve changes the raw file layout again, update the importer and keep
the snapshot contract stable. Prefer extending the normalized snapshot or
adding an explicit overlay step over pushing raw-format assumptions into
app code.

## Current Assumptions

- Local CS2 VPK content is the primary catalog source.
- Historical collection membership is fully recoverable from the merged
  `item_sets` blocks in this current install.
- Exterior compatibility is computed from native `wear_remap_min` /
  `wear_remap_max`, not from global exterior bands alone.
- Dynamic price, liquidity, pattern, and marketplace listing data remain
  out of scope for this catalog slice.
- Candidate and inventory rows persist nullable catalog linkage columns so
  legacy/manual rows can remain unmatched without breaking workflows.
- Plan outcomes and plan rules persist nullable catalog linkage columns for
  stable matching and EV grouping, but their display strings remain for
  backward compatibility and operator readability.
- Catalog-linked basket EV can project output float/exterior, but projected
  exterior does not automatically change estimated outcome value until a
  dynamic price source exists.
