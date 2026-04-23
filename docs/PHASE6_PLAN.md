# Phase 6 — Quality & Decision Support: Implementation Plan

**Status:** Scoping outline. No behavior implemented yet.
**Last Updated:** 2026-04-22
**Scope (from `docs/PLAN.md` §Phase 6):**

- realistic seed data expansion
- dashboard refinements
- expected vs realized comparisons
- export/reporting helpers if needed

**Exit criteria (from `docs/PLAN.md`):** "the app provides trustworthy
historical performance insight."

**Companion:** `docs/PLAN.md` (intended direction), `docs/PROGRESS.md`
(actual state), `docs/PHASE4_UI_PLAN.md` (operator UI baseline),
`docs/PHASE5_PLAN.md` (scoring/workflow baseline),
`src/routes/api/README.md` (API surface), `src/lib/server/README.md`
(service contracts).

**Phase 6 is MVP-done.** Anything not listed here is deferred beyond
MVP (see §7). The goal of this phase is not feature breadth; it is to
make the historical view trustworthy, the error model typed, and the
core behaviors verifiable by a test runner so the project can be
operated on real data with confidence.

---

## 1. Global Conventions (Phase 6)

Phase 5 moved under `src/lib/server/**`. Phase 6 is cross-cutting: UI
(charts), exports (new routes), error model (service layer), and
tests (new tree). Prior conventions still apply:

- **Validation at boundaries.** Every new input shape gets a Zod
  schema under `src/lib/schemas/**`. Route handlers stay thin.
- **DTO boundary.** Services return plain numbers; `Decimal` never
  leaks. New fields extend `$lib/types/services.ts`, not Prisma rows.
- **Pages never import `$lib/server/**`.** UI data flows through
  `/api/**` via `src/lib/client/api.ts`.
- **Svelte 5 runes only.**
- **URL-mirrored filter state** on any new filter UI.

New conventions this phase introduces:

- **One dependency is explicitly allowed:** `echarts` (see §3.A).
  No other runtime dependencies without an explicit justification in
  this document.
- **Test conventions.** Tests live under `tests/` at repo root (not
  `src/**/__tests__`) so production and test code stay cleanly
  separated. Filenames are `<area>.test.ts`. Runner is `bun test`.
  Tests must not touch `prisma/dev.db` — either use an in-memory
  SQLite URL or mock the `db` import. See §3.E.
- **Typed errors are the contract.** After the §3.D migration, the
  substring classifier in `src/lib/server/http/errors.ts` is
  deprecated. New service throws MUST be typed (`NotFoundError`,
  `ConflictError`, etc.). The classifier stays in place as a
  safety net for the first release but is expected to be dead code
  by end of phase.
- **Exports are additive read endpoints.** Export routes never
  mutate state. They accept the same filters as their list
  counterparts and return `text/csv` with
  `Content-Disposition: attachment; filename=<name>-<yyyymmdd>.csv`.
- **Chart data is table data.** Every chart on `/dashboard` renders
  from a DTO shape that is already serialized as a table fallback
  in the same response — so a future "copy as CSV" or export pulls
  the same numbers.

---

## 2. Workstreams (Summary)

Phase 6 has five workstreams, sequenced by dependency:

| # | Workstream                              | Primary area                        | Depends on |
| - | --------------------------------------- | ----------------------------------- | ---------- |
| A | ECharts install & dashboard chart surfaces | `/dashboard`, `$lib/components/charts/**` | —    |
| B | CSV export helpers (minimal)            | `/api/exports/**`, per-page buttons | —          |
| C | Plan-aware inventory eligibility endpoint | `inventory/*`, basket builder UI  | —          |
| D | Typed service errors migration          | `$lib/server/**`, `http/errors.ts`  | —          |
| E | Automated test coverage (bun test)      | `tests/**`                          | D          |

E is scheduled last because typed errors in D make test assertions
clean (`expect(fn).toThrow(NotFoundError)` instead of regex on
message strings).

Seed-data expansion and broader analytics refinements are
**intentionally not workstreams** — see §4.

---

## 3. Per-Workstream Plans

### 3.A — ECharts Install & Dashboard Charts

**Goal:** replace the Phase 4 table-fallback on `/dashboard` with real
charts, and give expected-vs-realized the treatment originally
planned in Phase 4.

#### A.1 Dependency

- Add `echarts` as a runtime dependency. No peer deps required.
- Vite config: ECharts ships as ESM and tree-shakes cleanly. If the
  SSR build complains about `zrender` at server-load time, add to
  `vite.config.ts`:
  ```ts
  ssr: { noExternal: ['echarts'] }
  ```
  Expectation: **not** required for SvelteKit 2 with the current
  adapter, but call it out if the build fails. Tailwind config is
  untouched.
- No web workers; charts render client-side only. Server loads
  return raw data; charts mount in `onMount`.

#### A.2 Components

- **New:** `src/lib/components/charts/LineChart.svelte` — thin
  wrapper around ECharts `init`. Props: `option: EChartsOption`,
  `height?: string = '320px'`. Handles resize with
  `ResizeObserver` and disposes on unmount.
- **New:** `src/lib/components/charts/BarChart.svelte` — same
  wrapper, shaped for bar charts.
- **Shared theme:** `src/lib/components/charts/theme.ts` exports a
  palette pulling from existing CSS variables
  (`--color-accent`, `--color-text-secondary`, etc.) so charts
  honor the dark theme and do not hard-code hex values.

#### A.3 Dashboard changes

- **Expected-vs-realized** (`EvRealizedPoint[]` from analytics):
  line chart, x-axis = `executedAt`, two series (expected,
  realized), nulls gap. Table fallback currently in
  `/dashboard/+page.svelte` is **kept beneath the chart, collapsed**
  under a `<details>` element for operators who want the raw rows.
- **Plan performance** (`PlanPerformanceRow[]`): horizontal bar
  chart showing `avgExpectedProfit` vs `avgRealizedProfit` per
  plan. Reuses the existing table immediately beneath it.
- No changes to `analyticsService` response shapes. Phase 6 does
  not introduce time-bucketing or cohort rollups — operator will
  request specific analytics improvements as they use the app.

#### A.4 Files

- **Edit:** `package.json` (+ `bun install echarts`).
- **Edit (only if build fails):** `vite.config.ts`.
- **New:** `src/lib/components/charts/LineChart.svelte`
- **New:** `src/lib/components/charts/BarChart.svelte`
- **New:** `src/lib/components/charts/theme.ts`
- **Edit:** `src/routes/dashboard/+page.svelte`
- **Edit (possibly):** `src/lib/client/viewModels/dashboard.ts` —
  a `toEvRealizedSeries(points)` helper that produces an
  `EChartsOption` from the DTO. Keeps chart shaping out of the
  Svelte template.

#### A.5 API impact

None. Dashboard consumes existing `/api/analytics/*` endpoints.

#### A.6 Verification

- `bun run check` clean.
- `bun run build` passes outside sandbox; SSR doesn't pull
  `echarts` into the server bundle (confirm by grepping the
  built SSR output for `echarts`).
- Manual: load `/dashboard` against seeded DB, confirm chart
  renders with the seeded execution points, theme matches, resize
  works, no console errors.

---

### 3.B — CSV Export Helpers (minimal)

**Goal:** make it possible to pull historical data out of the app for
external analysis without hand-writing SQL.

Scope per your direction: **minimal**. Two exports, not five:

- **Executions** — full execution history with expected and realized
  fields.
- **Expected-vs-realized series** — the same shape
  `/api/analytics/expected-vs-realized` returns.

Inventory, candidates, and plans exports are **out of scope** for
Phase 6. Re-add when you actually want them.

#### B.1 Shared CSV helper

- **New:** `src/lib/server/utils/csv.ts`:
  ```ts
  export function toCsv<T>(
    rows: T[],
    columns: { key: keyof T | ((row: T) => unknown); header: string }[],
  ): string;
  ```
  - Escapes `"`, commas, and newlines per RFC 4180.
  - `null` / `undefined` → empty cell.
  - Dates → ISO 8601.
  - Numbers → plain `String(n)` (no locale formatting).
  - Leading `"=/+/@/-"` cells are prefixed with `'` to mitigate
    spreadsheet formula injection.

#### B.2 Endpoints

| Endpoint                                     | Query                            | Body (response)                               |
| -------------------------------------------- | -------------------------------- | --------------------------------------------- |
| `GET /api/exports/executions.csv`            | (none — exports everything)      | `text/csv`, `Content-Disposition: attachment` |
| `GET /api/exports/expected-vs-realized.csv`  | `from?`, `to?`, `planId?` (same as analytics route) | `text/csv`, attachment       |

Both endpoints reuse existing service functions
(`executionService.listExecutions`,
`analyticsService.getExpectedVsRealized`) — no new service code.
The route is the CSV-shaping boundary.

#### B.3 UI triggers

- **`/tradeups/executions`:** "Export CSV" button in the page
  header → `window.location = '/api/exports/executions.csv'`.
- **`/dashboard`:** "Export expected vs realized" link next to the
  chart title.

No modal, no filter picker. The executions export matches the
current filter state as a v2 if you want it later; v1 exports
everything.

#### B.4 Files

- **New:** `src/lib/server/utils/csv.ts`
- **New:** `src/routes/api/exports/executions.csv/+server.ts`
- **New:** `src/routes/api/exports/expected-vs-realized.csv/+server.ts`
- **Edit:** `src/routes/api/README.md` (add to route map).
- **Edit:** `src/routes/tradeups/executions/+page.svelte`
- **Edit:** `src/routes/dashboard/+page.svelte`

#### B.5 Verification

- `curl -D - http://localhost:5173/api/exports/executions.csv`
  returns `Content-Type: text/csv` and a
  `Content-Disposition: attachment` header.
- Open the downloaded file in a spreadsheet; confirm headers,
  row count matches seeded executions, formula-injection cells
  (if any are intentionally planted in a test row) are prefixed
  with `'`.
- `bun run check` clean.

---

### 3.C — Plan-Aware Inventory Eligibility Endpoint

**Goal:** replace the Phase 4 client-side workaround in the basket
builder. `basketService` already has plan-aware eligibility;
Phase 6 exposes it over HTTP.

#### C.1 Current state

- `GET /api/inventory?availableForBasket=true` returns items in
  `HELD` status. The basket builder then re-filters in the
  browser by plan rarity / collection / rule bands.
- `basketService.getEligibleInventoryForPlan(planId)` (internal)
  already implements this. Route layer hasn't been added.

#### C.2 New endpoint

- `GET /api/inventory/eligible?planId=<id>` →
  `PaginatedResponse<InventoryItemDTO>`.
- Accepts the same pagination params as `/api/inventory`
  (`page`, `limit`, `sortBy`, `sortDir`) plus required `planId`.
- Returns 400 (`ValidationError`) when `planId` is missing, 404
  (`NotFoundError`) when the plan doesn't exist. With typed
  errors landing in workstream D, these are native throws.
- Items returned are those that satisfy the plan's rarity, are
  held, and fall within at least one rule's float band.

#### C.3 Files

- **Edit:** `src/lib/schemas/inventory.ts` — add
  `eligibleInventoryFilterSchema` with `planId: z.string().min(1)`.
- **New:** `src/routes/api/inventory/eligible/+server.ts`
- **Edit (likely minimal):** `src/lib/server/inventory/` — expose
  a `listEligibleForPlan` helper if the current eligibility logic
  lives inside `basketService`. Keep it where it is if it's
  already importable.
- **Edit:** `src/routes/tradeups/baskets/+page.server.ts` /
  `BasketBuilderModal.svelte` — swap the
  `availableForBasket=true` + client-filter pattern for a single
  call to `/api/inventory/eligible?planId=...`. Keyboard/bulk
  add flow from Phase 5 §3.E remains unchanged.
- **Edit:** `src/routes/api/README.md`.

#### C.4 API impact

- **New:** `GET /api/inventory/eligible`. Additive.
- **Changed:** basket builder now calls the new endpoint.
  `GET /api/inventory?availableForBasket=true` stays (other
  callers may rely on it; inventory page itself does not).

#### C.5 Verification

- Seeded plan with known rule band → hit `/api/inventory/eligible`
  → confirm returned items match the plan rarity and at least one
  rule band.
- Builder: opening the modal triggers exactly one network call
  (down from two in the old flow); eligible list matches.

---

### 3.D — Typed Service Errors Migration

**Goal:** replace stringly-typed service throws with the typed error
classes already present in `src/lib/server/http/errors.ts`. Eliminate
the substring classifier as load-bearing logic.

This is the carry-over from Phase 5 §4. It is bundled here because
the test suite (workstream E) is much cleaner when service errors
are type-assertable.

#### D.1 Audit the throw sites

- `src/lib/server/candidates/candidateService.ts`
- `src/lib/server/inventory/inventoryService.ts`
- `src/lib/server/tradeups/planService.ts`
- `src/lib/server/tradeups/basketService.ts`
- `src/lib/server/tradeups/executionService.ts`
- `src/lib/server/tradeups/evaluation/evaluationService.ts`

For each `throw new Error('…')` site, classify as one of:

- `NotFoundError` — entity-by-id lookups, plan/basket not found.
- `ConflictError` — state-machine violations ("basket is not
  READY", "inventory item is already used", "slot occupied").
- `ValidationError` — preconditions the Zod layer can't express
  (e.g., "max buy price would exceed plan threshold"). Rare;
  prefer Zod.
- Leave as `Error` only for genuinely unexpected failures.

#### D.2 Migration rules

- One service module per commit (six commits). Each commit:
  1. Convert throws in that service.
  2. Grep routes for any handler that was relying on the old
     message for a specific response (none should — routes
     delegate to `toErrorResponse` — but verify).
  3. `bun run check` clean.
- Do **not** delete the substring classifier in
  `src/lib/server/http/errors.ts` at the end of the migration.
  Leave it as a fallback with a comment marking it deprecated.
  Removing it is a post-MVP chore.

#### D.3 Files

- **Edit:** all six service modules listed above.
- **Edit (optional):** `src/lib/server/http/errors.ts` —
  add comment noting the classifier is now fallback-only.

#### D.4 API impact

None functionally. Response bodies stay shape-compatible:
`{ error: 'NotFoundError' | 'ConflictError' | ..., message: string }`.
The substring classifier already produces the same
`error` names, so no route consumer sees a difference.

#### D.5 Verification

- `bun run check` clean after each commit.
- Manual: hit a known 404 path (`GET /api/candidates/nonexistent`)
  and a known 409 path (create a basket, try to ready it with <10
  slots) — confirm identical response to pre-migration.

---

### 3.E — Automated Test Coverage (`bun test`)

**Goal:** give the evaluation engine, duplicate detection, and
basket readiness a regression net. Not full coverage — a starter
suite that catches the most expensive classes of regressions.

This is the highest-judgment workstream. Tradeoffs explicitly
called out below.

#### E.1 Tradeoff: runner choice

**Decision: `bun test`.** Rationale:

- Already in the toolchain — zero install cost.
- Fast parallel execution.
- Jest-compatible API (`describe`/`it`/`expect`) is familiar.
- Project is mostly server-side pure TypeScript; no compelling
  reason to take on vitest for the tests Phase 6 scopes.

**Cost:** `bun test` has weaker support for
component/Svelte testing than vitest (no out-of-the-box
`@testing-library/svelte` story). Phase 6 **does not test Svelte
components.** If component tests become necessary later, vitest
can be added alongside without replacing `bun test`.

#### E.2 Layout

```
tests/
├─ helpers/
│  ├─ factories.ts       # build test candidates, plans, rules, baskets
│  └─ fixtures.ts        # small frozen outcome tables for EV math
├─ evaluation/
│  ├─ expectedValue.test.ts
│  ├─ scoring.test.ts
│  └─ recommendation.test.ts
├─ candidates/
│  └─ duplicateDetection.test.ts
└─ tradeups/
   └─ basketReadiness.test.ts
```

Why root-level `tests/` and not `src/**/__tests__`:

- Keeps production imports uncluttered.
- `bun test tests/` is the one command; no globbing patterns.
- Clear mental model: `src/` is code, `tests/` is assertions.

#### E.3 Starter suite contents

**`expectedValue.test.ts`:**

- Homogeneous single-collection basket: EV = weighted average of
  plan outcomes (simple sanity).
- Mixed two-collection basket: EV reflects both collection
  distributions, weighted by slot count.
- Plan with zero outcomes throws or returns 0 (specify which;
  matches current `computeBasketEV` behavior).

**`scoring.test.ts`:**

- `floatFitScore` three points: safe core → 1.0, band edge → ~0.5,
  out-of-band → 0.
- `computeLiquidityScore` density proxy: 0 observations → clamped
  low (or 0.5 if the "cold seed" fallback from Phase 5 §4 was
  preserved — assert whichever shipped), 10+ observations → 1.0.

**`recommendation.test.ts`:**

- `pinnedByUser` preserves user status across re-evaluation.
- `minCompositeScore` per-plan override actually moves a
  candidate that would have been `GOOD_BUY` into `WATCHING` when
  the floor is raised.
- `BOUGHT` and `DUPLICATE` are never overwritten.

**`duplicateDetection.test.ts`:**

- `listingId` exact match wins regardless of price drift.
- `listingUrl` normalization merges two records with differing
  query strings.
- Price within relative tolerance → merge; outside → new row.
- Float within `FLOAT_EPSILON` → match; outside → no match.

**`basketReadiness.test.ts`:**

- Basket with 10 items, all matching plan rarity and a rule band
  → ready, no issues.
- Basket with 9 items → `BasketReadinessIssue` of kind
  `MISSING_SLOTS`.
- Basket with 10 items but one wrong rarity → rarity issue.
- Basket with 10 items but one float out-of-band → float issue.

These tests are **pure**: they never touch the database. Factories
construct plain objects satisfying the Prisma-derived domain types.
If a test needs to exercise a service method that calls `db`,
mock the import with `bun:test`'s `mock.module`.

#### E.4 Database and service tests (explicitly deferred)

Integration tests that spin up a temp SQLite DB, seed it, and
exercise services end-to-end are **not** in Phase 6 scope. They are
valuable but expensive to set up cleanly in `bun test` (teardown
hygiene, process isolation). Defer until after MVP.

Consequence: services whose logic is mostly "call Prisma, map
result" have **zero** coverage after Phase 6. Accept this. The
starter suite covers pure decision logic, which is where the bugs
historically hide.

#### E.5 CI hook

- `package.json` gets a `"test": "bun test tests/"` script.
- No CI configuration in this phase — you're the operator. Running
  `bun test` before commits is expected manually.

#### E.6 Files

- **New:** `tests/helpers/factories.ts`
- **New:** `tests/helpers/fixtures.ts`
- **New:** `tests/evaluation/expectedValue.test.ts`
- **New:** `tests/evaluation/scoring.test.ts`
- **New:** `tests/evaluation/recommendation.test.ts`
- **New:** `tests/candidates/duplicateDetection.test.ts`
- **New:** `tests/tradeups/basketReadiness.test.ts`
- **Edit:** `package.json` (add `test` script).

#### E.7 Verification

- `bun test tests/` reports all tests passing.
- Intentionally break one evaluation weight locally; confirm the
  relevant test fails with a readable message.

---

## 4. Unresolved Items & Carry-overs

Each of the "Still unresolved" items from `docs/PROGRESS.md` gets an
explicit disposition. "Defer beyond Phase 6" means **deferred past
MVP-done** — the project ships without it.

### 4.1 Per-weapon / per-skin float ranges — **deferred beyond Phase 6**

**Why:** per-skin float bands require a skin catalog (scrape or
hand-maintain) and reshape EV math. The Phase 5 marginal-contribution
ranking uses the global-band approximation as stable input; Phase 6
does not improve this. The `TODO` markers in
`src/lib/server/utils/float.ts` and
`src/lib/server/tradeups/evaluation/scoring.ts` stay in place.
**Risk:** output exterior projections can be optimistic for skins
with narrow native float bands. Document-only, no code change.

### 4.2 Typed service errors migration — **in scope for Phase 6**

See §3.D. Bundled with the test suite because
`expect(fn).toThrow(NotFoundError)` is much stronger than a regex
on message strings.

### 4.3 Real marketplace-volume liquidity signal — **deferred beyond Phase 6**

**Why:** the density proxy from Phase 5 §3.C is sufficient for
MVP. A real volume signal requires either scraping Steam's
marketplace listing counts or extracting them from the extension
payload — both are substantial scope and belong on a separate
"ingestion depth" track. The `computeLiquidityScore` signature is
stable, so a drop-in replacement later does not touch callers.

### 4.4 Extension bridge mechanism — **deferred beyond Phase 6**

**Why:** the ingestion endpoint is payload-ready; the bridge is a
Chrome-extension-runtime problem that lives outside this repo's
tree (see `docs/INTEGRATION_RESEARCH.md`). It unblocks real-data
ingestion but isn't a code change in `cs-tradeups`. Manual /
bookmarklet ingestion remains the interim path.

### 4.5 Plan-aware inventory eligibility endpoint — **in scope for Phase 6**

See §3.C. The Phase 4 client-side workaround is replaced by a
proper route. Small win, small risk.

### 4.6 Price-age re-evaluation (from Phase 5) — already shipped

Phase 5 §3.B landed; no further work needed unless a cron is
desired, and cron is deferred beyond MVP.

### 4.7 Notifications — deferred beyond Phase 6

Out of MVP scope per `PLAN.md`.

---

## 5. Implementation Order

Recommended path:

1. **Workstream D (typed errors)** — pure refactor, zero
   behavioral risk, makes workstream E's assertions clean.
2. **Workstream E (tests)** — now that typed errors exist, write
   the starter suite. Any regression introduced by the remaining
   workstreams is caught here.
3. **Workstream C (eligibility endpoint)** — small, self-contained.
4. **Workstream B (CSV exports)** — independent of everything.
5. **Workstream A (ECharts + dashboard)** — last because it's the
   most visible and benefits from the test net being in place.

After each workstream lands:

- Tick its checkbox in `docs/PROGRESS.md` §"Phase 6."
- Add a dated Change Log entry naming the workstream and listing
  new endpoints or dependencies introduced.

---

## 6. Verification Gates

Run at the end of every workstream and again at the end of Phase 6:

```
bun run check            # 0 errors, 0 warnings
bun run build            # passes outside sandbox; EPERM inside sandbox is OK
bun test tests/          # all tests pass (after workstream E lands)
bun prisma migrate deploy  # no pending migrations (Phase 6 adds none)
bun prisma db seed       # seed runs clean
```

Manual smoke checks per workstream:

- **D:** hit `GET /api/candidates/does-not-exist` → 404 with
  `error: 'NotFoundError'`. Hit a known 409 path → same response
  body shape as pre-migration.
- **E:** `bun test` reports green across the five test files.
- **C:** basket builder modal opens with exactly one network
  request to `/api/inventory/eligible?planId=…`; list matches
  plan rarity and rule bands.
- **B:** downloaded `executions.csv` opens cleanly in a
  spreadsheet; row count matches `GET /api/tradeups/executions`.
- **A:** `/dashboard` renders expected-vs-realized as a chart;
  theme matches; table fallback exists under a `<details>`
  collapse.

Phase-level gate: run the full list above against a freshly
seeded DB and confirm no regressions in prior-phase surfaces
(candidates, inventory, plans, baskets, executions workflows).

---

## 7. Out-of-Scope for Phase 6 (i.e. deferred beyond MVP)

These are the items the project explicitly ships without. Each
has a stable-enough shape that a future phase can add it without
reshaping MVP code:

- **Seed data expansion.** Per operator preference, Phase 6 does
  not grow the seed. Real ingestion is the planned source of
  volume.
- **Broader historical analytics.** Time-bucketing, cumulative
  profit series, cohort views, activity-feed perf refactor. The
  operator will request specific improvements as real usage
  surfaces gaps; Phase 6 doesn't pre-build them.
- **Exports beyond executions and expected-vs-realized.**
  Inventory, candidates, plans, baskets exports.
- **Per-weapon / per-skin float range table and EV refinement.**
- **Real marketplace-volume liquidity data.**
- **Chrome extension bridge implementation.**
- **Cron / scheduled re-evaluation.** The
  `/api/candidates/refresh-stale` endpoint from Phase 5 is still
  manual-trigger only.
- **Component/Svelte UI tests.** `bun test` in Phase 6 covers
  pure server logic. Component tests would likely require vitest.
- **Integration tests that hit a real DB.** Starter suite is
  unit-level only; see §3.E.4.
- **Typed service errors classifier removal.** The substring
  classifier stays in `errors.ts` as deprecated fallback; actual
  deletion is a post-MVP chore.
- **Notifications / alerting infrastructure.**
- **Drag-drop basket reorder.**
- **Plan/candidate/basket JSON exports.** If useful, add after
  MVP — the CSV helper generalizes trivially to JSON.

---

## 8. Summary of New Persisted Fields

Phase 6 introduces **no new persisted fields and no Prisma
migrations.** All work is at the service, route, UI, and test
layers. This is intentional: Phase 5 absorbed the last round of
schema changes needed for MVP. Any new column in Phase 6 would
be a smell that scope has slipped.

| Table | Field | Type | Nullable | Default | Added in workstream |
| ----- | ----- | ---- | -------- | ------- | ------------------- |
| —     | —     | —    | —        | —       | —                   |

---

## 9. Risks

- **ECharts SSR surprises.** ECharts can misbehave in SSR bundles
  if accidentally imported at module top level in a `+page.server.ts`.
  Mitigation: all chart code is client-only (imports inside
  `onMount`); server loads return DTOs, never chart options.
- **Typed-error migration gaps.** A service throw site missed by
  the audit would fall through the substring classifier to a
  500. Mitigation: keep the classifier as fallback (§3.D.2) and
  add one test that asserts a known route still returns 404 for a
  non-existent entity.
- **Starter test suite creates false confidence.** Pure-logic tests
  don't catch Prisma query regressions, ordering bugs, or
  serialization mismatches. Called out explicitly in §3.E.4 so
  the suite's coverage is understood for what it is.
- **CSV injection.** The `toCsv` helper must prefix leading
  `=/+/@/-` with `'`. Without this, a malicious
  `marketHashName` could execute a formula when the file is
  opened. Low real-world risk here (single operator, ingested
  data from a trusted extension), but cheap to do right.
- **Dashboard chart shape locks future analytics.** If we ship
  the line chart against the current `EvRealizedPoint[]` shape
  and later introduce bucketed aggregates, existing chart code
  has to adapt. Kept minimal and in a helper
  (`toEvRealizedSeries`) to contain the blast radius.
