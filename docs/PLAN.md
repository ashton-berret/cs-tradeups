# CS Tradeups - Master Plan

## Document Contract

**Purpose:** This file is the implementation source of truth for `cs-tradeups`.
**Last Updated:** 2026-04-24
**Companion Document:** See `docs/PROGRESS.md` for actual current status and completed work.
**Supporting Reference:** `docs/UI_STYLE_GUIDE.md` remains the visual/style reference, but it does not override product scope, architecture, or delivery priorities defined here.

---

## Project Overview

### Goal

Build a single-user trade-up operations platform for Counter-Strike 2 that helps the user:

- define profitable trade-up strategies
- ingest and evaluate candidate marketplace listings
- track purchased inventory
- organize items into active 10-item baskets
- record completed contracts
- compare expected results against realized results over time

### Core Problem

Manual trade-up hunting is fragmented and slow. The user currently has to:

- browse large volumes of marketplace listings
- remember which collections, rarities, exteriors, and float bands matter
- estimate whether an item still fits an active plan or basket
- separately track what has already been purchased
- manually compare expected value against actual outcomes later

This project centralizes those decisions so the user spends time on judgment and execution, not repetitive filtering and bookkeeping.

### Product Positioning

This is not a general marketplace bot and not an automated purchasing system.

This is a decision-support and record-keeping system that should:

- surface high-signal buying opportunities
- preserve why a listing looked attractive at the time it was seen
- maintain a reliable inventory and basket ledger
- make strategy performance measurable instead of anecdotal

---

## Scope Boundaries

### In Scope For MVP

- local single-user web application
- Chrome extension ingestion endpoint
- rule-driven candidate evaluation
- duplicate suppression for repeated listing discovery
- candidate queue and review workflow
- inventory tracking after manual purchase
- basket building and readiness tracking
- execution logging
- expected versus realized profitability tracking
- lightweight dashboard and analytics summary

### Explicitly Out of Scope For MVP

- automated Steam purchasing
- multi-user collaboration
- exchange integrations beyond the extension payload
- advanced auth and permission systems
- full alerting infrastructure beyond simple local-ready hooks
- highly optimized EV modeling for every edge case before basic workflow exists

---

## Success Criteria

The MVP is successful when the user can:

1. Define at least a few reusable trade-up plans with float and price constraints.
2. Send candidate listings from the extension into the app with enough data to evaluate them.
3. Review a queue of scored candidates and mark chosen items as bought.
4. Track owned items and assemble them into baskets.
5. Record completed contracts and later log actual sale outcomes.
6. See whether a strategy is profitable based on recorded history rather than intuition.

---

## Operating Assumptions

- The app is local-first and optimized for one operator.
- Manual buying remains the default workflow.
- The Chrome extension is responsible for gathering listing-page data and float-rich metadata.
- The Svelte app is the system of record after ingestion.
- SQLite is the default local database for MVP development and single-user operation.
- Prisma remains the persistence layer until scale or write patterns justify change.
- Validation happens at every external boundary with Zod.

---

## Technical Direction

### Stack

- Frontend: SvelteKit (Svelte 5, runes syntax) + TypeScript
- Server: SvelteKit server routes, page server loads, and actions where appropriate
- Database: SQLite via Prisma
- Validation: Zod
- Styling: TailwindCSS 4.x, guided by `docs/UI_STYLE_GUIDE.md`
- Charts: ECharts

### Why This Stack

- SvelteKit keeps UI, server endpoints, and server-side workflows in one codebase.
- Svelte 5 runes provide fine-grained reactivity with less boilerplate.
- SQLite keeps the local-first single-user setup easy to run; Prisma gives typed access and keeps a future PostgreSQL migration possible if scale or write patterns justify it.
- Zod makes extension payload validation explicit and maintainable.
- TailwindCSS enables rapid, consistent styling aligned with the UI style guide.
- ECharts handles dashboard charting with minimal overhead.
- The existing style guide is already compatible with a dark, data-heavy tool interface.

---

## Product Surfaces

### Primary User Workflows

1. Create and maintain trade-up plans.
2. Ingest candidate listings from the extension.
3. Review scored candidates and decide whether to pass, watch, or buy.
4. Convert bought candidates into inventory items.
5. Build and manage baskets from owned inventory.
6. Record execution results and later sale outcomes.
7. Review dashboard metrics to validate whether plans actually work.

### Core Pages

- `/dashboard`
- `/candidates`
- `/inventory`
- `/tradeups/plans`
- `/tradeups/baskets`
- `/tradeups/executions`

### Core Programmatic Endpoints

- `POST /api/extension/candidates`
- `GET /api/candidates`
- `POST /api/candidates`
- `GET /api/candidates/[id]`
- `PATCH /api/candidates/[id]`
- `DELETE /api/candidates/[id]`
- `POST /api/candidates/[id]/buy`
- `POST /api/candidates/[id]/reevaluate`
- `POST /api/candidates/reevaluate-open`
- `POST /api/candidates/refresh-stale`
- `GET /api/inventory`
- `GET /api/inventory/eligible`
- `POST /api/inventory`
- `GET /api/inventory/[id]`
- `PATCH /api/inventory/[id]`
- `DELETE /api/inventory/[id]`
- `GET /api/tradeups/plans`
- `POST /api/tradeups/plans`
- `GET /api/tradeups/plans/[id]`
- `PATCH /api/tradeups/plans/[id]`
- `DELETE /api/tradeups/plans/[id]`
- `POST /api/tradeups/plans/[id]/rules`
- `PATCH /api/tradeups/plans/rules/[ruleId]`
- `DELETE /api/tradeups/plans/rules/[ruleId]`
- `POST /api/tradeups/plans/[id]/outcomes`
- `PATCH /api/tradeups/plans/outcomes/[outcomeId]`
- `DELETE /api/tradeups/plans/outcomes/[outcomeId]`
- `GET /api/tradeups/baskets`
- `POST /api/tradeups/baskets`
- `GET /api/tradeups/baskets/[id]`
- `PATCH /api/tradeups/baskets/[id]`
- `DELETE /api/tradeups/baskets/[id]`
- `POST /api/tradeups/baskets/[id]/items`
- `DELETE /api/tradeups/baskets/[id]/items/[inventoryItemId]`
- `PATCH /api/tradeups/baskets/[id]/items/reorder`
- `POST /api/tradeups/baskets/[id]/ready`
- `POST /api/tradeups/baskets/[id]/cancel`
- `POST /api/tradeups/evaluate` (evaluate a candidate, inventory item, or basket on demand)
- `GET /api/tradeups/executions`
- `POST /api/tradeups/executions`
- `GET /api/tradeups/executions/[id]`
- `PATCH /api/tradeups/executions/[id]/result`
- `PATCH /api/tradeups/executions/[id]/sale`
- `GET /api/analytics/summary`
- `GET /api/analytics/activity`
- `GET /api/analytics/plan-performance`
- `GET /api/analytics/expected-vs-realized`
- `GET /api/catalog`
- `GET /api/catalog/summary`
- `GET /api/exports/executions.csv`
- `GET /api/exports/expected-vs-realized.csv`

---

## Domain Model

### Domain Enums

The following values are app-level enums validated with Zod and shared TypeScript constants. In SQLite they are persisted as strings because the SQLite connector does not provide native enum columns.

**ItemRarity** (CS2 trade-up tiers, ordered lowest to highest):

- `CONSUMER_GRADE`
- `INDUSTRIAL_GRADE`
- `MIL_SPEC`
- `RESTRICTED`
- `CLASSIFIED`
- `COVERT`

**ItemExterior:**

- `FACTORY_NEW`
- `MINIMAL_WEAR`
- `FIELD_TESTED`
- `WELL_WORN`
- `BATTLE_SCARRED`

**CandidateSource:**

- `EXTENSION`
- `MANUAL`
- `IMPORT`

**CandidateDecisionStatus:**

- `WATCHING`
- `GOOD_BUY`
- `PASSED`
- `BOUGHT`
- `DUPLICATE`
- `INVALID`

**InventoryStatus:**

- `HELD`
- `RESERVED_FOR_BASKET`
- `USED_IN_CONTRACT`
- `SOLD`
- `ARCHIVED`

**TradeupBasketStatus:**

- `BUILDING`
- `READY`
- `EXECUTED`
- `CANCELLED`

### CandidateListing

Represents a listing that was discovered and evaluated but is not necessarily owned.

Primary responsibilities:

- preserve the original observation
- store evaluation output and recommendation status
- support duplicate detection and later review quality analysis
- track re-observation frequency via `lastSeenAt` and `timesSeen` for duplicate suppression
- store nullable static-catalog identity links when a real CS2 skin match is available:
  `catalogSkinId`, `catalogCollectionId`, `catalogWeaponDefIndex`, and `catalogPaintIndex`

### InventoryItem

Represents an item the user actually bought or currently holds.

Primary responsibilities:

- track cost basis and ownership state
- connect purchased items back to the original candidate when available
- support basket assignment and execution history
- store the same nullable static-catalog identity links as candidates when available

### TradeupPlan

Represents a reusable strategy definition.

Primary responsibilities:

- define target outcome assumptions
- define minimum profitability thresholds
- serve as the matching backbone for candidate and basket evaluation

### TradeupPlanRule

Represents allowed or preferred input constraints for a plan.

Typical fields should cover:

- collection
- optional stable catalog collection identity (`catalogCollectionId`)
- rarity
- exterior
- float range
- max buy price
- weighting or preference flags
- required counts when a plan needs composition constraints

### TradeupOutcomeItem

Represents a possible output item for a trade-up plan.

Primary responsibilities:

- store the identity and estimated market value of each possible trade-up outcome
- enable expected value calculation for plans and baskets
- support manual entry initially with potential for automated collection scraping later

Typical fields should cover:

- plan association
- market hash name
- weapon and skin name
- collection
- optional stable catalog identity (`catalogSkinId`, `catalogCollectionId`,
  `catalogWeaponDefIndex`, `catalogPaintIndex`)
- rarity (should match the plan's target rarity)
- estimated market value
- probability weight (for weighted EV calculations)

### TradeupBasket

Represents an active or completed 10-item basket tied to a plan.

Primary responsibilities:

- group inventory items into an execution-ready set
- track expected metrics before execution
- communicate basket readiness and value

### TradeupBasketItem

Join entity connecting inventory items to a basket.

### TradeupExecution

Represents a completed trade-up contract and its downstream sale outcome.

Primary responsibilities:

- freeze pre-execution expected values
- record actual output details
- record realized sale details
- compute realized profit

### Audit/Event Logging

An `AppEvent` or similar audit model is optional for the first implementation slice but strongly recommended once extension ingestion begins. It will make duplicate behavior, workflow changes, and odd state transitions explainable.

---

## Architecture Principles

### Layering

- UI components render state and collect user intent.
- Route files stay thin and delegate to services.
- Domain services own business rules.
- Repository or DB helpers own Prisma access.
- Shared helpers handle money, float, IDs, dates, and normalization.

### Rules

- Do not put business logic in Svelte components.
- Do not access Prisma directly from route UI code if the same logic belongs in a service.
- Validate all inbound payloads with Zod before service execution.
- Prefer explicit DTOs and derived types over leaking raw persistence shapes everywhere.
- Keep duplicate detection, scoring thresholds, and profit calculations centralized.

---

## Evaluation Engine Strategy

The evaluation engine is the differentiator, but it should be built in layers instead of trying to model perfect EV immediately.

### Phase 1 Evaluation Requirements

- match candidates against active plans
- determine a best-fit plan
- compute a tentative max buy price
- compute expected profit and expected profit percentage
- compute a basic quality score
- compute a basic liquidity score
- produce a recommendation status

### Phase 2 Evaluation Requirements

- basket-aware marginal value scoring
- better duplicate suppression and refresh handling
- stronger float-fit and plan-rule weighting
- conservative valuation path beside optimistic valuation

### Catalog-Aware Evaluation Requirements

- Static CS2 catalog data stays separate from dynamic operator data. The app
  serves the catalog from a generated snapshot file, not runtime database
  tables.
- Dynamic rows may store nullable catalog identity references so real matched
  candidates, inventory, plan rules, and outcomes can use stable IDs while
  unmatched manual/filler rows remain valid.
- Matching and EV grouping should prefer `catalogCollectionId` over display
  collection strings when both sides have catalog linkage.
- Basket EV breakdowns should project output float/exterior from catalog
  skin min/max ranges when a plan outcome is linked to `catalogSkinId`.
- Estimated outcome values remain dynamic operator-managed plan data until a
  real price table exists; the static catalog does not provide prices.

### Recommendation States

At minimum:

- `WATCHING`
- `GOOD_BUY`
- `PASSED`
- `BOUGHT`
- `DUPLICATE`
- `INVALID`

### Duplicate Detection Baseline

Treat candidates as soft duplicates when enough of the following match within a recent time window:

- market hash name
- listed price
- float within a small epsilon
- listing ID or source URL

The system should prefer merging or refreshing over creating noise when repeated browsing surfaces the same opportunity.

---

## Extension Integration Contract

The ingestion source is a third-party Chrome extension (CS2 Trader - Steam Trading Enhancer). Since we do not control the extension, the app must adapt to whatever payload format the extension produces.

### What The Extension Provides

- listing metadata from the Steam Marketplace page
- float-aware details when available
- data in whatever structure the extension uses natively

### App Responsibilities

- accept and normalize the extension payload into the internal candidate format
- validate the normalized payload with Zod
- detect duplicates
- persist the candidate
- evaluate against active plans
- return recommendation details for immediate extension feedback

### Integration Approach

The app-side ingestion endpoint exists and a local MV3 companion bridge lives
under `tools/steam-market-bridge/`. The bridge reads Steam listing globals and
float-enrichment DOM on Steam Market pages, then posts normalized candidates
to `POST /api/extension/candidates`. Ingestion remains permissive and
operator-controlled: it accepts typed float enrichment when available,
returns normalization/evaluation diagnostics, and tolerates missing catalog
matches rather than inventing them.

### MVP Security

Use a local-only shared secret header for the extension endpoint rather than building full auth up front.

---

## Proposed Repository Structure

```text
cs-tradeups/
├─ prisma/
│  ├─ migrations/
│  ├─ schema.prisma
│  └─ seed.ts
├─ src/
│  ├─ app.d.ts
│  ├─ app.html
│  ├─ hooks.server.ts
│  ├─ lib/
│  │  ├─ components/
│  │  ├─ schemas/
│  │  ├─ server/
│  │  │  ├─ db/
│  │  │  ├─ candidates/
│  │  │  ├─ inventory/
│  │  │  ├─ tradeups/
│  │  │  ├─ analytics/
│  │  │  └─ utils/
│  │  └─ types/
│  └─ routes/
│     ├─ dashboard/
│     ├─ candidates/
│     ├─ inventory/
│     ├─ tradeups/
│     └─ api/
└─ docs/
   ├─ PLAN.md
   ├─ PROGRESS.md
   └─ UI_STYLE_GUIDE.md
```

This structure is directional, not sacred. The real constraint is separation of concerns, not folder ceremony.

---

## Delivery Phases

### Phase 0: Documentation Baseline

Deliverables:

- replace placeholder planning docs
- establish `PLAN.md` and `PROGRESS.md` as the only authoritative planning/status docs
- keep `starting_plan.md` as historical source material, not active truth

Exit criteria:

- both documents agree on scope, current status, and next execution slices

### Phase 1: Foundation

Deliverables:

- initialize SvelteKit + TypeScript project
- set up Prisma
- create base schema and migration
- create Prisma singleton
- create Zod schemas for candidate, inventory, plan, basket, and execution payloads
- establish base layout, theme, and UI primitives

Exit criteria:

- app boots locally
- schema exists and migrates cleanly
- seed data can populate realistic states

### Phase 2: Core Domain Services

Deliverables:

- candidate service
- inventory service
- trade-up plan service
- basket service
- evaluation service
- execution service
- analytics service

Exit criteria:

- route files can rely on stable service contracts
- core business rules exist outside UI

### Phase 3: Ingestion And API Layer

Deliverables:

- extension ingestion endpoint
- CRUD-style endpoints for candidates, inventory, plans, baskets, and executions
- analytics summary endpoint
- shared request validation and error handling

Exit criteria:

- extension payloads can be stored and scored end-to-end
- manual workflows are scriptable via API

### Phase 4: Operator UI

Deliverables:

- dashboard
- candidate queue
- inventory management
- plan management
- basket management
- execution history

Exit criteria:

- the full manual workflow can be completed through the UI

### Phase 5: Scoring And Workflow Refinement

Deliverables:

- stronger basket-aware ranking
- duplicate refresh behavior
- recommendation tuning
- bulk actions and operator ergonomics

Exit criteria:

- the app is faster and more reliable than the current manual process

### Phase 6: Quality And Decision Support

Deliverables:

- realistic seed data expansion
- dashboard refinements
- expected vs realized comparisons
- export/reporting helpers if needed

Exit criteria:

- the app provides trustworthy historical performance insight

---

## Initial Execution Order

The first practical build sequence should be:

1. Project scaffold and database schema.
2. Seed data and type-safe services.
3. Extension ingestion and candidate scoring baseline.
4. Candidate and inventory UI.
5. Basket and execution workflows.
6. Analytics and refinement.

This order intentionally biases toward getting the discovery loop working before polishing downstream reporting.

---

## Risks And Open Design Questions

### Risks

- extension payload quality may be inconsistent until the bridge mechanism and minimum payload are proven against real extension output
- float precision and duplicate matching can create false positives or false negatives
- expected value formulas can be misleading if assumptions are not explicit
- marketplace prices are time-sensitive, so stale candidate evaluations may need re-evaluation logic
- catalog-linked EV can project output float/exterior, but it still depends on
  operator-entered outcome values until dynamic price data exists

### Open Questions

- how detailed should the first expected-value model be for mixed baskets and multiple outcome distributions?
- how durable are Steam Market and CS2 Trader / CSFloat DOM selectors under real usage?
- should notification behavior exist in MVP or wait until the queue workflow is stable?
- when should stored candidate evaluations be recomputed after prices age?
- should projected-exterior EV eventually select prices from a dynamic price
  table rather than one operator-entered estimated value per outcome?

These questions are real, but none of them block the foundation build.

---

## Documentation Rules

- `docs/PLAN.md` defines intended architecture, scope, priorities, and delivery order.
- `docs/PROGRESS.md` defines what is actually true in the repo now.
- If the two disagree, `PROGRESS.md` wins for current state and `PLAN.md` wins for intended direction.
- New implementation work should update `PROGRESS.md` as part of completion.
- Major scope changes should update both files in the same change.
