# CS Tradeups - Progress

## Status Snapshot

**Project Status:** Phase 6 MVP implemented and verified; Phases 0-6 complete
**Last Updated:** 2026-04-24
**Plan Reference:** See `docs/PLAN.md`

---

## Current Reality

As of 2026-04-24, this repository has a Bun-managed SvelteKit app with a
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
- Extension ingestion accepts typed float-enrichment metadata
  (`minFloat`, `maxFloat`, `paintIndex`) and returns warnings for
  contradictory extension metadata without rejecting the row.
- The Steam Market bridge surfaces whether a saved candidate was catalog
  linked or catalog unmatched in its inline row status.

What does not exist yet:

- Svelte component tests.
- Automated end-to-end browser coverage for the companion bridge.
- Dynamic marketplace price/volume tables. EV values remain plan-managed and
  liquidity still uses the candidate-density proxy.

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

- **Catalog-priced EV by projected exterior.** EV still uses manually stored
  outcome market values as-is; there is no dynamic price table to select a
  different value for the projected exterior.
- **Real marketplace-volume liquidity signal.** `computeLiquidityScore` uses
  the Phase 5 density proxy until a listing-volume signal is available.
- **Bridge hardening on real-market usage.** The local companion extension
  now has first-pass static hardening for missing float enrichment, listing
  row ID extraction, inspect-link placeholder replacement, and float metadata
  extraction drift. A true Chrome/Steam live-page smoke test still needs to
  validate selector durability and catalog-linked versus catalog-unmatched
  results against real listings.
- **Notifications beyond queue visibility.** MVP likely skips; revisit.

---

## Immediate Next Steps

Phase 6 plus the catalog identity integration slice completes the scoped MVP
foundation. The next session should focus on proving the real ingestion loop
before adding pricing, marketplace ingestion, plan tuning, or unrelated UI.

Recommended handoff order:

1. **Live bridge smoke test.**
   - Start the app with `EXTENSION_SHARED_SECRET` configured.
   - Load `tools/steam-market-bridge/` as an unpacked Chrome extension.
   - Open several real Steam Market CS2 listing pages with CS2 Trader /
     CSFloat float enrichment enabled.
   - Ingest a small sample across common cases: exact catalog match,
     StatTrak/Souvenir prefix, missing float enrichment, missing inspect link,
     and a duplicate listing.
   - Record which rows save as catalog-linked versus catalog-unmatched.
   - Remaining from the 2026-04-24 sandbox session: this was not completed
     because the session could not load Chrome/Steam pages. Static extraction
     failures found during code inspection were fixed and covered where they
     touch server normalization.

2. **Tighten bridge extraction based on observed failures.**
   - Primary files: `tools/steam-market-bridge/page-bridge.js`,
     `tools/steam-market-bridge/content.js`,
     `src/lib/server/candidates/normalization.ts`,
     `src/lib/server/catalog/linkage.ts`.
   - Fix only concrete live failures: selector drift, wrong listing id,
     bad inspect-link template replacement, bad collection/rarity/exterior
     extraction, missing float fields, or misleading inline diagnostics.
   - Keep ingestion permissive. Warnings are preferred over rejecting rows
     unless the app cannot create a valid candidate.

3. **Validate server-side persistence and evaluation after live ingestion.**
   - Confirm new candidates have correct `catalogSkinId`,
     `catalogCollectionId`, `catalogWeaponDefIndex`, and `catalogPaintIndex`
     when a real catalog match exists.
   - Confirm unmatched rows are legitimate extension/manual edge cases, not
     catalog linker bugs.
   - Re-run affected candidates with `POST /api/candidates/[id]/reevaluate`
     or bulk open re-evaluation if plan/rule data changes.

4. **Add regression coverage for any fixed edge case.**
   - Prefer focused unit tests under `tests/catalog/`, `tests/candidates/`,
     or `tests/evaluation/`.
   - Run `bun test tests/` and `bun run check`.
   - If Prisma schema changes are unavoidable, keep them nullable/additive,
     regenerate Prisma Client, run `bunx prisma migrate deploy`, and update
     this document.

5. **Only after bridge/linkage confidence, choose the next larger slice.**
   - Option A: replace density-based liquidity with a real market-volume
     signal.
   - Option B: add dynamic projected-exterior price support from a real price
     table.
   - Option C: add database integration tests if live ingestion exposes query
     regressions.

Do not invent catalog matches for fake seed/filler rows. Do not start
marketplace price ingestion or plan-discovery import work until the live
candidate ingestion loop is proven stable.

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

### 2026-04-24

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
