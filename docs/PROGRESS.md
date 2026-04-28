# CS Tradeups - Progress

## Status Snapshot

**Project Status:** Phases 0-7 complete; Phase 8 in progress — EV math correctness fix shipped, catalog-aware authoring (combobox in plan/rule/outcome editors) shipped, calculator scratchpad shipped. Watchlist combinations and optional catalog browser remain.
**Last Updated:** 2026-04-26
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
  baskets, and executions.
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
- `/calculator` scratchpad page with `POST /api/tradeups/calculator`
  backend. Operator picks a plan, types up to 10 hypothetical inputs
  (collection + float + price), sees EV / per-collection chance /
  per-outcome contribution / cost / profit. Output exterior projection is
  intentionally skipped in v1; the warnings panel makes the limitation
  visible.

What does not exist yet:

- Svelte component tests beyond the combobox ranking heuristic.
- Automated end-to-end browser coverage for the companion bridge.
- External price source adapters and marketplace history chart backfill.
- Real marketplace-volume liquidity signal. Liquidity still uses the
  candidate-density proxy.
- Watchlist combinations — no way yet to pin a buy-queue or calculator
  proposal and re-check it after a future price import.
- `CatalogSkinSelect` companion combobox. Without it, the calculator and
  any future watchlist cannot project output exteriors because we don't
  know each input's per-skin float range.
- `/catalog` browser page (deferred — operator can hit `/api/catalog` for
  raw data, and the combobox already surfaces collection names where it
  matters).

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

### Phase 8: Catalog-Aware Authoring, Calculator, And Watchlist

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
- [ ] `CatalogSkinSelect` combobox for skin-level autocomplete (used by
  the calculator scratchpad and any future catalog browser). Defer until
  the calculator UI needs it.
- [x] `/calculator` scratchpad page: pick a plan, type up to 10
  hypothetical inputs (collection combobox + float + price), see EV,
  per-collection chance, per-outcome contribution, total cost, expected
  profit. Output exterior projection is intentionally skipped in v1
  because it would require per-input skin selection (so each input's
  float can be normalized into its own range) — the user-facing notes
  panel surfaces that limitation. Endpoint:
  `POST /api/tradeups/calculator`. Service:
  `src/lib/server/tradeups/calculatorService.ts`. Schema:
  `src/lib/schemas/calculator.ts`. 5 integration tests cover
  single-collection EV, mixed-collection weighting, warning emission,
  and missing plan id.
- [ ] `CatalogSkinSelect` companion combobox so calculator/watchlist
  inputs can carry a specific skin. Without it, output exterior projection
  remains skipped in those surfaces because per-input float ranges are
  unknown.
- [ ] Watchlist combinations: persist a 10-item proposal as a lightweight
  saved combination (new `TradeupCombination` model or a `WATCHLIST` basket
  variant), with a `recheckProfitability` action that re-evaluates against
  current observed prices and reports profitability deltas vs the snapshot
  taken at save time.
- [ ] `/catalog` browser page for skins/collections/floats — natural home
  for the autocomplete components and reusable item cards.
- [x] Combobox ranking heuristic test (`tests/components/`).
- [x] Calculator math integration tests covering single-collection,
  mixed-collection weighting, and warning emission.
- [ ] Watchlist re-check integration test (after watchlist ships).

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
  enough to catalog-link the rule. No new form fields were introduced.
- Calculator scope (Phase 8 v1): `/calculator` deliberately omits per-input
  skin selection, so output exterior projection is skipped. The math
  warnings panel makes this visible. Adding `CatalogSkinSelect` later
  removes the limitation without changing the existing endpoint contract.

---

## Open Questions And Deferred Work

Resolved:

- **First-pass EV formula.** CS2 collection-weighted formula implemented in
  `src/lib/server/tradeups/evaluation/expectedValue.ts`.
- **Candidate re-evaluation on ingestion.** Candidate creation and extension
  ingestion synchronously run `evaluateCandidate`.
- **Plan mutation re-evaluation.** Plan mutations fan out via
  `planService.reevaluateAllForPlan`, with
  `reevaluateOpenCandidates` as a manual escape hatch.
- **Basket metric recomputation.** Basket mutations recompute metrics
  eagerly inside the same transaction.
- **Execution creation.** READY-to-EXECUTED transition is atomic.
- **Price-age re-evaluation.** Manual stale-refresh endpoint and
  `evaluationRefreshedAt` tracking shipped in Phase 5.
- **Plan-aware inventory eligibility endpoint.**
  `GET /api/inventory/eligible?planId=...` shipped in Phase 6 and the basket
  builder uses it directly.
- **Typed service errors.** Expected service failures now throw typed
  `HttpError` subclasses; the substring classifier remains only as a legacy
  fallback.
- **Automated starter tests.** `bun test tests/` covers pure decision logic
  for evaluation, scoring, duplicate detection, CSV, and readiness.
- **Dashboard charting and CSV reporting.** ECharts dashboard charts and the
  two scoped CSV exports shipped in Phase 6.
- **Audit/event log.** Deferred; live analytics read current rows instead of
  an event table for now.
- **Catalog-aware EV and rule matching foundation.** Plan outcomes and rules
  now persist nullable catalog identifiers, the backfill tool covers those
  rows, and evaluation/readiness paths prefer stable collection IDs where
  present.
- **Per-output float projection.** Basket EV breakdowns now project output
  float/exterior from catalog min/max ranges where catalog-linked outcomes
  are available.

Still unresolved:

- **Price ingestion source.** The database can store local market price
  observations, EV can consume them, and the operator can inspect/import JSON
  or CSV batches from `/market-prices`. Automated source adapters are still
  deferred.
- **Planner and buy queue engine.** Candidate evaluation can score and rank
  opportunities, but there is not yet a first-class planner that assigns
  listings to an active plan, basket, bucket, slot, or reserve role with a
  max-buy reason. This is the next product slice before marketplace source
  automation. Locked decision: the planner is a global partition optimizer
  over the full candidate + inventory pool, not a greedy per-candidate
  assigner. See the Phase 7 Plan section above for the full design.
- **Bulk discovery/source adapters.** The target is a self-sustaining listing
  discovery loop, but source adapters should feed the existing observable
  import/ingestion paths first. Steam/browser-assisted collection remains
  non-transactional and should not automate checkout.
- **Historical Steam chart ingestion.** Steam exposes price charts in the
  browser experience, but direct history endpoints are not treated as a stable
  official integration contract here. Prefer building a local observation
  history from latest-price imports first; add historical backfill only if a
  reliable source is selected.
- **Real marketplace-volume liquidity signal.** `computeLiquidityScore` uses
  the Phase 5 density proxy until a listing-volume signal is available.
- **Visible weapons/catalog database.** The static catalog snapshot is
  available through read-only API endpoints, but there is not yet an operator
  UI for browsing weapons, skins, collections, float ranges, paint indexes,
  or item imagery. Defer until the ingestion/pricing foundation is stable.
- **Bridge hardening on real-market usage.** The local companion extension
  now has first-pass static hardening for missing float enrichment, listing
  row ID extraction, inspect-link placeholder replacement, and float metadata
  extraction drift. A true Chrome/Steam live-page smoke test still needs to
  validate selector durability and catalog-linked versus catalog-unmatched
  results against real listings.
- **Notifications beyond queue visibility.** MVP likely skips; revisit.

---

## Phase 8 Plan: Catalog-Aware Authoring, Calculator, And Watchlist

Phase 7 made the buy queue actionable, but a session review surfaced four
gaps that block the operator from trusting the system end-to-end:

### Driving Concerns

1. **Plan rule editor uses free-text collection names.** The catalog snapshot
   has 92 collections and 1,421 skins, but `RuleEditor.svelte` and the
   outcome editor accept any string. A typo at plan-creation time
   (e.g. `Snakebite Collection` vs `The Snakebite Collection`) silently
   prevents every downstream candidate from matching, and the operator has
   no clean way to debug it. This is the highest-friction problem in the
   system today.
2. **No tradeup calculator scratchpad.** `computeBasketEV` is correct and
   wired into the basket builder, but the only way to evaluate a
   hypothetical 10-item combination is to first create inventory rows.
   There is no "what if" surface for arbitrary collection/float/price tuples.
3. **No saved-combinations / watchlist.** The buy queue is recomputed each
   load. If the operator likes a particular partition and wants to re-check
   it after a price refresh, there is no way to pin the combination. The
   workaround (materializing a `BUILDING` basket) immediately reserves
   inventory and is too heavyweight.
4. **Planner partition optimizer ignores float-driven exterior pricing.**
   `partition.basketEV` calls `computeBasketEV` without `averageInputFloat`,
   so the swap optimizer cannot see EV differences from grouping low-float
   vs high-float items of the same collection. The basket builder UI math
   is correct; only planner-internal optimization is affected. Real risk in
   the common case where observed prices differ across exteriors.

### EV Math Audit (verified 2026-04-25)

Correct:

- Collection weighting: `P(collection) = slot count / 10`. 2 from A + 8 from
  B yields 20%/80% as expected.
- Within-collection outcome distribution: weighted by `probabilityWeight`,
  defaults to uniform.
- Per-skin float ranges loaded from the catalog snapshot via
  `withCatalogOutcomeFloatRanges` (output side).
- Observed market price preferred over plan fallback when present.

Wrong (FIXED 2026-04-25):

- ~~Input float normalization is missing.~~ **Fixed.** New
  `averageWearProportion(inputs)` normalizes each input by its own
  per-skin range before averaging. `enrichSlotsWithInputRanges` loads
  ranges from the catalog snapshot. `BasketEVOptions.averageInputFloat`
  renamed to `averageWearProportion` to prevent regression.
- ~~`partition.basketEV` does not pass the average wear proportion.~~
  **Fixed.** Pool items carry `inputMinFloat` / `inputMaxFloat`;
  `partition.basketEV` computes the wear proportion and passes it. Swap
  optimizer can now see float-driven exterior EV differences.

### Recommended Order

1. **Fix the planner float-projection bug** (one-line change + regression
   test). Do this first because it is small, isolated, and the integration
   tests will catch the change cleanly.
2. **Build catalog combobox components.** `CatalogCollectionSelect` first —
   text input with live-filtered dropdown suggestions sourced from
   `/api/catalog/summary`. Selection writes both the canonical display
   string and the stable `catalogCollectionId`. `CatalogSkinSelect` second,
   reusing the same combobox primitive.
3. **Wire comboboxes into plan editing.** Replace free-text collection
   inputs in `RuleEditor.svelte`, `PlanEditorModal.svelte`, and the outcome
   editor. Existing free-text rules continue to work; the catalog id is now
   set automatically when the operator picks from the suggestions.
4. **Ship `/calculator` scratchpad.** New page with plan picker + 10
   transient input rows (collection combobox, float, price). Calls the
   existing `computeBasketEV` math through a small server function or an
   inline `POST /api/tradeups/calculator` endpoint. Output: per-collection
   chance, per-outcome contribution, projected exteriors, total EV, total
   cost, expected profit. Does not persist anything.
5. **Add watchlist combinations.** New entity (or basket status variant) to
   persist a 10-item proposal with a snapshot of prices/EV at save time.
   `POST /api/tradeups/combinations` from the buy queue ("save this
   proposal"). `POST /api/tradeups/combinations/[id]/recheck` re-evaluates
   against current observed prices and reports the delta. UI: a
   `/watchlist` page or a tab on the buy queue.
6. **Optional: `/catalog` browser page.** Reuses the combobox primitive and
   adds visible cards for skins/collections/floats. Lower priority — defer
   if the autocomplete in the plan editor is sufficient.

### Combobox Behavior

- Text input with live filtering as the operator types — substring match
  case-insensitively, ranked by prefix match first then position.
- Suggestions drop down beneath the input (max ~8 visible).
- Free text remains valid for legacy rules; if the typed text matches a
  catalog entry exactly, the catalog id is set automatically. If the
  operator picks from the dropdown, the canonical display string and id
  are both written.
- A small badge next to the input shows whether the current value is
  catalog-linked or free-text-only, so the operator can see at a glance
  whether the rule will participate in catalog-id matching.

### Deferred Within Phase 8

- Skin imagery and rich card UI in the catalog browser.
- Multi-language collection name handling.
- Backfill migration that resolves all existing free-text rules to catalog
  ids — defer until the combobox-authored rules are proven and the operator
  asks for a sweep.

---

## Phase 7 Plan: Planner And Buy Queue

Phase 6 plus the catalog identity, bridge hardening, and market price
observation slices complete the current foundation. Phase 7 makes the app
assign real candidate listings into plan/basket needs and produce a buy queue.
This must ship before Steam scraping or broader price source automation.

### Design Concerns Driving The Phase

These concerns came out of reviewing the current evaluation flow before
implementation. They shape the requirements below.

1. **Evaluation already picks a winner without explaining alternatives.**
   `evaluateCandidate` computes `allMatches` and writes `matchedPlanId`, but
   only the winner persists. The buy queue must surface runner-up plans and
   baskets per candidate so operator overrides are informed, not guesswork.
2. **Tie-breaking is currently alphabetic on plan id.** `pickBestMatch`
   resolves equal-fit ties by `planId.localeCompare`. That is fine for
   deterministic output but visible tie reasons must be added before this
   becomes user-facing in a buy queue.
3. **`boundedFloatFit` rewards center-of-band floats.** That is the wrong
   heuristic when a basket needs a specific projected output exterior — the
   operator may want the highest acceptable float to drag a basket's average
   up, or the lowest. Float-fit must be evaluated against the *basket's*
   current average and target exterior, not the rule midpoint, when
   assignment-aware ranking runs.
4. **No slot-scarcity awareness today.** A scarce float/collection slot can
   be assigned to a basket that did not need it because the candidate scored
   well in isolation. Global optimization is required, not greedy
   per-candidate assignment.
5. **`recomputeMetrics` evaluates baskets as they stand.** There is no
   "what would this basket look like with candidate X" projection feeding
   back into candidate ranking. The planner needs to compute marginal
   contribution against simulated post-add basket state, which
   `computeMarginalContribution` already does for one basket at a time but
   not across the full pool.
6. **Manual operator overrides must be honored.** Pinned candidates and
   manually reserved inventory are fixed inputs to the optimizer, not
   suggestions it can override.

### Global Basket Optimization (Locked Decision For Phase 7)

Greedy per-candidate assignment is rejected. The planner is a global
optimizer over the full candidate + inventory pool against all active
plans and baskets.

The product reason: with 39 viable items already in the pool, adding the
40th must produce the partition that yields the maximum number of viable
10-item baskets and the maximum total expected value across them. A locally
optimal home for a single new item can break a basket that was one slot from
ready, or strand a scarce slot in a basket that did not need it.

Algorithmic shape:

- Pool: all `WATCHING` / `GOOD_BUY` candidates plus `HELD` /
  `RESERVED_FOR_BASKET` inventory.
- Containers: all active `BUILDING` baskets plus zero or more proposed new
  baskets per active plan.
- Pre-filter by plan rules so each item only contends for baskets under plans
  whose rules accept it. This shrinks the combinatorial space dramatically;
  most items match one or two plans, not all of them.
- Score each candidate partition by total expected EV/profit; tiebreak on
  viable-basket count so four ready baskets beat three ready + one slightly
  higher EV trio.
- Exact enumeration where per-plan viable count is small (low tens). Fall
  back to a heuristic — greedy initial assignment plus local-search swaps
  that strictly improve total EV — when not. Converge to a stable result.
- Deterministic output: same input pool produces same partition across
  refreshes when nothing changed. Stability matters for operator trust.
- Manual pins are fixed inputs; the optimizer optimizes the remainder around
  them.
- Recompute on any pool change: new candidate, new price observation, plan
  edit, manual basket edit.

### Recommended Handoff Order

1. **Read the current evaluation and basket flow.**
   - Primary files: `src/lib/server/tradeups/evaluation/**`,
     `src/lib/server/tradeups/basketService.ts`,
     `src/lib/server/candidates/**`, and current candidates/baskets UI routes.
   - Identify what data already exists for plan fit, float fit, EV, max buy,
     current basket membership, and listing URL/inspect link.
   - Confirm `matchCandidateToPlans` returns full match sets (it does) and
     that `computeMarginalContribution` accepts simulated slot context (it
     does).

2. **Add the `CandidateAssignment` view model.**
   - Location: `src/lib/types/services.ts`.
   - Fields: `candidateId`, `planId`, `planName`, nullable `basketId`,
     nullable `basketSlotIndex`, `role` (`BASKET_SLOT` | `BASKET_FILL` |
     `RESERVE` | `NEW_BASKET`), `recommendation`, `maxBuyPrice`,
     `expectedProfit`, `expectedProfitPct`, `marginalEVContribution`,
     `floatFit { score, explanation }`, `pricing { source, freshness }`,
     `reason` string, and `alternatives[]` with `planId`, `basketId`,
     `marginalEVContribution`, and `whyNotChosen`.
   - Transient by default. Do not persist in this slice. Revisit only if
     recomputation becomes slow or the operator needs assignment history.

3. **Build `plannerService` with the global optimizer.**
   - New file `src/lib/server/tradeups/plannerService.ts`.
   - Public surface: `buildBuyQueue(): Promise<CandidateAssignment[]>`.
   - Internal pipeline:
     a. Load active plans, candidates, inventory, baskets in one read pass.
     b. Per plan, compute the eligible item set (rule pre-filter).
     c. For each plan, search partitions of eligible items into ten-item
        groups maximizing total EV. Use exact enumeration when feasible;
        fall back to greedy + local-search swap improvement otherwise.
     d. Compose the cross-plan global solution: each item lands in at most
        one plan/basket; ties resolved by marginal EV delta.
     e. For each item in the chosen solution, compute the assignment record
        with reason, alternatives (top 2-3 runner-ups across plans/baskets),
        and float-fit explanation.
     f. Honor manual pins as fixed assignments; optimize remainder around
        them.
   - Stability: sort partitions and items deterministically before scoring
     so equal-EV solutions produce identical output across runs.

4. **Expose `GET /api/tradeups/buy-queue`.**
   - Calls `buildBuyQueue()` and serializes.
   - Optional `?planId=...` to scope; optional `?includeAlternatives=true`
     to keep the default response lean.
   - No persistence, no mutations.

5. **Surface the `/buy-queue` operator page.**
   - Route: `src/routes/buy-queue/+page.server.ts` and `+page.svelte`.
   - Group by plan, then by proposed basket inside each plan.
   - Per row: external listing link, inspect-link icon, current price vs
     max buy (red when over), assigned slot, marginal EV $, reason text,
     freshness badge consistent with `/market-prices`.
   - Disclosure for alternatives, expanded on demand.
   - Single "Refresh queue" action that re-runs the planner without import.
   - Per-row actions: "Mark bought" (carrying assignment context), "Pass",
     "Re-evaluate".
   - Utilitarian styling. No charts. No drag-and-drop.

6. **Wire `markBought` to carry assignment context.**
   - Extend `POST /api/candidates/[id]/buy` to accept optional
     `intendedBasketId` and `intendedSlotIndex`.
   - After conversion, when the basket is still `BUILDING` with that slot
     available, call `basketService.addItem` immediately.
   - When the slot is no longer available, fall through to `HELD` inventory
     and surface a warning in the response.
   - The buy queue UI passes these from the assignment.

7. **Tests and docs.**
   - Unit tests covering: one candidate one plan no basket → `NEW_BASKET`;
     candidate fits two plans → picks higher marginal EV with alternatives;
     basket at 9/10 → `BASKET_FILL` priority; two candidates compete for
     last slot → loser falls to alternative; float band edge cases;
     max-buy gating; pinned override fixed; deterministic output for
     unchanged input; 39+1 pool produces strictly better partition than
     greedy assignment for at least one constructed case.
   - One integration test seeding plans + candidates + a partial basket and
     asserting the expected partition.
   - Update `docs/PROGRESS.md` Phase Tracking with Phase 7 progress.
   - Run `bun run check` and `bun test tests/`. The known sandbox `EPERM`
     reading `node_modules\esm-env` remains an environment failure, not an
     application failure.

### Deferred Within Phase 7

- Persisting assignments. Recomputation is fine until proven slow.
- Auto-creating proposed baskets. Show "would start a new basket" as a role,
  but require an operator click to materialize the basket row.
- Smart per-basket float-band assignment that optimizes for projected output
  exterior rather than just marginal EV. v1 uses marginal EV alone; revisit
  if specific bad assignments surface.
- Cross-plan rebalancing beyond the local-search swap heuristic. v1 is good
  enough if it strictly improves over greedy; bipartite-matching-style exact
  solutions can wait until the heuristic shows visible failures.

Only after the planner/buy-queue loop is useful should the project add a
bulk discovery/source adapter. That adapter should feed normalized candidates
and price observations into the same inspectable services and must not
automate Steam buying, selling, order placement, checkout, or confirmation.

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

Current state:
- Phases 0-7 complete. Phase 8 substantially complete after the
  2026-04-26/27 session covering Slices A-D (calculator overhaul,
  buy-queue listing reference, Steam inventory integration, UI
  polish). Every item from the "Random things to fix/notes" list at
  the bottom of this file is addressed.
- 100 tests pass. bun run check is clean (0 errors, 0 warnings).
- Steam float enrichment landed late in the session: as of Steam's
  2026-04 inventory payload change, `asset_properties` ships float +
  paint seed natively. inventoryAdapter parses both into
  SteamInventoryItem; steamLinkService matches by
  (marketHashName, floatValue ± 1e-6) with three strategies —
  FLOAT_EXACT, FLOAT_BACKFILL (copies Steam float onto local row),
  FIFO_FALLBACK (logged for review). RecordResultModal auto-fills
  float on pick. The inventory page sync banner breaks "newly
  linked" out by strategy with an expandable review list for
  FIFO fallbacks. No third-party resolver needed.
- TradeUpLab.com importer: tools/import-tradeuplab.ts pulls
  community trade-up combinations from
  https://www.tradeuplab.com/tradeups/?page=N&min_probability=M
  (HTML scraping with cheerio), reconstructs canonical
  market_hash_names from card display text using the catalog
  weapon list (longest-prefix match, with StatTrak™/Souvenir
  fallback to the base skin entry), and POSTs each combo to
  /api/tradeups/combinations as a TradeupCombination draft.
  TradeupCombination.tradeupLabId column with a unique constraint
  makes re-runs idempotent (Prisma P2002 → ConflictError → "duplicate"
  in importer summary). saveCombination accepts an optional
  tradeupLabId; combinationSaveSchema notes cap is 16 KB so
  the source-metadata JSON blob fits combos with many outcomes.
  First import: 551/558 cards at min_probability=90 (~28 pages),
  6 quarantined as invalid cards (very old IDs with a different
  DOM structure), 1 over-cap fixed by the notes bump.
- Thesis-override path on saveCombination: importers (and any
  future external-source importer) can pass thesisOverride
  { totalCost, totalEV, expectedProfit, expectedProfitPct } to
  freeze pre-computed numbers as the saved baseline. Without this,
  saveCombination called calculate() — which returned 0 EV for every
  outcome whenever MarketPriceObservation was sparse, making
  imported combos look wrong (Cost $62 · EV $0 · Profit -$62). The
  tradeuplab importer now forwards its parsed published numbers via
  thesisOverride. Recheck still uses calculate() against current
  observations and reports drift vs the override.

Slice A — Calculator + Save-as-Combination:
- /api/catalog/skins endpoint returns a lightweight skin list
  (id, weapon|skin display, collection id+name, rarity, min/max
  float, exteriors).
- CatalogSkinSelect.svelte: combobox modeled on CatalogCollectionSelect
  with optional collectionId/rarity scoping props, module-cached fetch.
- Calculator service (src/lib/server/tradeups/calculatorService.ts)
  rewritten with two modes:
  * PLAN mode: outcomes from the chosen plan (isActive NOT enforced —
    the calculator is a tweaking surface, not the planner).
  * AD_HOC mode: outcomes synthesized from the catalog snapshot at
    request.targetRarity for every collection seen in the inputs;
    pricing falls back to latest market observation, otherwise 0 with
    a warning.
- Per-input catalogSkinId enables proper output exterior projection
  via enrichSlotsWithInputRanges + averageWearProportion. Calculator
  UI got mode tabs, target/input rarity selectors for ad-hoc, and a
  per-row CatalogSkinSelect that auto-fills the collection field when
  a skin is picked.
- New schema models (migration 20260426165249_phase8_tradeup_combinations):
  * TradeupCombination — frozen "thesis" totals + thesisPlanSnapshot
    JSON so recheck math has a stable comparison even if the source
    plan is edited or deleted. mode in {PLAN, AD_HOC}, isActive flag,
    sourcePlanId nullable.
  * TradeupCombinationInput — 10 rows per combination, slotIndex
    unique per combination.
  * TradeupCombinationSnapshot — appended on each recheck (history,
    never overwritten).
- combinationService: save (runs calculator first, freezes thesis,
  builds snapshot of plan rules+outcomes), list/get/patch/delete,
  recheck (re-evaluates against current prices, appends snapshot,
  returns delta vs thesis).
- POST/GET /api/tradeups/combinations, GET/PATCH/DELETE
  /api/tradeups/combinations/[id], POST .../recheck.
- Save panel on /calculator (after a successful calculation).
  /tradeups/saved page lists combinations, shows thesis vs latest
  recheck delta, with recheck/activate/delete actions and a sidebar
  link.

Slice B — Buy-queue listing reference:
- Buy-queue page server batch-loads marketHashName, floatValue,
  listingUrl for every assigned candidate/inventory item via two
  scoped Prisma queries (no N+1).
- Each row's "Item" cell now shows actual market hash name + exact
  float alongside the float-fit explanation.
- "View" button per candidate row opens a listing reference modal
  with: market hash, exact price (with max-buy + over-cap warning),
  exact float, link to the candidate's saved listingUrl if present,
  link to the Steam listings page
  (https://steamcommunity.com/market/listings/730/<encoded hash>),
  Mark Bought + Discard actions. Discard hits PATCH /api/candidates/[id]
  with status: PASSED, pinnedByUser: true so the planner won't
  reassign it.

Slice C — Steam inventory integration:
- STEAM_ID env var (in .env.example).
- src/lib/server/steam/inventoryAdapter.ts fetches the public
  /inventory/<steamid>/730/2 endpoint, paginates via last_assetid,
  builds normalized SteamInventoryItem (assetId, marketHashName,
  exterior, rarity, inspect link, icon, tradable/marketable). 60s
  in-memory cache. Throws SteamInventoryError with HTTP-friendly
  status codes (403 = inventory private or wrong id, 429 = rate
  limited).
- GET /api/steam/inventory[?force=1] returns the normalized snapshot.
- InventoryItem.steamAssetId added (unique, nullable). Migration
  20260426180000_phase8_inventory_steam_asset. Test DB applies it
  too — see tests/helpers/db.ts.
- src/lib/server/inventory/steamLinkService.ts pairs Steam assets to
  local InventoryItem rows by marketHashName (FIFO when multiple
  share a name, since the public payload has no float). Returns
  newly linked + already linked + unlinkedSteamItems +
  missingFromSteam (linked rows whose Steam asset disappeared, never
  auto-cleared because Steam's JSON occasionally drops items in
  trade lock).
- POST /api/inventory/link-steam runs the sync.
- /inventory page got a "Sync with Steam" button next to "Manual
  item" with a result banner (collapsible lists of unmatched and
  missing items).
- RecordResultModal.svelte got a "Pick from Steam" button that
  loads the live inventory inline, filters by name, click an item
  to auto-fill marketHashName + weapon + skin + exterior. Float
  still manual (not in the public JSON).

Slice D — UI polish:
- docs/UI_STYLE_GUIDE.md "Improvement Areas" section codifies the
  current charcoal+cyan palette (after iterating dark-blue →
  slate+violet → charcoal+cyan).
- src/app.css palette is now charcoal+cyan: bg-base #0d1117,
  surfaces #161b22 / #1c232c / #222b35 / #14222b (accent), primary
  #22d3ee (cyan), secondary #818cf8 (indigo, charts only),
  semantic green/amber/red reserved for data meaning. Inter loaded
  via Google Fonts.
- Anti-monotony: body radial gradient (very subtle cyan + indigo
  glow), .card-accent variant (Card now takes accent prop) for the
  page's focal card, .section-anchor utility for H2 left-border
  treatment.
- Charts: src/lib/components/charts/theme.ts now resolves CSS
  variables to hex at runtime via getComputedStyle (canvas renderer
  cannot read CSS vars — was rendering black). chartPalette
  exposes lazy getters; resolveChartPalette() / resolveChartSeriesColors()
  for new code; baseChartOption() builds with resolved colors.
- Dashboard hero card pinned at the top with inventory net-worth
  chart. New analytics function getInventoryNetWorthSeries() and
  GET /api/analytics/net-worth — weekly cumulative cost basis vs.
  estimated value, accounting for items disposed before each
  bucket boundary.
- Dashboard activity table moved to a sidebar-triggered modal
  (src/lib/components/ActivityDrawer.svelte). Dashboard load is
  now 4 parallel queries instead of 5 (activity fetch dropped).
  Activity drawer fetches its own data on open with a 30s cache.
- Plan editor modal widened (size="xl").
- Market Prices CSV/JSON imports collapsed to a single
  <details> accordion at the top of the page.

Pinning behavior to remember:
- combinations.thesisPlanSnapshot is frozen at save time so recheck
  math has a stable baseline even if the source plan is deleted.
  Recheck appends to TradeupCombinationSnapshot — never overwrite.
- Steam inventory linking now uses three-tier matching:
  FLOAT_EXACT (marketHashName + float ± 1e-6) → FLOAT_BACKFILL
  (local row had no float; we copy Steam's) → FIFO_FALLBACK
  (oldest unmatched, logged for review). Pattern is also backfilled
  when missing.
- Chart palette exports values via getters (or resolveChartPalette()) —
  do NOT pass raw `var(--...)` strings to ECharts canvas.
- TradeupCombination.tradeupLabId is the dedupe key for the
  tradeuplab importer. Adding similar importers should each get
  their own unique-indexed external-id column so re-runs stay
  idempotent.

Likely next coding work:
1. **Automated price ingestion (HIGHEST PRIORITY).** Recheck and
   ad-hoc EV math both depend on MarketPriceObservation rows. The
   operator cannot maintain ~12,000 CS2 item prices manually. Until
   this is solved, /tradeups/saved is a research library with no
   working drift signal. See the dedicated "Price Automation Plan"
   section below.
2. Light-theme audit. The new charcoal+cyan dark palette was tuned
   in isolation; the .light variant in app.css hasn't been visually
   verified under the new tokens. Walk every page in light mode and
   adjust .light values where contrast or hierarchy reads wrong.
3. Per-page accent / iconography pass if charcoal+cyan still feels
   monotonous. Levers: subtle per-page primary tint, lightweight SVG
   icon set next to H2s, KPI font sizes up, more whitespace, denser
   tables.
4. Steam inspect link/full-listing parity. Currently the buy-queue
   modal links to the per-skin listings page (Steam has no
   per-listing URL). Future browser-extension help could highlight
   the matching row on Steam's page; tracked but not started.
5. Items in the Running Queue section near the bottom of this file.

Verification gates:
- bun run check (0 errors, 0 warnings)
- bun test tests/ (100 pass)
- Prisma client regen on Windows can fail with EPERM on the engine
  DLL when a dev server is running; stop the dev server and re-run
  `bunx prisma generate`. Test DB migrations are listed in
  tests/helpers/db.ts — keep that array in sync with new prisma/
  migrations/ folders.

Do not:
- Do not automate Steam buying, selling, order placement, checkout,
  or confirmation.
- Do not pass raw CSS-variable strings to ECharts; use the resolved
  helpers in charts/theme.ts.
- Do not overwrite TradeupCombinationSnapshot history; always
  append.
- Do not regress the wear-proportion math by passing raw input
  floats to projectOutputFloat. The BasketEVOptions field
  (averageWearProportion) catches this at the type level.
- Do not silently accept free-text collection or skin names where
  the combobox can be used.
- Do not use semantic palette tokens (success/warning/danger) as
  decoration. Reserve them for data with that meaning.
- Do not reintroduce a third-party float resolver; Steam ships
  float and paint seed in `asset_properties` natively now.
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

## Verification Log

### 2026-04-26

- Documentation sync: refreshed `Status Snapshot`, `Current Reality`,
  Phase 8 checklist, `Locked Decisions`, and the next-session handoff
  prompt to reflect the shipped state of Phase 8 deliverables (EV
  correctness fix, catalog combobox in plan/rule/outcome editors,
  calculator scratchpad). The handoff prompt now points the next session
  at `CatalogSkinSelect` followed by watchlist combinations.

### 2026-04-25

- Shipped Phase 8 calculator scratchpad: `/calculator` page with plan
  picker, 10 input rows (collection combobox + float + price), and a
  results panel showing total cost, EV, expected profit, average input
  float, per-collection chance, and per-outcome contribution.
  `POST /api/tradeups/calculator` endpoint backed by
  `calculatorService.calculate`, which reuses `withCatalogOutcomeFloatRanges`
  for outcome enrichment and `computeBasketEV` for the math. Output
  exterior projection is intentionally skipped in v1 — the warnings
  panel makes this visible to the operator. Added 5 integration tests
  in `tests/integration/calculator.test.ts` covering pure-collection EV,
  mixed-collection slot-count weighting, fewer-than-10-inputs warning,
  always-skipped-projection warning, and missing-plan error path. Sidebar
  nav gained a Calculator entry. Full suite: 100 tests pass;
  `bun run check` reports 0 errors and 0 warnings.
- Shipped Phase 8 catalog autocomplete: `CatalogCollectionSelect` combobox
  (`src/lib/components/CatalogCollectionSelect.svelte`) with live-filtered
  dropdown suggestions sourced from `/api/catalog/summary`, module-scoped
  fetch cache, keyboard navigation (Arrow/Enter/Escape), and a Linked/Free
  badge that signals whether the current value matches a known catalog
  collection. Wired into `RuleEditor.svelte`, `PlanEditorModal.svelte`, and
  `OutcomeEditor.svelte`. Server side requires no changes — `planService`
  already calls `resolveCatalogCollectionIdentity` against canonical text,
  so the combobox just needs to ensure the operator picks a real
  collection name and the catalog id falls out automatically. Added a
  unit test for the ranking heuristic in
  `tests/components/catalogCollectionSelect.test.ts` (6 cases). Full
  suite: 95 tests pass; `bun run check` reports 0 errors and 0 warnings.
- Shipped the Phase 8 critical EV correctness fix: per-input wear-proportion
  averaging. The previous code computed `avg(raw input floats)` and treated
  that as a wear proportion, which is only correct when every input has
  range [0, 1]. CS2 actual mechanics normalize each input by its own range
  first (`(float − min) / (max − min)`), average those proportions, and
  then map the average through each output's range. Affected every EV
  computation in the system — basket builder UI, candidate evaluation,
  basket recomputeMetrics, and planner partition. New helpers
  `wearProportion` and `averageWearProportion` in `utils/float.ts`. New
  `enrichSlotsWithInputRanges` helper loads per-skin ranges from the
  catalog snapshot. `BasketSlotContext` carries `inputMinFloat` /
  `inputMaxFloat`. `BasketEVOptions.averageInputFloat` renamed to
  `averageWearProportion` so the semantics are explicit and the wrong
  value cannot be passed silently. Pool items now also carry input ranges
  so `partition.basketEV` can compute and pass the corrected proportion;
  `buildPool` is now async because it loads ranges via
  `getCatalogSkinFloatRange`. Added `tests/evaluation/wearProportion.test.ts`
  with 11 cases covering the helpers, the corrected projection (same raw
  float on different input ranges produces different output exteriors),
  and the missing-range fallback (projection is skipped, total EV still
  computes from collection weighting). Full suite: 89 tests pass,
  `bun run check` reports 0 errors and 0 warnings.
- Designed Phase 8: catalog-aware combobox authoring (text input with live
  filtering and dropdown suggestions, not a hard select), tradeup calculator
  scratchpad at `/calculator`, and saved-combination watchlist with
  `recheckProfitability` for re-evaluating against later price observations.
  Captured driving concerns: free-text collection inputs silently break rule
  matching, no scratchpad calculator exists for hypothetical baskets, no way
  to pin a buy-queue proposal for later re-check, and the planner partition
  optimizer ignores float-driven output exterior pricing. Audited the EV
  math: collection weighting (slot count / 10), within-collection
  `probabilityWeight`, simple-mean float averaging, per-skin float ranges,
  `projectOutputFloat` formula (`min + avg × (max - min)`), and
  observed-vs-plan-fallback pricing all correct. The one bug found:
  `partition.basketEV` does not pass `averageInputFloat` to
  `computeBasketEV`, so swap optimization cannot see float-driven exterior
  EV differences. Logged as the first deliverable in Phase 8.
- Completed Phase 7 end-to-end: shipped the `/buy-queue` operator page
  (server load + Svelte page) grouped by plan and proposed basket with
  inline alternatives disclosure, role badges, max-buy red-flag visualization,
  and a per-row Mark-Bought form that posts the assignment context. Added
  the sidebar nav entry. Extended `markBought` to accept optional
  `intendedBasketId` and `intendedSlotIndex` and best-effort reserve the new
  inventory item into the basket; failure modes (basket missing/non-BUILDING,
  slot occupied, full, rarity mismatch) return `basketReservation: { warning }`
  rather than reverting the candidate conversion. Added 7 integration tests
  under `tests/integration/plannerBuyQueue.test.ts` covering empty-pool,
  10-item single basket, 4-viable-baskets-from-40, existing-basket pinning
  honored, deterministic output, markBought success path, and markBought
  warning path. Full `bun test tests/` reports 78 tests passing;
  `bun run check` reports 0 errors and 0 warnings.
- Implemented Phase 7 core: shipped `CandidateAssignment` / `BuyQueueResult`
  types in `src/lib/types/services.ts`, the planner module under
  `src/lib/server/tradeups/planner/` (eligibility, partition, types), the
  `plannerService.buildBuyQueue` entry point in
  `src/lib/server/tradeups/plannerService.ts`, and the
  `GET /api/tradeups/buy-queue` route. The optimizer is the locked global
  partition design: pure-collection-first basket formation, mixed-basket
  fallback for leftovers, and a local-search swap pass that strictly
  improves total EV. Manual pins (inventory items already in BUILDING
  baskets) are honored as fixed inputs.
- Added 15 planner unit tests under `tests/planner/`. Coverage includes
  empty pool, single item reserved, ten-item pure basket, twenty-item
  two-basket split, existing 9-item basket completion, the locked
  39+1 → 4-viable-basket case (12+13+10+5 across four collections), uneven
  partition stranding, deterministic output across calls, and pure-collection
  basket formation when two collections both have ≥10 items.
- `bun test tests/` passes with 71 tests; `bun run check` reports 0 errors
  and 0 warnings.
- Phase 7 work still open: `/buy-queue` operator page, `markBought`
  assignment-context wiring, and an end-to-end integration test of
  `buildBuyQueue` against a seeded SQLite DB.
- Locked Phase 7 design in `docs/PLAN.md` and the Phase 7 Plan section of this
  document: the planner is a global partition optimizer over the full
  candidate + inventory pool against active plans and baskets, not a greedy
  per-candidate assigner. Adding the Nth item must produce the partition that
  maximizes total EV and viable-basket count, not the locally best home for
  that one item. Also captured the supporting concerns: alternatives must
  surface, tie-breaking must be visible, float-fit must be basket-aware, and
  manual operator pins are fixed inputs to the optimizer.
- Clarified the target operating model in `docs/PLAN.md`: the finished
  product should behave like a self-sustaining trade-up hunting assistant with
  plan-aware discovery, assignment, basket proposal, and buy-queue guidance,
  while leaving final marketplace actions to the human operator.
- Updated the evaluation and extension roadmap so the next product slice is
  planner assignment and buy-queue visibility before any Steam scraping or
  broader source adapter work.
- Updated this progress document with the current market-prices UI/API state,
  the planner/buy-queue next-step order, and a reusable next-session handoff
  prompt.
- Most recent code verification from the market-prices slice: `bun run check`
  passed, focused market-price tests passed, and a full `bun test tests/`
  attempt in the restricted sandbox hit `EPERM` while reading
  `node_modules\esm-env` during integration-test startup. This is recorded as
  an environment failure, not a known application failure.

### 2026-04-24

- Added `/market-prices` with a paginated latest-observation table, filters
  for search/source/currency, and import forms backed by the existing
  `POST /api/market-prices/import` endpoint.
- Extended `GET /api/market-prices/latest` so it still supports single
  latest-price lookup and now also returns a paginated observation list when
  called without lookup params.
- Added CSV import support on `POST /api/market-prices/import` using the same
  observation fields as JSON import, with all-or-nothing validation and
  per-row `rowErrors`.
- Added EV breakdown pricing source metadata and surfaced it in the basket
  builder details table, so each outcome shows whether the value came from an
  observed market price or the plan fallback.
- Added price freshness classification (`FRESH`, `RECENT`, `STALE`, `OLD`)
  for local market observations and displayed labels with relative age
  subtext, such as `Recent` with `(12 hrs ago)`, in `/market-prices` and
  basket EV pricing.
- Extracted local JSON/CSV market price import parsing into
  `src/lib/server/marketPrices/localImportAdapter.ts`, preserving the current
  manual import behavior while creating a narrow seam for future non-scraping
  source adapters.
- Added post-import EV refresh through
  `src/lib/server/marketPrices/refreshService.ts`: open candidates are
  re-evaluated and BUILDING/READY baskets are recomputed after successful
  JSON or CSV imports.
- Expanded `/market-prices` operator visibility with structured import
  result cards, basket refresh error display, and source/currency summaries
  showing observation counts, newest/oldest relative age, and freshness
  counts for the current filtered page.
- Added sort controls to `/market-prices` and corresponding
  `GET /api/market-prices/latest` query support for `observedAt`,
  `marketValue`, `source`, and `currency`.
- Added CSV file upload support to the `/market-prices` import form while
  preserving pasted CSV import behavior.
- Added `POST /api/market-prices/refresh` and a `/market-prices` Refresh EV
  button for rerunning dependent candidate/basket EV refresh without an
  import.
- Added a page-size control to the `/market-prices` filter bar.
- Added `GET /api/market-prices/summary` and wired `/market-prices` to use it
  for source/currency/freshness summaries across all matching observations.
- Added `latestOnly` support to `GET /api/market-prices/latest` and
  `GET /api/market-prices/summary`, plus a UI mode selector for latest rows
  versus full observation history.
- Expanded `/market-prices` import result cards to show distinct item count
  and catalog-linked observation count from the import response.
- Added derived source metadata via
  `src/lib/server/marketPrices/sourceMetadata.ts`, plus
  `GET /api/market-prices/sources` for observed source presets.
- Updated `/market-prices` to show source type badges in the table and
  summary, and to offer source presets through the source filter input.
- Added integration coverage for filtered market price observation listing,
  CSV import success, and CSV row validation failure.
- Added and applied the nullable plan catalog linkage migration.
- Regenerated Prisma Client after the schema change.
- Ran `bun run catalog:backfill-db`; current local DB matched 3/3 plan rules
  and 4/4 plan outcomes, and the second run was idempotent with 0 updates.
- `bun test tests/` passes with 26 tests.
- `bun run check` passes with 0 errors and 0 warnings.
- Added catalog-based output float/exterior projection in EV breakdowns and
  extension float-enrichment diagnostics.
- `bun test tests/` passes with 28 tests.
- `bun run check` passes with 0 errors and 0 warnings.
- Hardened the Steam Market bridge extraction path after code inspection:
  normal listing rows now receive controls without requiring CSFloat DOM,
  listing row IDs are accepted in addition to child name IDs, inspect-link
  replacement falls back to the requested listing ID, CSFloat min/max/paint
  metadata accepts more attribute/text variants, and inline success status
  includes normalization warning counts.
- Added a regression test for market-hash exterior versus float-derived
  exterior conflicts during extension normalization.
- `bun test tests/` passes with 29 tests.
- `bun run check` passes with 0 errors and 0 warnings.
- `node --check` passes for `page-bridge.js`, `content.js`,
  `background.js`, and `options.js`; `manifest.json` parses as MV3 JSON.
- Updated `tools/steam-market-bridge/README.md` with current inline status
  behavior and the recommended live smoke-test cases.
- During live operator smoke testing, normal, duplicate, and StatTrak rows
  saved and catalog-linked correctly. Candidate details in the app were too
  sparse for verifying listing/catalog identity fields, and observed bridge
  payloads had `inspectLink: null`.
- Expanded the candidate Details modal to show normalized identity, listing
  IDs/URLs, inspect-link presence, catalog linkage IDs, paint index, duplicate
  counters, and evaluation fields.
- Added a bridge inspect-link fallback that reads inspect anchors directly
  from the Steam listing row before falling back to Steam action templates.
- Live retesting confirmed inspect links now populate. Missing float
  enrichment still produced placeholder `0` float values, so text-based float
  extraction now requires a decimal-form value while explicit CSFloat
  attributes remain accepted.
- Added server-side normalization defense for placeholder zero floats:
  extension `floatValue: 0` is dropped with a warning when the item exterior
  is known and not `FACTORY_NEW`.
- `node --check tools/steam-market-bridge/page-bridge.js` passes.
- `bun test tests/` passes with 30 tests.
- `bun run check` passes with 0 errors and 0 warnings.
- Added disposable SQLite integration coverage for extension candidate
  ingestion and catalog linkage. The integration suite applies committed
  Prisma migrations to `prisma/test-integration.db` and verifies catalog-linked
  persistence, StatTrak normalization, duplicate listing merge behavior,
  placeholder zero-float dropping, and candidate-to-inventory catalog identity
  carryover.
- `bun test tests/` passes with 35 tests.
- `bun run check` passes with 0 errors and 0 warnings.
- Added the first pricing foundation: `MarketPriceObservation`, a local market
  price service, latest-price lookup by market hash and catalog exterior, and
  EV fallback logic that prefers latest observed projected-exterior prices
  before using plan outcome values.
- Regenerated Prisma Client after the market price observation schema change.
- Added local JSON price observation import and latest-price lookup API routes:
  `POST /api/market-prices/import` and `GET /api/market-prices/latest`.
- `bun test tests/` passes with 39 tests.
- `bun run check` passes with 0 errors and 0 warnings.
- Live Chrome/Steam smoke testing was not completed in this sandbox; remaining
  validation is to ingest real rows and record catalog-linked versus
  catalog-unmatched outcomes.

### 2026-04-22

- `bun run check` passes with 0 errors and 0 warnings.
- `bun run build` passes when run outside the sandbox. The sandboxed run can
  fail on Windows with `spawn EPERM` while Vite/Tailwind loads native
  bindings.
- Dev-server smoke test:
  - `GET /api/candidates` returned 200 with seeded candidate JSON.
  - `GET /api/analytics/summary` returned 200 with seeded dashboard JSON.
- Corrected the executed-basket seed metric:
  `totalCost: 19.50`, `expectedEV: 6.35`, `expectedProfit: -13.15`,
  `expectedProfitPct: -67.44`.
- Updated the existing local SQLite row to match the corrected seed value.

---

## Change Log

### 2026-04-24 (Catalog-aware plan evaluation linkage)

- Added nullable catalog identity columns to `TradeupOutcomeItem` and nullable
  `catalogCollectionId` to `TradeupPlanRule`.
- Updated plan rule/outcome writes and the catalog DB backfill tool to resolve
  those identifiers from the static catalog snapshot.
- Updated rule matching, basket readiness, inventory eligibility, candidate EV,
  basket EV, and marginal contribution calculations to prefer
  `catalogCollectionId` before falling back to collection strings.
- Added regression coverage for catalog-ID rule matching and EV grouping.

### 2026-04-24 (Catalog EV projection and ingestion diagnostics)

- Enriched basket EV breakdowns with projected output float, projected
  exterior, and projected market hash name using catalog skin min/max ranges.
- Typed optional bridge enrichment fields (`minFloat`, `maxFloat`,
  `paintIndex`) at the extension ingestion boundary.
- Added normalization warnings for contradictory extension exterior/float
  metadata while keeping ingestion permissive.
- Updated the Steam Market bridge row status to show whether the saved
  candidate was catalog-linked.

### 2026-04-24 (Bridge ingestion hardening)

- Updated the bridge content script to attach controls to standard Steam
  listing rows, not only rows with CSFloat markers, so rows with missing float
  enrichment can still be ingested.
- Made listing ID extraction accept row-level `listing_<id>` IDs as well as
  child `listing_<id>_...` IDs.
- Made inspect-link template replacement use the requested listing ID when
  Steam's listing info object does not repeat it, added `%appid%`
  replacement, and preserved zero-valued asset property substitutions.
- Broadened CSFloat metadata extraction to tolerate common min/max attribute
  aliases and text labels for float range, pattern, and paint index.
- Added inline warning counts for successful bridge ingestion responses.
- Added normalization coverage for market-hash exterior values that conflict
  with float-derived exterior values, keeping ingestion permissive.
- Updated the bridge README with the current smoke-test checklist and status
  output semantics.
- Added app-side candidate detail visibility for live ingestion verification
  and a DOM-based inspect-link extraction fallback after live rows showed null
  inspect links.
- Tightened bridge text parsing so missing-float placeholders like `Float: 0`
  are not persisted as real zero floats.
- Added normalization coverage to drop contradictory placeholder zero floats
  for non-Factory-New extension rows.

### 2026-04-24 (Candidate ingestion integration tests)

- Added `tests/helpers/db.ts` to create a disposable SQLite database from the
  committed Prisma migration SQL.
- Added `tests/integration/candidateIngestion.test.ts` covering real service
  writes for extension ingestion, catalog-linked identity, StatTrak
  normalization, duplicate merges, placeholder zero-float handling, and
  `markBought` inventory identity carryover.
- Extended the local `bun:test` type shim for `beforeAll` and `afterAll`.
- `bun test tests/` passes with 35 tests.
- `bun run check` passes with 0 errors and 0 warnings.

### 2026-04-24 (Market price observation foundation)

- Added nullable/additive `MarketPriceObservation` persistence for local price
  observations keyed by market hash and catalog identity.
- Added `src/lib/server/marketPrices/priceService.ts` for creating
  observations and reading latest prices by market hash or catalog
  skin/exterior.
- Updated basket and candidate EV paths to enrich plan outcomes with latest
  observed prices and prefer projected-exterior market prices when available,
  while preserving plan outcome `estimatedMarketValue` as fallback.
- Added tests for latest price lookup, catalog identity on price observations,
  dynamic projected-exterior EV, and fallback EV behavior.
- Regenerated Prisma Client and applied
  `20260424020000_market_price_observations` to the local SQLite dev database.
- Added local JSON import and latest lookup endpoints:
  `POST /api/market-prices/import` and `GET /api/market-prices/latest`.
- Added `/market-prices` as the first operator UI for inspecting local price
  observations and importing JSON or CSV batches.
- Basket EV breakdowns now expose `priceSource` and `priceMarketHashName`;
  the basket builder displays those fields next to projected exterior, price,
  probability, and contribution.
- Basket EV observed-price rows also expose `priceObservedAt` and
  `priceFreshness`; fallback rows remain visibly marked as plan fallback.
- `POST /api/market-prices/import` delegates local JSON/CSV normalization to
  the local import adapter; future source adapters should produce the same
  validated `{ source, observations }` import input.
- Price import responses include refresh counts for candidates and baskets;
  the `/market-prices` success message surfaces those counts.
- The `/market-prices` table now has a lightweight grouping summary for the
  currently loaded filtered observations. Charts and history backfill remain
  deferred.
- Latest price observation sorting is now explicit in the UI and API; default
  remains newest observed first.
- CSV imports can now be file-based from the browser UI; server-side
  validation and per-row errors still flow through the same local import
  adapter path.
- Manual dependent EV refresh is available from the market prices page and
  uses the same refresh service as successful imports.
- The market price admin table can now change row count without hand-editing
  query parameters.
- Market price summaries now reflect the active filter set across the full
  matching result set while the table remains paginated.
- The market price admin page now separates the operational latest-price view
  from full local observation history without adding charts or backfill.
- Import feedback now makes catalog linkage visible immediately after a JSON
  or CSV batch is submitted.
- Source classification is currently derived from source names and does not
  require a migration. Future adapters should set stable source names so this
  classification remains useful.
- Finished price automation direction is now documented in `docs/PLAN.md`:
  adapters or file drops should bulk insert normalized observations through
  the same inspectable pipeline, with source/freshness/history visible before
  EV-driven decisions; Steam buying/selling automation remains out of scope.
- Added integration coverage for local batch price imports.
- `bun test tests/` passes with 39 tests.
- `bun run check` passes with 0 errors and 0 warnings.
- New external price source adapters, automated scraping, and automated buying
  remain out of scope.

### 2026-04-23 (Phase 6 workstream A ECharts dashboard charts)

- Added the `echarts` runtime dependency.
- Added client-only line and bar chart wrappers plus shared chart theme
  helpers under `src/lib/components/charts/`.
- Added expected-vs-realized and plan-performance chart option helpers in
  `src/lib/client/viewModels/dashboard.ts`.
- Updated `/dashboard` to render charts with raw table fallbacks under
  collapsed `<details>` elements.
- New endpoints: none. New dependencies: `echarts`. New files:
  `LineChart.svelte`, `BarChart.svelte`, and `theme.ts`.
- Verified `bun run check`, `bun run build`, `bun test tests/`,
  `bun prisma migrate deploy`, `bun prisma db seed`, and confirmed
  `.svelte-kit/output/server` contains no `echarts` references.

### 2026-04-23 (Phase 6 workstream B CSV exports)

- Added `src/lib/server/utils/csv.ts` with RFC 4180 escaping and
  spreadsheet formula-injection prefixing for leading `=/+/@/-` cells.
- Added `GET /api/exports/executions.csv` and
  `GET /api/exports/expected-vs-realized.csv`.
- Added export triggers on `/tradeups/executions` and `/dashboard`.
- Added CSV helper unit coverage under `tests/utils/csv.test.ts`.
- New endpoints: `GET /api/exports/executions.csv`,
  `GET /api/exports/expected-vs-realized.csv`. New dependencies: none.
  New files: CSV helper, export routes, and CSV helper test.
- Verified `bun run check`, `bun run build`, `bun test tests/`,
  `bun prisma migrate deploy`, and `bun prisma db seed`.

### 2026-04-23 (Phase 6 workstream C plan-aware inventory eligibility)

- Added `GET /api/inventory/eligible?planId=...` with pagination and sort
  query support.
- Added `eligibleInventoryFilterSchema` and
  `inventoryService.listEligibleInventoryForPlan`.
- Updated the basket builder to call the plan-aware endpoint and removed the
  Phase 4 client-side eligibility workaround.
- New endpoints: `GET /api/inventory/eligible`. New dependencies: none. New
  files: `src/routes/api/inventory/eligible/+server.ts`.
- Verified `bun run check`, `bun run build`, `bun test tests/`,
  `bun prisma migrate deploy`, and `bun prisma db seed`.

### 2026-04-23 (Phase 6 workstream E bun test starter suite)

- Added the root `tests/` starter suite for expected value, scoring,
  recommendation, duplicate detection, and basket readiness pure logic.
- Added `bun test tests/` as the package `test` script.
- Extracted basket readiness checks into
  `src/lib/server/tradeups/evaluation/readiness.ts` and added a
  `RULE_MISMATCH` readiness issue for items that do not match any plan rule.
- New endpoints: none. New dependencies: none. New files: `tests/**` and the
  readiness helper.
- Verified `bun test tests/` and `bun run check`.

### 2026-04-23 (Phase 6 workstream D typed service errors)

- Migrated service throw sites in candidate, inventory, plan, basket,
  execution, and evaluation services to typed `HttpError` subclasses.
- Marked the substring classifier in `src/lib/server/http/errors.ts` as a
  deprecated legacy fallback.
- New endpoints: none. New dependencies: none. New files: none.
- Verified `bun run check` after each service migration.

### 2026-04-23 (Post-Phase 6 extension bridge and plan-debugging follow-up)

- Added a local MV3 companion extension under `tools/steam-market-bridge/`
  with an options page, Steam page extraction, and POST relay to
  `POST /api/extension/candidates`.
- Hardened bridge ingestion by stripping null optional fields, normalizing
  currency handling, and exposing inline debug details for extracted payloads
  and server responses.
- Added server-side ingestion diagnostics for duplicate-match reasons,
  normalization warnings, and per-plan rule failure breakdowns when a
  candidate evaluates to `INVALID`.
- Fixed duplicate detection so Steam Market page URLs are not treated as
  row-unique listing identifiers.
- Fixed SSR pagination link generation on candidates, inventory, plans,
  baskets, and executions by removing `window.location.search` usage from
  server-rendered paths.
- Fixed plan metadata updates so `inputRarity`, `targetRarity`,
  `description`, and `minCompositeScore` persist correctly, and widened plan
  re-evaluation fan-out so previously `INVALID` candidates are reconsidered
  after plan changes.
- New endpoints: none. New dependencies: none. New files:
  `tools/steam-market-bridge/**`.
- Verified `bun run check` plus targeted duplicate-detection tests after the
  bridge/debugging fixes.

### 2026-04-22 (Phase 4 candidates UI)

- Added shared Phase 4 UI plumbing: typed API fetch wrapper, data table,
  filters, pagination, status badges, confirmation modal, formatters, and
  shared error page.
- Shipped `/candidates` with filtered SSR list, manual creation, status
  updates, buy conversion, re-evaluation, delete confirmation, and inline
  API validation feedback.
- Verified `bun run check` passes with 0 errors and 0 warnings. `bun run
  build` still hits the known sandbox `spawn EPERM` native-binding issue.

### 2026-04-22 (Phase 4 inventory UI)

- Shipped `/inventory` with filtered SSR list, manual inventory creation,
  status/value/notes editing, delete confirmation, and empty-state filter
  clearing.
- Verified `bun run check` passes with 0 errors and 0 warnings. `bun run
  build` still hits the known sandbox `spawn EPERM` native-binding issue.

### 2026-04-22 (Phase 4 trade-up plans UI)

- Shipped `/tradeups/plans` with filtered SSR list, plan metadata update,
  create/delete flows, and nested rule/outcome add/update/delete forms.
- Surfaced plan refinement failures for adjacent target rarity and rule
  float bounds inline from the API `issues[]` envelope.
- Verified `bun run check` passes with 0 errors and 0 warnings. `bun run
  build` still hits the known sandbox `spawn EPERM` native-binding issue.

### 2026-04-22 (Phase 4 trade-up baskets UI)

- Shipped `/tradeups/baskets` with filtered SSR list, create/update/delete,
  builder modal, add/remove item forms, ready transition, and cancel
  confirmation.
- Used the documented Phase 4 workaround for plan-aware eligibility:
  fetch `availableForBasket=true` inventory and filter by plan/rules in the
  basket view model. No new API route was added.
- Called `/api/tradeups/evaluate` before readying a basket and surfaced
  `BasketReadinessIssue[]` inline on failure.
- Verified `bun run check` passes with 0 errors and 0 warnings. `bun run
  build` still hits the known sandbox `spawn EPERM` native-binding issue.

### 2026-04-22 (Phase 4 executions UI)

- Shipped `/tradeups/executions` with filtered SSR history, create from
  READY basket, result recording, sale recording, and expected-vs-realized
  delta display.
- Verified `bun run check` passes with 0 errors and 0 warnings. `bun run
  build` still hits the known sandbox `spawn EPERM` native-binding issue.

### 2026-04-22 (Phase 4 dashboard UI)

- Shipped `/dashboard` with KPI cards, activity feed, plan performance
  table, and expected-vs-realized table fallback.
- Confirmed the analytics summary response shape in
  `src/lib/server/analytics/analyticsService.ts` and pinned the matching
  UI DTO in `src/lib/client/viewModels/dashboard.ts`.
- Verified `bun run check` passes with 0 errors and 0 warnings. `bun run
  build` still hits the known sandbox `spawn EPERM` native-binding issue.

### 2026-04-22 (Phase 4 operator UI shipment)

- Completed all six Phase 4 operator UI surfaces: dashboard, candidates,
  inventory, plans, baskets, and executions.
- Kept page loads/actions behind same-origin `/api/**` calls and avoided
  service/API route changes.
- Verification: final `bun run check` passes with 0 errors and 0 warnings;
  final `bun run build` remains blocked in this sandbox by the documented
  Windows `spawn EPERM` native-binding issue.

### 2026-04-22 (Phase 5 continuation)

- Resumed partial Phase 5 work without reverting prior edits.
- Completed the unfinished inventory bulk-selection row wiring.
- Added basket builder multi-select and bulk-add form using the existing
  `/api/tradeups/baskets/[id]/items/bulk` endpoint.
- Verified `bun run check` passes with 0 errors and 0 warnings.
- Verified `bun prisma migrate deploy` reports no pending migrations and
  `bun prisma db seed` completes successfully once Prisma engine access is
  allowed.
- Added `docs/INTEGRATION_RESEARCH.md` with CS2 Trader bridge notes and
  external trade-up source recommendations.

### 2026-04-22 (Documentation and Phase 3 verification)

- Fixed Phase 3 type drift:
  - Removed stale generic arguments from SvelteKit `json()` calls in
    `src/lib/server/http/errors.ts`.
  - Loosened the Zod object shape cast in
    `src/lib/server/http/query.ts`.
- Verified `bun run check` is clean.
- Verified `bun run build` outside the sandbox.
- Smoke-tested representative API routes against the seeded SQLite DB.
- Corrected bad expected-profit math in `prisma/seed.ts` and the local
  `prisma/dev.db` row.
- Removed stale root handoff docs because they contradicted the current
  codebase and `docs/PROGRESS.md`.
- Rewrote `docs/PROGRESS.md` to reflect the actual repo state.

### 2026-04-21 (Phase 3 scaffold)

- Scaffolded the SvelteKit API layer under `src/routes/api/` covering every
  endpoint in `docs/PLAN.md` > Core Programmatic Endpoints plus rule,
  outcome, basket-item, execution result/sale, and analytics sub-resources.
- Added shared HTTP helpers:
  - `src/lib/server/http/errors.ts`
  - `src/lib/server/http/query.ts`
  - `src/lib/server/http/extensionAuth.ts`
- Added `src/lib/schemas/evaluate.ts` with the discriminated-union schema
  mirroring `EvaluateTarget`.
- Added `src/routes/api/README.md`.
- Wired route bodies to services with Zod parsing at the boundary and DTO
  passthrough responses.

### 2026-04-21 (Phase 2 implementation)

- Implemented candidate normalization, duplicate merging/staleness,
  candidate CRUD, extension ingestion, buy conversion, and open-candidate
  re-evaluation.
- Implemented inventory ledger reads/writes, basket eligibility, candidate
  conversion alias, DTO mapping, and status-machine enforcement.
- Implemented trade-up plan CRUD, rule/outcome management,
  target-rarity validation, delete guards, DTO mapping, and eager candidate
  re-evaluation fan-out.
- Implemented basket CRUD, item reservation/release, READY/CANCELLED
  transitions, transaction-safe reordering, and eager metric recomputation.
- Implemented evaluation utilities and orchestrator: rule matching, CS2
  collection-weighted EV, scoring, recommendations, and persisted candidate
  evaluation.
- Implemented execution reads, atomic READY-to-EXECUTED creation, result
  recording, sale recording, and realized profit calculations.
- Implemented analytics dashboard summary, plan performance rollups,
  live-row activity feed, and expected-vs-realized execution series.
- Added `src/lib/types/services.ts`.
- Added `src/lib/server/README.md`.

### 2026-04-21 (Phase 1 foundation)

- Scaffolded the SvelteKit + TypeScript app using current Svelte CLI and
  Bun-managed dependencies.
- Added TailwindCSS 4.x Vite integration, global theme CSS variables, glow
  utilities, and app flash-prevention script.
- Added fixed sidebar app shell, active route highlighting, and Svelte 5
  runes theme store using `cs-tradeups-theme`.
- Added placeholder pages for `/dashboard`, `/candidates`, `/inventory`,
  `/tradeups/plans`, `/tradeups/baskets`, and `/tradeups/executions`; `/`
  redirects to `/dashboard`.
- Added basic UI primitives: Button, Card, Input, Badge, and Modal.
- Added `.env.example` with local SQLite URL shape.
- Pinned Prisma to 6.x because Prisma 7 rejects the current
  `datasource.url` contract.
- Generated and applied the initial SQLite migration.
- Seeded the local database successfully.

### 2026-04-20 (Documentation baseline)

- Replaced placeholder planning/status docs with authoritative project
  versions.
- Synchronized the project documentation structure with the useful parts of
  the `zwift-completionist` reference docs while adapting content to the CS
  trade-up workflow.
- Deleted `starting_plan.md` after incorporating relevant content.
- Added domain enums and clarified extension ingestion assumptions.
- Updated stack direction to Svelte 5, TailwindCSS 4.x, and ECharts.
- Cleaned up `docs/UI_STYLE_GUIDE.md` for CS2 rarity colors and the correct
  localStorage key.




















### Price Automation Plan

**Problem.** The trade-up calculator, planner, recheck flow, and saved-combinations drift signal all read `MarketPriceObservation` rows. CS2 has roughly 12,000 distinct skin × exterior × StatTrak combinations. The operator cannot maintain that table manually. Without automation, every dependent feature returns 0 EV.

**Constraints.**
- Single-user local-first app; no public server, no API keys we can ship safely.
- Steam Marketplace official endpoints exist but are aggressively rate-limited and "unsupported" (Valve can change/remove them without notice).
- Bot-style automation against Steam violates ToS and risks account bans.
- The operator does NOT want any automated buying/selling — only price ingestion.
- Existing `MarketPriceObservation` schema is source-tagged and freshness-aware, so we can mix multiple adapters cleanly.

**Recommended primary source: Skinport public API.**

- Endpoint: `https://api.skinport.com/v1/items?app_id=730&currency=USD`
- Returns: every CS2 item Skinport tracks, with `market_hash_name`, `min_price`, `max_price`, `mean_price`, `median_price`, `quantity`, `created_at`, `updated_at`.
- Single request returns the full catalog (~12k items, ~2 MB response).
- Rate limit: 8 requests per 5 minutes (per IP). One refresh per hour is well under the limit.
- Free, documented at `https://docs.skinport.com/`. CORS is enabled.
- Authentication NOT required for the items endpoint.
- Caveat: Skinport is a third-party marketplace, so its prices skew slightly lower than Steam Market. For relative drift / EV comparison this is fine; for an "exact Steam buy price" we'd want a second source.
- Optional: their `/v1/sales/history` endpoint gives per-item daily/weekly aggregates if we ever want trend lines.

**Recommended fallback / cross-check: Steam priceoverview endpoint.**

- Endpoint: `https://steamcommunity.com/market/priceoverview/?appid=730&currency=1&market_hash_name=<encoded>`
- Returns: `{ lowest_price, median_price, volume }` (Steam's own market).
- Rate limit: ~20 requests/minute unauthenticated, with hard bans if abused. Cannot be used for bulk; only for spot-checking specific items.
- Use for: items the operator is about to buy (just before purchase) and items where Skinport's price diverges from Steam suspiciously.
- Implementation: a per-item resolver hit on demand from the buy-queue listing modal, NOT a bulk job.

**Architecture sketch.**

1. **Adapter pattern.** Each price source implements:
   ```ts
   interface PriceAdapter {
     readonly source: string;          // 'SKINPORT' | 'STEAM_PRICEOVERVIEW' | ...
     fetchAll?: () => Promise<NormalizedObservation[]>;     // bulk
     fetchOne?: (marketHashName: string) => Promise<NormalizedObservation | null>;  // on-demand
   }
   ```
   `NormalizedObservation` is the existing `MarketPriceObservation` insert shape.

2. **Bulk refresh job.** A long-running script (`tools/refresh-prices.ts`) that runs adapters that implement `fetchAll`, normalizes results, deduplicates against existing recent observations, and bulk-inserts into `MarketPriceObservation`. Runnable manually OR via Windows Task Scheduler / cron on a daily/hourly cadence.

3. **Manual trigger.** A "Refresh prices" button on `/market-prices` POSTs to `/api/market-prices/refresh` which invokes the same job in-process. Existing endpoint stub at `src/routes/api/market-prices/refresh/+server.ts` should be extended to wire up the adapter(s).

4. **On-demand single-item lookup.** When the operator opens the buy-queue listing modal for a specific candidate, optionally fire `/api/market-prices/refresh-one?marketHashName=...` which uses Steam priceoverview for an authoritative latest. Surface the result inline in the modal.

5. **Source freshness UI.** The market-prices page already shows freshness badges (FRESH/RECENT/STALE/OLD) per observation. Once multiple sources are in play, also let the operator filter by source and see "last refreshed" per source on the page header.

6. **Dedupe & re-write rules.**
   - When a Skinport bulk refresh writes 12k rows, that's fine — append-only history.
   - The "latest" lookup (`getLatestMarketPricesForMarketHashNames`) already returns the newest by `observedAt`, so a new bulk run automatically shadows the old.
   - Older rows aren't deleted; they form the trend history for future charting.

**Implementation sequence (when this lands as a real coding slice).**

1. Build `src/lib/server/marketPrices/adapters/skinport.ts` — fetches the items endpoint, parses, returns `NormalizedObservation[]` with `source: 'SKINPORT'`.
2. Build `src/lib/server/marketPrices/refreshJob.ts` — orchestrates adapters, persists results in a transaction, returns a summary `{ adapter, written, errors }[]`.
3. Wire `POST /api/market-prices/refresh` to invoke the refresh job. Already-existing endpoint stub should accept the new path.
4. Add a "Refresh from Skinport" button to `/market-prices` that calls the endpoint and surfaces the summary. Keep the existing CSV/JSON accordion as the manual path.
5. Build `src/lib/server/marketPrices/adapters/steamPriceoverview.ts` for single-item fallback. Add a small in-memory rate limiter (1 request per 3 seconds) so it can never accidentally be used for bulk.
6. Add `tools/refresh-prices.ts` — CLI wrapper around the same job, for cron / task-scheduler use without needing the dev server. Hits Prisma directly, NOT the HTTP API.
7. Once the bulk refresh has been running for a few days, recheck on saved combinations becomes meaningful and the saved-tradeups page (especially the 552 imported tradeuplab combos) becomes a live drift dashboard.

**What NOT to build.**

- A Steam scraping adapter that hits market listing pages or `/market/search` — those are the rate-limited, ban-risk endpoints. Use Steam priceoverview only as a per-item fallback, never for bulk.
- A bot that logs into a Steam account. No account auth, no Steam Guard handling, nothing that touches Steam APIs requiring login.
- Currency conversion. Skinport supports `currency=USD` natively; only multi-currency users need conversion and we don't.
- Aggressive freshness thresholds that delete rows. Append-only history is cheap (SQLite, tens of MB at most) and the trend data is valuable.

**Operator setup once this exists.**

1. Click "Refresh from Skinport" on `/market-prices` once. Confirms the pipeline works.
2. Set up a Windows Task that runs `bun run tools/refresh-prices.ts` every 6 hours (or whatever cadence the operator wants).
3. Optionally add an authoritative cross-check for hot items by clicking the "Check Steam price" button on the buy-queue modal before purchase.

### Running Queue (low-urgency, take when convenient)

Each item is small and independent — pick whichever feels relevant when working in adjacent code. Not blocking anything.

- **Surface accessoryCount on inventory rows.** Adapter already captures it. A skin with stickers/charms may be worth materially more than a base skin; today the operator can't see that from the inventory list. Add a small badge ("3 stickers") on InventoryRow + the Steam picker dropdown.
- **Surface paintSeed (pattern) in inventory UI + as a filter.** Linker backfills `InventoryItem.pattern` from Steam, but it's not displayed or filterable. For most trade-ups this doesn't matter, but specific patterns command premiums (Case Hardened blue gems, Karambit Doppler phases, etc.).
- **Steam picker on ManualAddInventoryModal.** Currently typing market-hash-name + float by hand. Share the picker logic from RecordResultModal so manual additions pull from the live Steam inventory the same way execution results do.
- **Linker matching tests.** Three unit tests covering FLOAT_EXACT / FLOAT_BACKFILL / FIFO_FALLBACK paths in steamLinkService. Protects against regression when the adapter or matching logic shifts.
- **Pattern-aware EV bonus.** TradeupOutcomeItem could carry an optional patternBonus map for known premium patterns (e.g., Case Hardened seed 387 = Scar Pattern → 5x base value). Out-of-MVP but worth a stub if it ever becomes load-bearing.
- **Sticker-aware EV.** Stickers don't transfer through tradeups — they're destroyed when the contract executes. So a sticker-laden basket input is a *worse* trade-up input than its market price implies. Future: warn when a basket includes high-sticker-value items.
- **Tradeuplab quarantine investigation.** The importer quarantined 6 very-low-ID cards (e.g., #1209, #1226, #1238, #1260, #1278, #11966) as "invalid card" — they predate the current DOM structure. Sub-1% of the import; only worth fixing if you actually want those specific historical combos.
- **Bulk recheck across saved combinations.** With ~550 imported combos, hitting "Recheck" individually is tedious. A batch-recheck endpoint (POST /api/tradeups/combinations/recheck-all or similar) that runs through all active or all draft combinations in one go would let you sort by current delta vs thesis to find the still-profitable ones quickly. **Blocked on the Price Automation Plan landing — no point bulk-rechecking against an empty price table.**
- **Filter / sort on /tradeups/saved.** With ~550 entries, the page becomes a wall. Add filters by target rarity / collection / source plus sort by latest profit delta. Currently it's a chronological scroll.
- **Optional: seed MarketPriceObservation from imported tradeuplab outcome prices.** The importer stashes outcome prices in notes JSON with their `identifiedAt` date. Could be written as observations tagged `source: 'TRADEUPLAB_IMPORT'` so historical-but-better-than-nothing prices populate the table before automated price refresh exists. Caveat: many imported combos are months old, so the prices would be marked STALE/OLD by freshness logic. Useful as a stopgap; replaced once the Skinport adapter lands.

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
