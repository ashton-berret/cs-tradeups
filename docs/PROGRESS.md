# CS Tradeups - Progress

## Status Snapshot

**Project Status:** Phase 2 server-side domain services implemented; Phase 1 foundation complete
**Last Updated:** 2026-04-21
**Plan Reference:** See `docs/PLAN.md`

---

## Current Reality

As of 2026-04-21, this repository has a Bun-managed SvelteKit foundation around the domain/schema files and a local SQLite database.

What currently exists:

- `README.md` with only the project name
- `docs/UI_STYLE_GUIDE.md` with visual system guidance
- `docs/PLAN.md` and `docs/PROGRESS.md` as the authoritative planning and status documents
- SvelteKit + TypeScript scaffold
- Bun lockfile and package metadata
- TailwindCSS 4.x Vite plugin and theme CSS variables
- base app shell with fixed sidebar navigation and theme toggle
- placeholder pages for dashboard, candidates, inventory, plans, baskets, and executions
- reusable UI primitives: Button, Card, Input, Badge, and Modal
- `.env.example` with the SQLite database URL shape
- Prisma schema, applied SQLite migration, Prisma client singleton, and seed script
- seeded local SQLite database at `prisma/dev.db`
- Zod schemas and shared domain types

What does not exist yet:

- API endpoints or full workflow UI
- Chrome extension integration code in this repo (the extension is called CS2 Trader - Steam Trading Enhancer on google's extension store)
- automated tests beyond Svelte type checking/build verification

The foundation is ready for Phase 2 service-layer work.

---

## Completed Work

### Phase 0: Documentation Baseline

- [x] Reviewed `docs/starting_plan.md`
- [x] Reviewed the reference documentation structure from `zwift-completionist/docs/plan.md`
- [x] Reviewed the reference progress tracking structure from `zwift-completionist/docs/progress.md`
- [x] Assessed the actual repo state
- [x] Rewrote `docs/PLAN.md` as the authoritative implementation plan
- [x] Rewrote `docs/PROGRESS.md` as the authoritative status tracker
- [x] Established the documentation contract: `PLAN.md` is intended direction and `PROGRESS.md` is actual truth

---

## Phase Tracking

### Phase 0: Documentation Baseline

- [x] Planning documents established
- [x] Scope boundaries defined
- [x] Delivery phases defined
- [x] Current repo state documented

### Phase 1: Foundation

- [x] Initialize SvelteKit + TypeScript project
- [x] Install dependencies with Bun (Prisma, Zod, TailwindCSS 4.x; ECharts deferred to Phase 4)
- [x] Configure Tailwind with CSS variables from UI_STYLE_GUIDE.md
- [x] Define Prisma schema (`prisma/schema.prisma`)
- [x] Create initial SQLite migration (`prisma/migrations/20260421000000_init/migration.sql`)
- [x] Apply initial migration to local SQLite (`prisma migrate dev`)
- [x] Create Prisma client singleton (`src/lib/server/db/client.ts`)
- [x] Create seed data (`prisma/seed.ts`)
- [x] Run seed and verify
- [x] Define shared enum constants (`src/lib/types/enums.ts`)
- [x] Define Zod schemas for all core payloads (`src/lib/schemas/`)
- [x] Define derived TypeScript types (`src/lib/types/domain.ts`)
- [x] Add base layout, sidebar nav, and theme toggle
- [x] Add `app.html` flash-prevention script

### Phase 2: Core Domain Services

- [x] Candidate service — implemented (`src/lib/server/candidates/`)
- [x] Inventory service — implemented (`src/lib/server/inventory/`)
- [x] Trade-up plan service — implemented (`src/lib/server/tradeups/planService.ts`)
- [x] Basket service — implemented (`src/lib/server/tradeups/basketService.ts`)
- [x] Evaluation service — implemented (`src/lib/server/tradeups/evaluation/`)
- [x] Execution service — implemented (`src/lib/server/tradeups/executionService.ts`)
- [x] Analytics service — implemented (`src/lib/server/analytics/analyticsService.ts`)

Legend: `[~]` = structure + typed contracts in place, function bodies pending.

### Phase 3: Ingestion And API Layer

- [ ] Extension ingestion endpoint
- [ ] Candidate API routes
- [ ] Inventory API routes
- [ ] Plan API routes
- [ ] Basket API routes
- [ ] Execution API routes
- [ ] Analytics summary endpoint

### Phase 4: Operator UI

- [ ] Dashboard
- [ ] Candidates page
- [ ] Inventory page
- [ ] Trade-up plans page
- [ ] Trade-up baskets page
- [ ] Executions page

### Phase 5: Scoring And Workflow Refinement

- [ ] Duplicate suppression refinement
- [ ] Basket-aware ranking
- [ ] Recommendation threshold tuning
- [ ] Bulk actions and workflow polish

### Phase 6: Quality And Decision Support

- [ ] Historical analytics improvements
- [ ] Expected vs realized reporting improvements
- [ ] Export/report helpers if needed
- [ ] Broader verification and testing coverage

---

## Locked Decisions

These decisions are currently stable enough to build against:

- Framework: SvelteKit + TypeScript
- Package manager/runtime tooling: Bun
- Persistence: SQLite via Prisma
- Validation: Zod at every inbound boundary
- Product mode: local-first, single-user
- Purchase flow: manual buying only in MVP
- Ingestion model: third-party Chrome extension (CS2 Trader) provides candidate data; app adapts to its payload format
- Documentation model: `PLAN.md` is the roadmap and architecture source of truth, while `PROGRESS.md` is the execution/state source of truth

---

## Open Questions

Resolved during Phase 2 scaffold planning:

- **First-pass EV formula — RESOLVED.** CS2 collection-weighted formula:
  each input contributes 1/10 of the source-collection pick weight, then
  each outcome in the chosen collection is drawn proportional to its
  `probabilityWeight`. Scaffolded in
  `src/lib/server/tradeups/evaluation/expectedValue.ts`.
- **Re-evaluation triggers — RESOLVED.** Eager fan-out on plan mutations
  via `planService.reevaluateAllForPlan`, plus a manual
  `reevaluateOpenCandidates` escape hatch.
- **Audit/event log — DEFERRED.** Not shipping in Phase 2. Revisit in
  Phase 3 when extension ingestion lands and we need to explain duplicate
  behavior and state transitions.

Still unresolved (do NOT block Phase 2 implementation, but must be
addressed before Phase 5 scoring refinement):

- **Per-weapon / per-skin float ranges.** Each skin has its own
  `minFloat`/`maxFloat`, which narrows the effective exterior band for any
  given output. Needed to correctly map basket averageFloat to the actual
  output float and therefore the correct price tier. Current EV code uses
  outcome `estimatedMarketValue` as-is, which collapses this dimension. A
  lookup table (skin → minFloat, maxFloat) will need to be added. Marked
  with `TODO` in `src/lib/server/utils/float.ts` and
  `src/lib/server/tradeups/evaluation/scoring.ts`.
- **Liquidity data source.** `computeLiquidityScore` is a 0.5 stub until a
  listing-volume signal (daily scrape, or a rolling count of how often we
  see the same hash name in ingestion) is added.
- **Candidate re-evaluation on price age.** Prices drift; at some point a
  stored evaluation is a lie. Options: time-based sweep on a timer, or
  on-view recompute when a candidate row is read and its `lastSeenAt` is
  older than N hours.
- **Minimum extension payload guaranteed on day one.** Depends on
  extension integration work in Phase 3.
- **Notifications beyond queue visibility.** MVP likely skips; revisit in
  Phase 5.

---

## Immediate Next Steps

The next implementation slice should be:

1. Implement the first version of the service layer before building route-heavy UI.
2. Add basic API routes around the service contracts.
3. Connect placeholder pages to real server data.

This keeps the project moving from scaffolded foundation into a usable backend workflow without front-loading presentation work.

---

## Risks

- It is easy for this project to overbuild the scoring engine before the basic workflow exists.
- It is easy to make the extension payload contract too loose and pay for that later in normalization complexity.
- It is easy to let dashboard ideas outrun the quality of stored operational data.

The correct bias right now is to build the system of record first, then deepen the recommendation quality.

---

## Change Log

### 2026-04-21 (Phase 2 scaffold)

- Implemented Phase 2 evaluation utilities and orchestrator: normalization-independent rule matching, CS2 collection-weighted EV, scoring, recommendations, and persisted candidate evaluation.
- Implemented candidate normalization, duplicate merging/staleness, candidate CRUD, extension ingestion, buy conversion, and open-candidate re-evaluation.
- Implemented inventory ledger reads/writes, basket eligibility, candidate conversion alias, DTO mapping, and status-machine enforcement.
- Implemented trade-up plan CRUD, rule/outcome management, target-rarity validation, delete guards, DTO mapping, and eager candidate re-evaluation fan-out.
- Implemented basket CRUD, item reservation/release, READY/CANCELLED transitions, transaction-safe reordering, and eager metric recomputation.
- Implemented execution reads, atomic READY-to-EXECUTED creation, result recording, sale recording, and realized profit calculations.
- Implemented analytics dashboard summary, plan performance rollups, live-row activity feed, and expected-vs-realized execution series.
- Added service-layer skeletons with full type contracts and header-comment
  specs; bodies are `throw new Error('Not implemented')` placeholders.
- Added `src/lib/types/services.ts` with DTOs and evaluation result shapes
  so routes/UI never touch `Prisma.Decimal`.
- Added `src/lib/server/README.md` describing contract rules (validation
  boundary, transactional mutations, eager metric recomputation, caller-
  driven re-eval fan-out).
- Locked decisions captured during scaffolding:
  - Duplicates always merge; staleness is a derived signal.
  - Re-evaluation fans out eagerly from plan mutations; manual "re-score"
    action remains as an escape hatch.
  - Basket metrics recomputed eagerly inside every mutation transaction.
  - Execution creation is a single atomic transaction; no partial states.
  - CS2 collection-weighted EV formula adopted (not simple weighted mean).
  - Services return plain `number` at the boundary; no `Decimal` leaks.
- Per-skin float ranges surfaced as future work (see Open Questions).

### 2026-04-20

- Replaced placeholder planning/status docs with authoritative project versions.
- Synchronized the project documentation structure with the useful parts of the `zwift-completionist` reference docs while adapting content to the CS trade-up workflow.
- Marked the repository honestly as pre-implementation so future work can be tracked cleanly from zero.
- Deleted `starting_plan.md` after incorporating all relevant content into `PLAN.md`.
- Added domain enums for ItemRarity, ItemExterior, CandidateSource, CandidateDecisionStatus, InventoryStatus, and TradeupBasketStatus.
- Added `TradeupOutcomeItem` model for expected value calculations (manual entry initially).
- Added `lastSeenAt` and `timesSeen` to CandidateListing for duplicate suppression.
- Clarified extension is third-party (CS2 Trader - Steam Trading Enhancer).
- Specified the evaluate endpoint scope (candidate, inventory item, or basket).
- Updated stack to explicitly include Svelte 5, TailwindCSS 4.x, and ECharts.
- Cleaned up UI_STYLE_GUIDE.md: replaced budget-app references with CS2 rarity colors and correct localStorage key.

### 2026-04-21

- Scaffolded the SvelteKit + TypeScript app using the current Svelte CLI and Bun-managed dependencies.
- Added TailwindCSS 4.x Vite integration, global theme CSS variables, glow utilities, and app flash-prevention script.
- Added a fixed sidebar app shell, active route highlighting, and a Svelte 5 runes theme store using `cs-tradeups-theme`.
- Added placeholder pages for `/dashboard`, `/candidates`, `/inventory`, `/tradeups/plans`, `/tradeups/baskets`, and `/tradeups/executions`; `/` redirects to `/dashboard`.
- Added basic UI primitives: Button, Card, Input, Badge, and Modal.
- Added `.env` with local SQLite `DATABASE_URL`.
- Added `.env.example` with the same SQLite URL shape.
- Pinned Prisma to 6.x because Prisma 7 rejects the existing schema's `datasource.url` contract.
- Generated the initial Prisma migration SQL artifact.
- Verified `bun run check`, `bun run build`, and local dev-server route rendering.
- Switched persistence from PostgreSQL to SQLite to reduce local setup friction.
- Updated Prisma enum fields to string storage while preserving app-level Zod enum validation.
- Applied SQLite migration and seeded the local database successfully.
