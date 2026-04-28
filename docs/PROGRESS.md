# CS Tradeups - Progress

## Status Snapshot

**Project Status:** Phases 0-7 complete; Phase 8 mostly complete. Current priority is the plan-targeted Steam discovery loop: the app should surface relevant listings for the operator to inspect and buy manually, not merely price known items.
**Last Updated:** 2026-04-28
**Plan Reference:** See `docs/PLAN.md`

---

## Current Reality

As of 2026-04-25, this repository has a Bun-managed SvelteKit app with a
local SQLite database, a real service layer, and a thin SvelteKit API layer
around the services.

What currently exists:

- `README.md` with only the project name.
- `docs/PLAN.md`, `docs/PROGRESS.md`, and `docs/UI_STYLE_GUIDE.md` as the
  active documentation set.
- SvelteKit + Svelte 5 + TypeScript scaffold.
- Bun lockfile and package metadata.
- TailwindCSS 4.x Vite plugin and theme CSS variables.
- Base app shell with fixed sidebar navigation and theme toggle.
- Full Phase 4 operator UI for dashboard, candidates, inventory, plans,
  baskets, executions, saved tradeups, market prices, buy queue, calculator,
  and catalog Explore.
- Reusable UI primitives: Button, Card, Input, Badge, Modal, DataTable,
  FilterBar, PaginationControl, StatusBadge, ConfirmModal, and numeric
  formatters.
- `.env.example` with the SQLite database URL shape.
- Prisma schema with 8 models, applied SQLite migration, Prisma client
  singleton, and seed script.
- Seeded local SQLite database at `prisma/dev.db`.
- Zod schemas and shared domain/service DTO types.
- Core domain services under `src/lib/server/**`.
- API route handlers under `src/routes/api/**`, with request validation,
  query coercion, shared error translation, and extension shared-secret
  auth.
- API route documentation in `src/routes/api/README.md`.
- Typed service errors for expected service-layer failures.
- Root-level `bun test` starter suite for pure evaluation, duplicate
  detection, CSV, and basket-readiness logic.
- CSV export endpoints for executions and expected-vs-realized reporting.
- ECharts-powered dashboard charts with table fallbacks.
- A local companion browser bridge under `tools/steam-market-bridge/` that
  extracts Steam Market listing rows, posts them to
  `POST /api/extension/candidates`, and now shows inline request/response
  diagnostics for ingestion and evaluation. The bridge now attaches to normal
  Steam listing rows even when float enrichment is absent, tolerates several
  CSFloat float-range attribute variants, preserves listing IDs when resolving
  inspect links, and surfaces normalization warning counts inline.
- Candidate ingestion diagnostics for duplicate reasoning, normalization
  warnings, and per-plan rule-match failures.
- Plan editor help text plus editable plan-rarity metadata in the plan card
  update flow.
- Static CS2 catalog pipeline sourced from the local game install:
  VPK extraction, KeyValues normalization, committed snapshot output, and
  read-only `/api/catalog` endpoints.
  Catalog rarity assignment now prefers `client_loot_lists` rarity buckets
  per weapon/paint-kit pair before falling back to `paint_kits_rarity`; this
  fixed case-collection trade-up tiers such as Chroma 3 Covert outputs.
- `/explore` provides an operator-facing catalog browser by collection,
  showing weapon, skin, rarity, float range, supported exteriors, item IDs,
  and market hash names.
- Candidate and inventory persistence now stores nullable catalog linkage
  fields (`catalogSkinId`, `catalogCollectionId`,
  `catalogWeaponDefIndex`, `catalogPaintIndex`) and a local backfill tool
  can normalize existing rows against the catalog snapshot.
- Trade-up plan outcomes now store nullable catalog linkage fields, plan
  rules store nullable `catalogCollectionId`, and evaluation/readiness logic
  prefers catalog collection IDs before falling back to legacy collection
  strings.
- Basket EV breakdowns project per-outcome output float/exterior from
  catalog skin min/max ranges when an outcome has `catalogSkinId`.
- Market price observations can now be stored locally for catalog-linked
  market hash names, and EV can prefer latest observed projected-exterior
  prices while falling back to plan-managed outcome values.
- Basket details show per-outcome EV pricing source, distinguishing observed
  market prices from plan fallback values.
- Market price observations carry freshness labels derived from `observedAt`,
  and price-driven UI surfaces show the label with a relative age subtext.
- Local price import normalization now lives behind a market price import
  adapter boundary, keeping JSON/CSV source parsing out of HTTP route logic.
- Successful price imports refresh open candidate evaluations and active
  basket metrics so imported prices are reflected in persisted EV fields.
- `/market-prices` surfaces import results as structured counts and includes
  a current-page source/currency/freshness summary above the observations
  table.
- Market price observations can be sorted by observed time, market value,
  source, or currency from the `/market-prices` filter bar.
- CSV price import accepts either a pasted CSV payload or an uploaded `.csv`
  file from the `/market-prices` page.
- `/market-prices` includes a manual Refresh EV action that re-evaluates open
  candidates and recomputes active baskets against stored observations without
  importing new prices.
- `/market-prices` exposes page-size selection for 25, 50, or 100 observation
  rows.
- The market price observation summary is now server-derived for all rows
  matching the active filters, not just the visible page.
- `/market-prices` defaults to showing the latest observation per
  market-hash/currency pair, with an option to inspect all historical
  observations.
- Import result cards include distinct imported item count and catalog-linked
  observation count.
- Market price observations now expose derived source metadata (`sourceType`
  and `sourceLabel`), and `/market-prices` offers observed source presets for
  filtering while preserving free-text source entry.
- `/market-prices` provides a utilitarian operator page for inspecting local
  price observations, filtering by search/source/currency, and importing JSON
  or CSV batches through `POST /api/market-prices/import`.
- The intended mature workflow is now documented as a self-sustaining
  trade-up hunting assistant: the operator maintains roughly five active
  plans, presses a discovery action, receives normalized candidate
  assignments and buy-queue guidance, and still performs the final Steam
  marketplace purchase action manually.
- Extension ingestion accepts typed float-enrichment metadata
  (`minFloat`, `maxFloat`, `paintIndex`) and returns warnings for
  contradictory extension metadata without rejecting the row.
- The Steam Market bridge surfaces whether a saved candidate was catalog
  linked or catalog unmatched in its inline row status.
- Global partition planner at `/buy-queue` with role badges, alternatives
  disclosure, and assignment-context-preserving Mark Bought wired to
  `markBought` (which best-effort reserves the new inventory item into the
  intended basket and surfaces a warning on conflict).
- Per-input wear-proportion EV math throughout the system. Per-skin float
  ranges from the catalog are loaded and used to normalize each input's
  float into its own range before averaging — basket builder, evaluation,
  and planner all agree.
- `CatalogCollectionSelect` combobox component with live-filtered dropdown
  suggestions, keyboard navigation, and Linked/Free badge. Wired into
  RuleEditor, PlanEditorModal, and OutcomeEditor so plan authoring no
  longer relies on free-text collection names.
- Plan creation is now a simplified single-collection operator flow:
  collection, input rarity, exterior condition, maximum input float, and
  maximum input price. The action derives target rarity, basket max price,
  a preferred 10-input rule, and catalog-linked outcome rows automatically.
- `/calculator` scratchpad page with `POST /api/tradeups/calculator`
  backend. Operator picks a plan, types up to 10 hypothetical inputs
  (collection + float + price), sees EV / per-collection chance /
  per-outcome contribution / cost / profit. Output exterior projection is
  intentionally skipped in v1; the warnings panel makes the limitation
  visible.
- Steam-first price refresh foundation: targeted `STEAM_PRICEOVERVIEW`
  watchlist refresh, `/market-prices` "Refresh Steam watchlist" action,
  `tools/refresh-prices.ts` CLI wrapper, Steam Market source labeling, and
  Steam-net EV basis labels.
- Discovery target foundation: `GET /api/discovery/targets` derives narrow
  Steam listing-page targets from active plan rules and current demand, and
  `/buy-queue` or the Steam Market bridge options page can run a paced collector that opens
  target pages, extracts visible rows, filters constraints, and submits
  matching candidates.

What does not exist yet:

- Svelte component tests beyond the combobox ranking heuristic.
- Automated end-to-end browser coverage for the companion bridge.
- Real-world Steam discovery soak testing and selector hardening for the new
  bridge collector run mode.
- Persistent discovery run logs and skip-reason analytics. Current run status
  is lightweight and extension/local-page driven.
- Optional external reference price adapters and marketplace history chart
  backfill.
- Real marketplace-volume liquidity signal. Liquidity still uses the
  candidate-density proxy.
- Watchlist combinations — no way yet to pin a buy-queue or calculator
  proposal and re-check it after a future price import.
- A dedicated `/catalog` route name. The current catalog browser is `/explore`.

---

## Phase Tracking

### Phase 0: Documentation Baseline

- [x] Planning documents established.
- [x] Scope boundaries defined.
- [x] Delivery phases defined.
- [x] Current repo state documented.

### Phase 1: Foundation

- [x] Initialize SvelteKit + TypeScript project.
- [x] Install dependencies with Bun (Prisma, Zod, TailwindCSS 4.x; ECharts
  deferred).
- [x] Configure Tailwind with CSS variables from `docs/UI_STYLE_GUIDE.md`.
- [x] Define Prisma schema (`prisma/schema.prisma`).
- [x] Create initial SQLite migration
  (`prisma/migrations/20260421000000_init/migration.sql`).
- [x] Apply initial migration to local SQLite.
- [x] Create Prisma client singleton (`src/lib/server/db/client.ts`).
- [x] Create seed data (`prisma/seed.ts`).
- [x] Run seed and verify local database.
- [x] Define shared enum constants (`src/lib/types/enums.ts`).
- [x] Define Zod schemas for all core payloads (`src/lib/schemas/`).
- [x] Define derived TypeScript types (`src/lib/types/domain.ts`).
- [x] Add service DTO and evaluation result types
  (`src/lib/types/services.ts`).
- [x] Add base layout, sidebar nav, and theme toggle.
- [x] Add `app.html` flash-prevention script.
- [x] Add basic reusable UI primitives.

### Phase 2: Core Domain Services

- [x] Candidate service implemented (`src/lib/server/candidates/`).
- [x] Inventory service implemented (`src/lib/server/inventory/`).
- [x] Trade-up plan service implemented
  (`src/lib/server/tradeups/planService.ts`).
- [x] Basket service implemented
  (`src/lib/server/tradeups/basketService.ts`).
- [x] Evaluation service implemented
  (`src/lib/server/tradeups/evaluation/`).
- [x] Execution service implemented
  (`src/lib/server/tradeups/executionService.ts`).
- [x] Analytics service implemented
  (`src/lib/server/analytics/analyticsService.ts`).
- [x] Server-layer contract notes added (`src/lib/server/README.md`).

### Phase 3: Ingestion And API Layer

- [x] Extension ingestion endpoint.
- [x] Candidate API routes.
- [x] Inventory API routes.
- [x] Plan API routes.
- [x] Basket API routes.
- [x] Evaluation API route.
- [x] Execution API routes.
- [x] Analytics endpoints.
- [x] Shared HTTP error translation.
- [x] Query-string coercion for filter schemas.
- [x] Extension shared-secret guard.
- [x] API route map and conventions documented.
- [x] `bun run check` passes with 0 errors and 0 warnings.
- [x] Dev-server smoke test verified seeded JSON from representative API
  endpoints.

### Phase 4: Operator UI

- [x] Dashboard.
- [x] Candidates page.
- [x] Inventory page.
- [x] Trade-up plans page.
- [x] Trade-up baskets page.
- [x] Executions page.

### Phase 5: Scoring And Workflow Refinement

- [x] Duplicate suppression refinement.
- [x] Basket-aware ranking.
- [x] Recommendation threshold tuning.
- [x] Bulk actions and workflow polish.
  - Keyboard shortcuts (`p`/`w`/`g`/`b`/`x`/`j`/`k`) and
    `KeyboardHintBar.svelte` from `docs/PHASE5_PLAN.md` §3.E.2 were
    deferred. Mouse-driven bulk selection and actions ship; the
    shortcut layer is a follow-up if the operator finds the
    selection ergonomics lacking.

### Phase 6: Quality And Decision Support

- [x] Workstream A: ECharts install and dashboard chart surfaces.
- [x] Workstream B: CSV export helpers.
- [x] Workstream C: Plan-aware inventory eligibility endpoint.
- [x] Workstream D: Typed service errors migration.
- [x] Workstream E: Automated test coverage with `bun test`.

### Phase 7: Planner And Buy Queue

- [x] `CandidateAssignment` view model.
- [x] `plannerService` with global partition optimization.
- [x] `GET /api/tradeups/buy-queue` endpoint.
- [x] `/buy-queue` operator page.
- [x] `markBought` carries assignment context into inventory/basket.
- [x] Planner unit tests including the 39+1 partition case.
- [x] End-to-end integration test of `buildBuyQueue` against a seeded SQLite DB.

### Phase 8: Catalog-Aware Authoring, Calculator, Saved Combinations, And Pricing

- [x] **Critical EV bug fix: per-input wearProportion averaging.** Shipped
  `wearProportion(float, min, max)` and `averageWearProportion(inputs)` in
  `utils/float.ts`; renamed `BasketEVOptions.averageInputFloat` →
  `averageWearProportion` so the semantics are explicit; added
  `inputMinFloat` / `inputMaxFloat` to `BasketSlotContext`; introduced
  `enrichSlotsWithInputRanges` helper that loads each slot's per-skin range
  from the catalog snapshot via `getCatalogSkinFloatRange`. Wired through
  `evaluationService.evaluateBasket`, `basketService.recomputeMetricsInTx`,
  and `partition.basketEV`. Slots without a catalog match get null ranges
  and the projection path skips output-exterior projection rather than
  approximate. 11 new unit tests cover the helpers, the corrected
  projection, and the missing-range fallback.
- [x] Bug fix: `partition.basketEV` now computes
  `averageWearProportion(slots)` and passes it to `computeBasketEV`, so the
  planner swap optimizer can see float-driven exterior pricing differences.
  Pool items carry `inputMinFloat` / `inputMaxFloat` populated during
  `buildPool` (now async).
- [x] `CatalogCollectionSelect` combobox component — text input with live
  filtering and dropdown suggestions backed by `/api/catalog/summary`,
  module-scoped fetch cache shared across instances, keyboard navigation
  (Arrow/Enter/Escape), and a Linked/Free badge that signals catalog
  linkage so the operator can see at a glance whether the rule will
  match by stable id. The submitted form value is the canonical
  collection name; planService already resolves `catalogCollectionId`
  from canonical text via `resolveCatalogCollectionIdentity`, so no
  schema or server changes were needed.
- [x] Wired combobox into `RuleEditor.svelte`, `PlanEditorModal.svelte`,
  and `OutcomeEditor.svelte` (replacing the free-text Input on
  `outcomeCollection`). Free typing remains valid for legacy rules; the
  Free/Linked badge surfaces the difference visually.
- [x] `CatalogSkinSelect` combobox for skin-level autocomplete, used by the
  calculator scratchpad so inputs can carry exact catalog skin identity.
- [x] `/calculator` scratchpad page: plan/ad-hoc modes, target/input rarity
  selectors, 10 hypothetical inputs, per-row skin selection, EV breakdown,
  total cost, expected profit, warnings, and save-as-combination.
  Endpoint: `POST /api/tradeups/calculator`.
- [x] Saved combinations: `TradeupCombination`, inputs, snapshots,
  `/tradeups/saved`, recheck flow, activate/delete actions, TradeUpLab import
  support, and thesis override for imported published numbers.
- [x] Steam-first price refresh foundation: targeted `STEAM_PRICEOVERVIEW`
  watchlist refresh, `/market-prices` UI, CLI wrapper, and Steam-net EV basis.
- [x] `/explore` catalog browser for skins/collections/rarities/floats.
- [x] Combobox ranking heuristic test (`tests/components/`).
- [x] Calculator and saved-combination integration tests.
- [x] Discovery-target derivation tests.

Legend: `[x]` = complete and verified at the current expected level;
`[ ]` = not implemented.

---

## Locked Decisions

These decisions are currently stable enough to build against:

- Framework: SvelteKit + Svelte 5 + TypeScript.
- Package manager/runtime tooling: Bun.
- Persistence: SQLite via Prisma 6.
- Validation: Zod at every inbound boundary.
- Product mode: local-first, single-user.
- Purchase flow: manual buying only in MVP.
- Steam purchase automation: do not automate Steam buying, listing, order
  placement, or checkout flows. Future tooling may deep-link/open Steam pages
  for the operator, but the human should execute purchases.
- Discovery automation is allowed when it produces inspectable candidate or
  price observations, assignment reasons, and buy guidance instead of
  executing marketplace transactions.
- Pricing and discovery are separate tracks. Pricing values known hashes;
  discovery finds newly listed matching Steam rows. The product goal is the
  discovery loop, with pricing as support infrastructure.
- API layering: route handlers parse and delegate to services; business
  logic stays in `src/lib/server/**`.
- API response model: list endpoints return `PaginatedResponse<T>` with
  `.data`, `.total`, `.page`, `.limit`, and `.totalPages`; single-entity
  endpoints return raw DTOs.
- Extension auth: `POST /api/extension/candidates` requires
  `X-Extension-Secret` matching `EXTENSION_SHARED_SECRET`; unset env fails
  closed with 503.
- Ingestion model: third-party Chrome extension (CS2 Trader) provides
  candidate data; app adapts to its payload format.
- Catalog model: the static CS2 catalog is a generated snapshot, not a
  runtime database table. Dynamic rows store nullable catalog IDs only as
  references into that snapshot.
- Catalog matching model: prefer stable catalog collection IDs for matching
  and EV grouping when present, with string fallbacks for legacy/manual rows.
- Documentation model: `docs/PLAN.md` is intended architecture and roadmap;
  `docs/PROGRESS.md` is actual execution/state truth. Stale root handoff
  docs were removed to avoid competing instructions.
- EV math (Phase 8): every output exterior projection uses
  per-input-normalized wear proportions, not raw input floats. The
  `BasketEVOptions.averageWearProportion` field name enforces this at the
  type level — passing a raw float fails to compile, which is the point.
  When per-input min/max float is unknown, the projection is skipped
  rather than approximated. Collection-weighted EV remains exact in
  either case.
- Plan/rule/outcome authoring (Phase 8): canonical collection names come
  from the `CatalogCollectionSelect` combobox. Free typing remains valid
  for legacy rows (Free badge surfaces this), but `planService` resolves
  `catalogCollectionId` from canonical text via
  `resolveCatalogCollectionIdentity`, so picking from the dropdown is
  enough to catalog-link the rule. The create modal is intentionally simple:
  collection, input rarity, exterior, max float, and max input price generate
  the initial rule and catalog outcome rows. Advanced rule/outcome editing
  remains available after creation.
- Catalog source model (Phase 8): skin rarity comes from collection/case
  `client_loot_lists` buckets when available, not only from global
  `paint_kits_rarity`. The global paint-kit rarity can be too coarse for
  weapon-specific case outcomes.
- Calculator scope (Phase 8 v1): `/calculator` deliberately omits per-input
  skin selection, so output exterior projection is skipped. The math
  warnings panel makes this visible. Adding `CatalogSkinSelect` later
  removes the limitation without changing the existing endpoint contract.

---

## Open Work

Current product gap:

- **Plan-targeted Steam discovery automation.** Backend target derivation and
  bridge collector-run scaffolding now exist. The remaining work is real Steam
  soak testing, selector hardening, and polishing run-status feedback after
  observing live pages.
- **Listing-page parity.** The buy-queue modal links to the per-skin Steam
  listing page. Future extension help should highlight the matching row by
  price/float/listing identity after the operator opens the page.
- **Real liquidity signal.** `computeLiquidityScore` still uses the candidate
  density proxy. A future targeted Steam observation path should add offer
  volume / recent sale velocity where feasible.
- **Light-theme audit.** Dark mode has received most attention; `.light` needs
  a visual pass after the palette changes.
- **Catalog browser polish.** `/explore` exists for snapshot inspection; future
  work can add search, filters, and direct links from plan/debug screens.
- **Optional reference price adapters.** Skinport or other third-party data may
  be useful as reference/cashout-floor data, but it must not drive Steam-turnover
  EV by default.

Resolved recently:

- Catalog rarity mapping was corrected to use loot-list rarity buckets, and
  `/explore` was added to inspect the snapshot by collection.
- Plan creation was simplified to a single-collection generator flow.
- Steam-first price refresh foundation is implemented.
- Saved combinations and TradeUpLab import are implemented.
- Buy queue and planner are implemented.
- Catalog-aware EV projection and wear-proportion math are implemented.
- Steam inventory linking and result picker are implemented.

---

## Current Product Gap: Discovery Automation

Pricing answers: "What is this known item worth?" Discovery answers: "Which
exact Steam listing should I inspect and maybe buy right now?" The app's product
promise depends on discovery. The operator should not have to manually browse
Steam looking for matches.

The intended discovery design:

1. Active plans and current baskets produce a narrow discovery watchlist:
   market hash names, exterior/float constraints, max-buy thresholds, and
   priority derived from basket/planner need.
2. A local browser-assisted collector consumes that target list and opens or
   monitors only relevant Steam Market pages.
3. The collector reads visible listing rows, listing IDs/URLs, prices, inspect
   links, and float-enriched DOM when available.
4. The collector posts normalized candidates to `POST /api/extension/candidates`.
5. The app deduplicates, catalog-links, evaluates, globally assigns, and shows
   candidates in `/buy-queue`.
6. The operator opens the Steam page and performs the purchase manually.

Constraints:

- Do not build backend all-market scraping. Steam's public market surface is too
  rate-limited and unstable for global discovery.
- Do not automate Steam buying, selling, listing, order placement, checkout,
  confirmation, login, Steam Guard, or trade offers.
- Discovery automation is acceptable only when it produces inspectable candidate
  observations and leaves final marketplace action to the operator.

Likely implementation sequence:

1. `discoveryWatchlistService`: derive targets from active plans, basket needs,
   price freshness, and planner demand.
2. `GET /api/discovery/targets`: returns target Steam URLs/search params plus
   max-buy/float/exterior constraints for the local collector.
3. Extend `tools/steam-market-bridge` with a collector mode that fetches targets,
   visits pages under human-visible browser control, extracts listing rows, and
   posts candidates.
4. Add a `/discovery` or `/buy-queue` run panel showing target count, last run,
   candidates found, skipped duplicates, errors, and links to newly actionable
   buy-queue rows.
5. Add tests for target derivation and candidate normalization/deduping.

Current implementation note: steps 1-4 have an initial implementation. The
next discovery work should use small target limits, inspect `/explore` for
catalog assumptions, and add richer skip/error logging before running broad
collector sessions again.

---
## Next Session Handoff Prompt

Use this prompt to continue in a fresh session:

```text
We are continuing cs-tradeups.

Repo:
C:\Users\jasht\source\repos\cs-tradeups

Read first:
- docs/PROGRESS.md
- docs/PLAN.md
- src/routes/api/README.md

Current state:
- Phases 0-7 are complete. Phase 8 EV math, catalog-aware authoring,
  calculator scratchpad, saved combinations, buy queue, Steam inventory linking,
  and Steam-first price refresh are in place.
- Steam watchlist price refresh exists: `STEAM_PRICEOVERVIEW` adapter,
  watchlist builder, refresh job, `/market-prices` button, and
  `tools/refresh-prices.ts`.
- Observed Steam output prices are treated as Steam buyer gross and converted to
  approximate seller net for EV. EV displays carry basis labels.
- The main product gap is discovery quality: target generation and collector
  controls exist, but the workflow needs small-sample debugging, richer logs,
  and selector hardening before broad runs are trustworthy.

Product direction:
- The goal is a plan-targeted Steam discovery loop. The operator should click
  Run Discovery or leave a local browser-assisted collector running, then see
  actionable candidates in `/buy-queue`.
- Discovery should be narrow and plan-derived: active plan rules, current basket
  needs, target market hashes/exteriors, max price, and float bands.
- The local browser extension/collector should read visible Steam listing rows,
  listing IDs/URLs, prices, inspect links, and float-enriched DOM when available,
  then submit normalized candidates to `POST /api/extension/candidates`.
- Do not build backend all-market scraping. Do not automate Steam buying,
  selling, listing, order placement, checkout, confirmation, or account actions.

Likely next coding slice:
1. Build a discovery-watchlist service from active plans and basket needs.
2. Add an API endpoint that returns Steam Market page/search targets for the
   local collector.
3. Extend `tools/steam-market-bridge` so it can consume those targets, collect
   visible listings, and post candidates.
4. Surface discovery run status/errors and newly found candidates in the app.
5. Keep the final purchase action manual with listing reference/highlight help.

Verification gates:
- `bun run check`
- `bun test tests/` (may need to run outside sandbox on Windows if `EPERM`
  appears while reading node_modules)
- `bun run build` (may need to run outside sandbox for Tailwind/Vite native
  spawn permissions)
```

---
## Risks

- It is easy to make the extension bridge too loose and pay for that later
  in normalization complexity.
- It is easy to let dashboard ideas outrun the quality of stored
  operational data.
- The starter test suite is pure-logic only; Prisma query regressions still
  need manual verification or future integration tests.
- The typed-error substring classifier still exists as a fallback and should
  be removed after the MVP has soaked.

The correct bias after MVP is to ingest real data, observe workflow gaps, and
only then deepen analytics or scoring complexity.

---

## Recent Verification

### 2026-04-28

- Added `/explore` catalog browser and corrected the CS2 catalog importer to
  use `client_loot_lists` rarity buckets for weapon/paint-kit pairs before
  falling back to global paint-kit rarity. Verified Chroma 3 Covert/Classified
  tiers after regenerating the snapshot.
- Simplified the plan creation modal to the operator workflow: collection,
  input rarity, exterior, max float, and max input price. Server action now
  derives target rarity, a preferred rule, basket max notes, and catalog-linked
  outcome rows.
- Added the plan-targeted Steam discovery foundation: target endpoint,
  bridge collector run mode, and `/buy-queue` controls/status. Broad discovery
  runs should wait for small-sample debugging and richer diagnostics.
- Verification: `bun run check` clean; catalog/discovery tests passed.
- Shipped the Steam-first price automation slice: targeted Steam
  `priceoverview` adapter, watchlist builder, refresh job, `/market-prices`
  refresh UI, CLI wrapper, and Steam-net EV basis labels.
- Verification: `bun run check` clean; `bun test tests/` passed with 110 tests
  when run outside the sandbox due to a sandbox-only Windows `EPERM` read on
  `node_modules/esm-env`; `bun run build` passed outside the sandbox. Build
  still reports the existing CSS `@import` ordering warning for the Inter font.

Historical verification and change-log details were removed from this file on
2026-04-28 to keep `PROGRESS.md` usable as a handoff document. Use git history
for detailed archaeology.

### Price Automation Status

**Implementation status (2026-04-28).** Core Steam-first watchlist refresh has
landed: `STEAM_PRICEOVERVIEW` adapter, targeted watchlist builder, refresh job,
`POST /api/market-prices/refresh` wiring, `/market-prices` "Refresh Steam
watchlist" UI, CLI wrapper at `tools/refresh-prices.ts`, source labeling, and
Steam-net fee basis in EV calculations.

Current pricing model:

- Steam is the actionable venue for the operator's near-term workflow.
- Input cost = Steam listing price actually paid.
- Output value = Steam Market buyer price converted to approximate seller net
  proceeds after fees.
- Third-party prices, if added later, are reference/cashout-floor data only and
  must not silently drive Steam-turnover EV.
- Price refresh is targeted, not all-catalog: active plan outcomes,
  saved-combination outcomes, buy-queue candidate hashes, inventory/result
  items, and specific pre-buy checks.

Remaining pricing work:

- Real-market soak testing of Steam `priceoverview` rate behavior.
- Exact Steam fee rounding/minimum-fee verification.
- Optional per-item `refresh-one` UI from the buy-queue listing modal.
- Optional Skinport/reference adapter, clearly labeled as non-actionable for
  Steam-turnover EV.

Pricing is not the main remaining product gap. The next major product slice is
plan-targeted discovery automation, documented above.
### Running Queue (low-urgency, take when convenient)

Each item is small and independent — pick whichever feels relevant when working in adjacent code. Not blocking anything.

- **Surface accessoryCount on inventory rows.** Adapter already captures it. A skin with stickers/charms may be worth materially more than a base skin; today the operator can't see that from the inventory list. Add a small badge ("3 stickers") on InventoryRow + the Steam picker dropdown.
- **Surface paintSeed (pattern) in inventory UI + as a filter.** Linker backfills `InventoryItem.pattern` from Steam, but it's not displayed or filterable. For most trade-ups this doesn't matter, but specific patterns command premiums (Case Hardened blue gems, Karambit Doppler phases, etc.).
- **Steam picker on ManualAddInventoryModal.** Currently typing market-hash-name + float by hand. Share the picker logic from RecordResultModal so manual additions pull from the live Steam inventory the same way execution results do.
- **Linker matching tests.** Three unit tests covering FLOAT_EXACT / FLOAT_BACKFILL / FIFO_FALLBACK paths in steamLinkService. Protects against regression when the adapter or matching logic shifts.
- **Pattern-aware EV bonus.** TradeupOutcomeItem could carry an optional patternBonus map for known premium patterns (e.g., Case Hardened seed 387 = Scar Pattern → 5x base value). Out-of-MVP but worth a stub if it ever becomes load-bearing.
- **Sticker-aware EV.** Stickers don't transfer through tradeups — they're destroyed when the contract executes. So a sticker-laden basket input is a *worse* trade-up input than its market price implies. Future: warn when a basket includes high-sticker-value items.
- **Tradeuplab quarantine investigation.** The importer quarantined 6 very-low-ID cards (e.g., #1209, #1226, #1238, #1260, #1278, #11966) as "invalid card" — they predate the current DOM structure. Sub-1% of the import; only worth fixing if you actually want those specific historical combos.
- **Bulk recheck across saved combinations.** With ~550 imported combos, hitting "Recheck" individually is tedious. A batch-recheck endpoint (POST /api/tradeups/combinations/recheck-all or similar) that runs through all active or all draft combinations in one go would let you sort by current delta vs thesis to find the still-profitable ones quickly.
- **Filter / sort on /tradeups/saved.** With ~550 entries, the page becomes a wall. Add filters by target rarity / collection / source plus sort by latest profit delta. Currently it's a chronological scroll.
- **Optional: seed MarketPriceObservation from imported tradeuplab outcome prices.** The importer stashes outcome prices in notes JSON with their `identifiedAt` date. Could be written as observations tagged `source: 'TRADEUPLAB_IMPORT'` so historical-but-better-than-nothing prices populate the table. Caveat: many imported combos are months old, so the prices would be marked STALE/OLD by freshness logic.

### Random things to fix/notes (2026-04-26 — all addressed in 2026-04-27 session)
- ~~calculator is incorrect, doesn't show all collections, no input for actual weapons, plans at the top are meaningless and limiting, need to be able to save as a plan~~ — Slice A: ad-hoc mode, CatalogSkinSelect, save → TradeupCombination.
- ~~graphs on dashboard ui are bad, illegible~~ — Slice D: chart theme + CSS-var resolution fix.
- ~~general ui is bad, needs brightening/improvement in dark mode~~ — Slice D: charcoal+cyan palette + anti-monotony mechanisms.
- ~~need to link to steam inventory automatically~~ — Slice C: public inventory adapter + sync action.
- ~~ensure that clickable links appear in the buy queue, need to open in new tab and highlight the price and float so i know im getting the right one on the web page after clickinglink~~ — Slice B: listing reference modal with hash/price/float and Steam links.
- ~~remove the csv and json import full modals and just turn into buttons that extend the modal, won't really use this, all of this should be done autonomously~~ — Slice D: collapsed to <details> accordion.
- ~~for tradeup executions, should be able to select result from steam inventory~~ — Slice C: "Pick from Steam" in RecordResultModal.
- ~~need an inventory net worth graph on dashboard at top~~ — Slice D: hero card + /api/analytics/net-worth.
- ~~need to improve new plan modal to make wider, tough to read~~ — Slice D: PlanEditorModal size="xl".
