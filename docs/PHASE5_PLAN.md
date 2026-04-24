# Phase 5 — Scoring & Workflow Refinement: Implementation Plan

**Status:** Historical implementation plan. Phase 5 has been implemented; see
`docs/PROGRESS.md` for current state.
**Last Updated:** 2026-04-24
**Scope (from `docs/PLAN.md` §Phase 5):**

- stronger basket-aware ranking
- duplicate refresh behavior
- recommendation tuning
- bulk actions and operator ergonomics

**Exit criteria (from `docs/PLAN.md`):** "the app is faster and more
reliable than the current manual process."

**Companion:** `docs/PLAN.md` (intended direction), `docs/PROGRESS.md`
(actual state), `docs/PHASE4_UI_PLAN.md` (shipped UI baseline),
`src/routes/api/README.md` (API surface), `src/lib/server/README.md`
(service contracts).

Post-Phase-5 note: later slices added the static CS2 catalog, catalog identity
linkage, catalog-aware EV grouping/projection, and the local Steam Market
bridge. Those current details live in `docs/PROGRESS.md`,
`docs/CATALOG_PIPELINE.md`, and `docs/INTEGRATION_RESEARCH.md`.

---

## 1. Global Conventions (Phase 5)

Phase 4 constraints were "UI-only, don't touch services." **Phase 5
inverts that.** Most changes live under `src/lib/server/**`. Phase 4
constraints that still apply:

- **Validation at boundaries.** Every new input shape gets a Zod schema
  under `src/lib/schemas/**`. Route handlers stay thin.
- **DTO boundary.** Services return plain numbers; `Decimal` never
  leaks. New fields extend `$lib/types/services.ts`, not Prisma rows.
- **Pages never import `$lib/server/**`.** All UI data flows through
  `/api/**` endpoints using `src/lib/client/api.ts`.
- **Svelte 5 runes only.** No legacy reactive syntax.
- **No new dependencies** unless a workstream explicitly justifies one
  here. ECharts and drag-drop remain deferred.
- **URL-mirrored filter state.** Existing pages already do this; new
  sorts/filters follow the same pattern.

New conventions this phase introduces:

- **Schema migrations are expected.** Any new persisted field ships a
  Prisma migration under `prisma/migrations/` and is exercised by
  `prisma/seed.ts`. SQLite migration hygiene: non-breaking columns
  default or allow NULL; no destructive alterations.
- **Evaluation changes are additive.** Scoring inputs and recommendation
  transitions may change, but the public signatures of
  `evaluateCandidate`, `evaluateInventoryItem`, and `evaluateBasket`
  stay stable. Internal helpers can be reshaped freely.
- **Tuning knobs live in one place.** Scoring weights, recommendation
  floors, staleness thresholds, and re-eval windows move out of
  scattered `const`s into `src/lib/server/tradeups/evaluation/tuning.ts`
  so each value has one home and one comment explaining its choice.
- **Bulk actions accept an ID list, cap it, and fail fast.** No
  endpoint accepts "all" as an implicit set; callers pass explicit IDs
  and the service caps the batch size (e.g., `MAX_BULK_IDS = 200`).

---

## 2. Workstreams (Summary)

Phase 5 splits into five workstreams, sequenced by dependency:

| # | Workstream                              | Primary area                    | Depends on |
| - | --------------------------------------- | ------------------------------- | ---------- |
| A | Duplicate suppression & refresh         | `candidates/duplicateDetection` | —          |
| B | Price-age re-evaluation                 | `candidates/candidateService`   | A          |
| C | Recommendation & scoring tuning         | `tradeups/evaluation/*`         | —          |
| D | Basket-aware candidate ranking          | `tradeups/evaluation/*`, `/candidates` UI | C |
| E | Bulk operator actions & workflow polish | Services, API, `/candidates`, `/inventory`, `/tradeups/baskets` UI | A–D |

Each workstream has its own completion checkbox in `PROGRESS.md` §"Phase
5" — tick only when that workstream's verification gate passes.

---

## 3. Per-Workstream Plans

### 3.A — Duplicate Suppression & Refresh

**Goal:** make duplicate merging predictable under realistic ingestion
patterns. Today's matcher requires exact price + float and does not
distinguish a "price changed on the same listing" re-observation from
a genuinely new listing.

#### A.1 Current behavior (read before changing)

- `src/lib/server/candidates/duplicateDetection.ts`
  - `listingId` match is authoritative.
  - Otherwise matches on `marketHashName` exact + `listPrice ± 0.01` +
    `floatValue ± FLOAT_EPSILON`.
  - `mergeDuplicate` overwrites price, bumps `timesSeen`, sets
    `lastSeenAt`. **Does not re-evaluate.**
- `candidateService.createCandidate` and
  `ingestExtensionCandidate` call `findDuplicateCandidate` →
  `mergeDuplicate` or insert → `evaluateCandidate`. Evaluation runs on
  both insert and merge paths (good).

#### A.2 Changes

1. **Listing-URL fallback match.** If `listingId` is absent but
   `listingUrl` is present and matches an existing row, treat as the
   same listing. Normalize URLs (strip query fragments, lowercase
   host) before comparing — add `src/lib/server/utils/url.ts` with
   `normalizeListingUrl`.
2. **Price-change tolerance widening.** Extend price epsilon from
   hard `0.01` to a relative `max(0.01, 1% of listPrice)`. Reason:
   cents-level match is brittle for listings above $20.
3. **Price-change detection.** `mergeDuplicate` returns
   `{ candidate, priceChanged: boolean, oldListPrice: number }`.
   Callers use `priceChanged` to decide whether to flip status back
   from user-pinned `PASSED`/`WATCHING` — reason: price drops may
   re-qualify a previously passed listing. Default is "do not flip";
   flip only if `evaluateCandidate` now returns `GOOD_BUY`. This
   matches the existing "user intent is preserved" rule in
   `recommendation.ts`.
4. **Merge audit trail (lightweight).** Add a `mergeCount` column on
   `CandidateListing` (defaults 0). Increment on every merge. Not
   strictly needed, but distinguishes "seen N times" from
   "price-updated N times" for the price-age sweep in workstream B.
5. **Staleness thresholds moved to `tuning.ts`.** Values stay the same
   (2h / 24h / 7d) but become importable constants so the UI can
   reference them if it ever wants to.

#### A.3 Files

- **Edit:** `src/lib/server/candidates/duplicateDetection.ts`
- **Edit:** `src/lib/server/candidates/candidateService.ts` (consume
  `priceChanged`)
- **New:** `src/lib/server/utils/url.ts`
- **New:** `prisma/migrations/2026xxxx_add_candidate_merge_count/`
- **Edit:** `prisma/schema.prisma` (add `mergeCount Int @default(0)`)
- **Edit:** `prisma/seed.ts` (ensure a seeded candidate row exists
  with `mergeCount: 0` and a URL-only duplicate scenario).

#### A.4 API impact

None. `rawPayload` is already stored. The extension ingestion
response shape is unchanged.

#### A.5 Verification

- Unit test scaffolds (ad-hoc, via `bun run` scripts if no test runner
  is installed) for `findDuplicateCandidate` covering: listingId hit,
  listingUrl hit after normalization, price drift under new tolerance,
  price drift above tolerance.
- Smoke test: POST a payload twice to `/api/candidates`; confirm
  `timesSeen=2`, `mergeCount=1` (on second call).

---

### 3.B — Price-Age Re-evaluation

**Goal:** close the `PROGRESS.md` open question "price-age
re-evaluation." Stale evaluations are the main source of bad
recommendations today.

#### B.1 Design

- Add `evaluationRefreshedAt DateTime?` to `CandidateListing`. Set it
  inside `evaluateCandidate` on every run.
- Add `src/lib/server/candidates/reevaluationPolicy.ts`:
  ```ts
  export const REEVAL_THRESHOLDS = {
    STALE_AFTER_MS: 6 * 60 * 60 * 1000,   // 6h
    COLD_AFTER_MS:  24 * 60 * 60 * 1000,  // 24h
  };
  export function isEvaluationStale(row: CandidateListing, now?: Date): boolean;
  ```
- Extend `reevaluateOpenCandidates()` so it accepts an optional
  `{ olderThanMs?: number }` filter. Default remains "all open
  candidates" for backward compat with the existing manual button.
- **New scheduled refresh, opt-in, no cron:** add
  `POST /api/candidates/refresh-stale` which re-evaluates open
  candidates whose `evaluationRefreshedAt` is older than
  `STALE_AFTER_MS`. This is the endpoint the dashboard can hit on load
  if the user wants pull-based freshness, or a future cron can hit
  externally. MVP is manual trigger only.

#### B.2 Files

- **New:** `src/lib/server/candidates/reevaluationPolicy.ts`
- **Edit:** `src/lib/server/candidates/candidateService.ts` (accept
  `olderThanMs`, update `evaluationRefreshedAt` in eval path)
- **Edit:** `src/lib/server/tradeups/evaluation/evaluationService.ts`
  (stamp `evaluationRefreshedAt` on successful update)
- **New:** `src/routes/api/candidates/refresh-stale/+server.ts`
- **Edit:** `src/lib/schemas/candidate.ts` (add
  `refreshStaleSchema` with optional `olderThanMs`)
- **Edit:** `prisma/schema.prisma` + migration
- **Edit:** `$lib/types/services.ts`: add
  `evaluationRefreshedAt: Date | null` to `CandidateDTO` and a
  `evaluationAge: 'FRESH' | 'AGING' | 'STALE'` derived field (similar
  treatment to `staleness`).
- **Edit:** `src/routes/candidates/+page.svelte`: surface
  `evaluationAge` as a small secondary badge near `staleness`.
  Add a page-level "Refresh stale" button that posts to
  `/api/candidates/refresh-stale` and invalidates.

#### B.3 API impact

- **New:** `POST /api/candidates/refresh-stale` → returns
  `{ count: number }` mirroring `reevaluate-open`.
- **Changed (additive):** `CandidateDTO` gains two fields. Existing
  consumers ignore them; no breaking change.

#### B.4 Verification

- `bun run check` clean.
- Seeded DB: mark one candidate `evaluationRefreshedAt` to 2 days ago
  via a one-off script; hit the endpoint; confirm only that row was
  refreshed.

---

### 3.C — Recommendation & Scoring Tuning

**Goal:** make recommendation thresholds plan-configurable and give
scoring more predictable behavior on edge floats, missing outcomes,
and thin match sets.

#### C.1 Problems in the current engine

- `MIN_COMPOSITE_SCORE = 0.25` is hard-coded inside `recommendation.ts`.
  A liquid, profitable plan and an illiquid-but-tolerated plan both
  get the same floor.
- `computeLiquidityScore` returns `0.5` unconditionally (documented
  stub). Any rule that references liquidity is effectively dead.
- `floatFitScore` uses a linear midpoint penalty that over-penalizes
  broad rules (e.g., 0.0–1.0) and under-penalizes narrow ones.
- `computeMaxBuyPrice` falls back to a silent 10% margin when the plan
  has neither `minProfitThreshold` nor `minProfitPctThreshold`. This
  is invisible to the operator.

#### C.2 Changes

1. **Centralize tuning.** Create
   `src/lib/server/tradeups/evaluation/tuning.ts` exporting the
   weights and floors from `scoring.ts` and `recommendation.ts`
   verbatim. No value changes on introduction — just relocation. Each
   constant gets a one-line `// Why: …` comment.
2. **Per-plan recommendation floor (optional).** Add
   `minCompositeScore Float?` to `TradeupPlan`. When set, it overrides
   `MIN_COMPOSITE_SCORE`. Migration + schema update + plan Zod
   schemas + Plan DTO field + plan editor UI control.
3. **Float-fit rescore.** Replace linear midpoint penalty with a
   two-piece function: flat `1.0` inside the "safe core" (middle 60% of
   the rule band), linear falloff to `0.5` at the band edges. Reason:
   operators don't care whether a float is dead-center, only whether
   it's well-inside vs. at the edge. Document in
   `src/lib/server/tradeups/evaluation/scoring.ts`.
4. **Liquidity-as-proxy.** Until real volume data lands, derive a weak
   liquidity signal from observed candidate density:
   `liquidity ≈ clamp01((distinct candidates seen with this hash in
   the last 7d) / 10)`. It's still a proxy, but it stops being a
   constant. Cache the per-hash count for the evaluation call to
   avoid per-candidate queries — pass it into `evaluateCandidateImpl`
   so bulk re-evaluation runs one aggregate query, not N.
5. **Visible max-buy fallback.** `computeMaxBuyPrice` returns `null`
   instead of silently assuming 10% when no threshold is set. The UI
   shows "—" with a tooltip explaining that the plan has no profit
   threshold configured.
6. **Preserve user-pinned status across re-eval.** Today,
   `recommendation.ts` preserves `PASSED`/`WATCHING` unless eval flips
   to `INVALID`/`GOOD_BUY`. Add the symmetric rule: `GOOD_BUY` that
   was set by the user (vs. derived) should be treated as a pin.
   Model: add `pinnedByUser Boolean @default(false)` on
   `CandidateListing`. `updateCandidate` sets it when the user picks a
   status; `evaluateCandidate` honors it (never overwrites). The
   existing "BOUGHT / DUPLICATE preservation" becomes a special case
   of the pin rule.

#### C.3 Files

- **New:** `src/lib/server/tradeups/evaluation/tuning.ts`
- **Edit:** `src/lib/server/tradeups/evaluation/scoring.ts`
  (float-fit curve, liquidity proxy)
- **Edit:** `src/lib/server/tradeups/evaluation/recommendation.ts`
  (per-plan floor, pin rule)
- **Edit:** `src/lib/server/tradeups/evaluation/evaluationService.ts`
  (thread liquidity count through, stamp `evaluationRefreshedAt`)
- **Edit:** `prisma/schema.prisma` + migration
  (`TradeupPlan.minCompositeScore`, `CandidateListing.pinnedByUser`)
- **Edit:** `src/lib/schemas/plan.ts` (add `minCompositeScore` to
  create/update)
- **Edit:** `src/lib/schemas/candidate.ts`: status updates through the
  UI set `pinnedByUser: true`; eval-driven status writes don't.
- **Edit:** `$lib/types/services.ts`: `PlanDTO.minCompositeScore`,
  `CandidateDTO.pinnedByUser`.
- **Edit:** plan editor UI (`/tradeups/plans/PlanEditorModal.svelte`)
  — one optional input with help text.
- **Edit:** candidate UI: small "pinned" icon when `pinnedByUser` and
  an "unpin" menu action that sets `pinnedByUser: false` and
  re-evaluates.

#### C.4 API impact

- `PATCH /api/candidates/[id]` gains `pinnedByUser: boolean`
  (additive, optional in Zod).
- `POST /api/tradeups/plans` and `PATCH /api/tradeups/plans/[id]`
  gain `minCompositeScore?: number` (additive, optional, 0..1).

#### C.5 Verification

- Unit-test `floatFitScore` against three floats: safe core, edge,
  out-of-band → expected 1.0 / ~0.5 / 0.
- Seeded check: set one plan `minCompositeScore = 0.4`, re-evaluate
  open candidates, confirm distribution of `WATCHING` vs `GOOD_BUY`
  shifts as expected.
- Pin test: flip a candidate to `WATCHING` via UI, re-evaluate the
  candidate directly via `/api/candidates/[id]/reevaluate`, confirm
  it stays `WATCHING`; unpin, re-evaluate, confirm it moves to
  whatever the engine computes.

---

### 3.D — Basket-Aware Candidate Ranking

**Goal:** rank candidates not just by homogeneous-basket EV but by
marginal contribution to the user's actual in-progress basket for the
candidate's matched plan.

#### D.1 Current behavior

- `computeCandidateEV` assumes a hypothetical 10-slot homogeneous
  basket in the candidate's own collection. Good for bootstrapping;
  wrong once the user has a mixed basket forming.
- `computeMarginalContribution` already exists and is used inside
  `evaluateInventoryItem`, not inside `evaluateCandidate`.

#### D.2 Design

Store two numbers per candidate:

- `expectedProfit` — unchanged semantics (homogeneous-basket EV minus
  list price). This is the "cold" ranking operators use when they
  haven't started a basket yet.
- **New:** `marginalBasketValue Float?` — already exists on the row
  and the DTO per `$lib/types/services.ts` §Candidate. **Currently
  written nowhere.** Phase 5 populates it.

Population rule:

- For each candidate whose matched plan has a
  `BUILDING`/`READY` basket with fewer than 10 slots, compute the
  marginal contribution against that basket's current slots using
  `computeMarginalContribution(baseSlots, candidateAsSlot, plan)`.
- When multiple candidate baskets exist for the plan, pick the most
  recently updated one (same rule `evaluateInventoryItemImpl` uses).
- When no in-progress basket exists, set `marginalBasketValue = null`.

Add to the candidates page:

- Sort option: "Marginal basket value." Defaults off; when on, nulls
  sort last.
- Row badge: a small "+$X.XX to basket" label when
  `marginalBasketValue != null`, color-coded by sign.

#### D.3 Files

- **Edit:** `src/lib/server/tradeups/evaluation/evaluationService.ts`
  — inside `evaluateCandidateImpl`, after matching a plan, look up
  the most recent in-progress basket and compute marginal
  contribution.
- **Edit:** `src/lib/server/tradeups/evaluation/expectedValue.ts` —
  `computeMarginalContribution` already exists; verify it scales
  when `baseSlots.length < 10` (math is slot-proportional so it does,
  but add a note).
- **Edit:** `src/lib/schemas/candidate.ts`: `candidateFilterSchema.sortBy`
  enum gains `'marginalBasketValue'`.
- **Edit:** `src/routes/candidates/+page.server.ts` /
  `+page.svelte`: sort option, badge.
- **Edit:** `$lib/types/services.ts` `CandidateDTO` — no shape
  change; just document that `marginalBasketValue` is now populated.

#### D.4 API impact

- `GET /api/candidates?sortBy=marginalBasketValue` — additive sort
  key. `PaginatedResponse<CandidateDTO>` shape unchanged.

#### D.5 Performance note

Each candidate re-eval now requires a basket lookup + a small EV
computation. For a batch re-eval (workstream B) this becomes N basket
lookups. Mitigation: in
`reevaluateOpenCandidates`, fetch all in-progress baskets once, group
by `planId`, and pass the lookup into `evaluateCandidateImpl` via an
optional `BasketLookup` argument. Single-candidate evals still do
their own query.

#### D.6 Verification

- Seed: ensure one `BUILDING` basket exists with 4 items in a known
  collection; a candidate in the same collection should have a
  positive `marginalBasketValue`, and a candidate in a different
  collection should have a different (likely smaller) value.

---

### 3.E — Bulk Operator Actions & Workflow Polish

**Goal:** make the /candidates and /tradeups/baskets pages materially
faster to operate. The dashboard and other pages stay read-only.

#### E.1 Bulk endpoints (service + route layer)

| Endpoint                                         | Body                           | Service call                                         |
| ------------------------------------------------ | ------------------------------ | ---------------------------------------------------- |
| `POST /api/candidates/bulk/status`               | `{ ids: string[], status: CandidateDecisionStatus, pinnedByUser?: boolean }` | `candidateService.bulkSetStatus`       |
| `POST /api/candidates/bulk/delete`               | `{ ids: string[] }`            | `candidateService.bulkDelete`                        |
| `POST /api/candidates/bulk/reevaluate`           | `{ ids: string[] }`            | `candidateService.bulkReevaluate`                    |
| `POST /api/tradeups/baskets/[id]/items/bulk`     | `{ items: { inventoryItemId, slotIndex }[] }` | `basketService.bulkAddItems`          |

All bulk endpoints:

- accept a maximum of `MAX_BULK_IDS = 200` IDs (exported from
  `src/lib/server/http/limits.ts`, new file) and return 400 with a
  clear message above that.
- run inside a single Prisma transaction where the operation is
  atomic (status, delete); bulk re-evaluation is not atomic (independent
  writes) but returns `{ processed: number, errors: { id, message }[] }`.
- are Zod-validated at the route boundary; new schemas live in
  `src/lib/schemas/bulk.ts`.

Bulk basket adds justify a dedicated endpoint because the builder
currently posts one item at a time, which is noticeably slow with 10
slots; single-transaction insertion also avoids intermediate metric
recomputations.

#### E.2 UI changes

**`/candidates`:**

- Row-level checkbox + header select-all (visible rows only).
- Floating action bar on selection: "Pass", "Watch", "Re-evaluate",
  "Delete". "Pass"/"Watch" sets `pinnedByUser: true` on affected rows.
- Keyboard shortcuts while row is focused:
  - `p` → Pass
  - `w` → Watch
  - `g` → Good Buy (pin)
  - `b` → open Buy modal
  - `x` → toggle selection
  - `j`/`k` → next/prev row
- Shortcut hint drawer (one shared component:
  `src/lib/components/KeyboardHintBar.svelte`). Visible via `?` key
  and as a low-contrast hint row at the bottom of the page.

**`/inventory`:**

- Row-level checkbox.
- Floating action bar: "Archive", "Delete". (Value editing remains a
  single-row modal — bulk edit of estimated value has unclear UX.)

**`/tradeups/baskets` builder modal:**

- Multi-select of eligible inventory. "Add N items" button posts to
  `/api/tradeups/baskets/[id]/items/bulk` and auto-assigns slot
  indices to the lowest empty slots in order.
- Existing single-item flow stays for click-to-add.

#### E.3 Files

- **New:** `src/lib/server/http/limits.ts`
- **New:** `src/lib/schemas/bulk.ts`
- **Edit:** `src/lib/server/candidates/candidateService.ts` (add bulk
  functions)
- **Edit:** `src/lib/server/tradeups/basketService.ts` (add
  `bulkAddItems`)
- **New:** `src/routes/api/candidates/bulk/status/+server.ts`
- **New:** `src/routes/api/candidates/bulk/delete/+server.ts`
- **New:** `src/routes/api/candidates/bulk/reevaluate/+server.ts`
- **New:** `src/routes/api/tradeups/baskets/[id]/items/bulk/+server.ts`
- **Edit:** `src/routes/api/README.md` route map.
- **New:** `src/lib/components/KeyboardHintBar.svelte`
- **Edit:** `src/routes/candidates/+page.svelte` (+ components)
- **Edit:** `src/routes/inventory/+page.svelte`
- **Edit:** `src/routes/tradeups/baskets/BasketBuilderModal.svelte`

#### E.4 Verification

- `bun run check` clean on each page before merge.
- Manual: select 25 candidates, bulk-Pass, confirm all 25 flip and
  `pinnedByUser=true`.
- Manual: bulk-add 10 inventory items into a fresh basket; confirm a
  single network request, basket is `itemCount=10`, metrics
  recomputed once.

---

## 4. Unresolved Items & Risky Assumptions

Carried from `docs/PROGRESS.md` §"Still unresolved" and re-scoped here:

- **Per-weapon / per-skin float ranges** remain deferred. They change
  the "effective" float band per skin, which affects output exterior
  projection in EV. Phase 5 keeps the global-band approximation so the
  new marginal-contribution ranking uses stable inputs. This is
  explicitly a Phase 6 concern. Post-Phase-6 update: the static CS2 catalog
  now provides per-skin min/max float ranges for catalog-linked output
  projection; dynamic projected-exterior pricing remains deferred.
- **Real liquidity data.** Workstream C introduces a density-based
  proxy; a real volume signal (daily scrape, or pulled from the
  extension payload if it ships market volume) remains TBD. Proxy is
  called `computeLiquidityScore` so the shape stays stable when real
  data arrives.
- **Typed service errors.** Routes still classify plain `Error`s by
  substring. Migration to typed errors is the biggest latent
  correctness risk before a test suite lands; propose doing it inside
  workstream E as a small opportunistic refactor **only** if it doesn't
  grow the diff. Otherwise hold for Phase 6.
- **Plan-aware inventory eligibility endpoint.** Basket builder still
  uses the Phase 4 client-side workaround. Phase 5 doesn't require
  the endpoint; revisit only if bulk-add UX proves it's needed
  (e.g., >200 inventory rows makes the single-fetch approach
  unworkable).
- **No scheduled jobs.** Price-age re-evaluation is a manual-trigger
  endpoint. Adding a cron/worker is out of scope; document the
  endpoint so a future `cron` can hit it.
- **Migration order.** Workstreams A, B, and C each add a column.
  Bundle them into **one** migration if executed together to avoid
  three separate `ALTER TABLE` rounds on SQLite; otherwise allow
  three small migrations. Either path is acceptable — note the choice
  in the commit.

Risky assumptions to validate before writing code:

- **Pin semantics don't conflict with bulk actions.** Bulk `pass`
  sets `pinnedByUser=true`; bulk `reevaluate` does not clear pins.
  There must be an explicit "unpin" action (included in workstream C)
  so a user can reset a candidate to engine-driven status.
- **Density-based liquidity proxy is additive, not gated.** Even if
  the number is weak, it's strictly better than `0.5`. Confirm this
  with the operator before shipping: if the proxy produces
  over-pessimistic scores on a cold seed, fall back to `0.5` for hashes
  with fewer than 3 observations.
- **Keyboard shortcuts don't collide with browser defaults.** `p`,
  `w`, `g`, `b`, `x` are safe; `j`/`k` are fine as long as the focus
  is on the row container and Svelte `on:keydown` uses
  `event.preventDefault()` appropriately.

---

## 5. Implementation Order

Pick ONE of these orderings and commit to it. The recommended path is
"scoring first, then workflow" because the ranking changes are what
make bulk operator actions actually useful.

1. **Workstream A** — duplicate refresh. Low-risk, unblocks B.
2. **Workstream B** — price-age re-evaluation. Produces a "Refresh
   stale" control the operator can use once the new columns exist.
3. **Workstream C** — recommendation tuning + pin rule. This is the
   biggest behavioral change; land it alone so any regression is
   isolated.
4. **Workstream D** — basket-aware ranking. Builds on C's per-plan
   floor and the evaluation plumbing.
5. **Workstream E** — bulk actions and shortcuts. Shipped last so the
   operator is multiplying real signal, not noise.

After each workstream lands:

- Tick its checkbox in `docs/PROGRESS.md` §"Phase 5."
- Add a dated Change Log entry that names the workstream and lists the
  migrations and new endpoints introduced.

---

## 6. Verification Gates

Run at the end of every workstream and again at the end of Phase 5:

```
bun run check            # 0 errors, 0 warnings
bun run build            # passes outside sandbox; EPERM inside sandbox is OK
bun prisma migrate deploy  # applies any new migrations cleanly
bun prisma db seed       # seed runs clean and the new columns are populated
```

Manual smoke checks per workstream:

- **A:** send the same payload twice; confirm single row,
  `timesSeen=2`, `mergeCount=1`.
- **B:** `POST /api/candidates/refresh-stale` against the seeded DB;
  confirm `count` equals the number of pre-aged rows.
- **C:** confirm a user-pinned `WATCHING` candidate doesn't flip on
  re-eval; confirm `PlanEditorModal` persists `minCompositeScore`.
- **D:** create a basket with 4 items in a specific collection,
  re-evaluate an open candidate in the same collection, confirm
  `marginalBasketValue` is non-null and positive.
- **E:** bulk-select 25 candidates, bulk-Pass, confirm one request,
  one toast-less banner confirmation, rows updated.

---

## 7. Out-of-Scope for Phase 5

- ECharts or any chart rendering. Dashboard continues to use tables.
- Real liquidity data source integration (scrape, external API).
- Per-skin float range tables and the EV math that depends on them.
- Chrome extension bridge implementation. The ingestion endpoint
  changes in this phase are payload-compatible; a separate track
  ships the bridge. Post-Phase-6 update: the local Steam Market bridge exists;
  real-market selector/extraction hardening remains.
- Drag-drop basket reorder.
- Notifications / toasts beyond inline banners.
- Automated test suite. Individual workstreams may add ad-hoc
  `bun run` scripts for regression checks; a proper runner is Phase 6.
- Typed service errors migration (tentative — see §4; hold for Phase
  6 unless opportunistic).

---

## 8. Summary of New Persisted Fields

For quick reference during migration review:

| Table              | Field                   | Type        | Nullable | Default | Added in workstream |
| ------------------ | ----------------------- | ----------- | -------- | ------- | ------------------- |
| CandidateListing   | `mergeCount`            | Int         | no       | 0       | A                   |
| CandidateListing   | `evaluationRefreshedAt` | DateTime    | yes      | null    | B                   |
| CandidateListing   | `pinnedByUser`          | Boolean     | no       | false   | C                   |
| TradeupPlan        | `minCompositeScore`     | Float       | yes      | null    | C                   |

No destructive column changes. No foreign-key reshuffles. No
rename-in-place operations.
