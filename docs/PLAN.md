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
Steam buying, selling, order placement, checkout, or confirmation flows should
remain human-executed. Tooling may deep-link to Steam pages or present
decision-support data, but it should not use bots, scripts, macros, or
non-human-controlled systems to execute marketplace actions.

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
- automated Steam listing, order placement, checkout, or confirmation
- automated final marketplace action execution of any kind; the app may
  prepare and open the correct listing, but the human presses the actual buy,
  sell, order, checkout, or confirmation controls
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

## Target Operating Model

The intended mature workflow is a self-sustaining trade-up hunting assistant,
not a marketplace checkout bot.

The operator should be able to maintain roughly five active trade-up plans,
press a `Go`-style discovery action, and have the system continuously assist
with the repetitive work:

1. Gather candidate listing observations from approved sources.
2. Normalize listing identity, price, float, inspect link, listing URL, and
   source metadata.
3. Catalog-link each listing when possible.
4. Evaluate candidates against all active plans.
5. Assign each viable candidate to the best plan, basket, bucket, or reserve
   role.
6. Build or update proposed 10-item baskets with correct float values and EV.
7. Produce an actionable buy queue with exact listing links, max buy price,
   expected EV/profit impact, assigned basket slot, and reason.
8. Let the human open the listing and press the actual marketplace purchase
   button.
9. After manual purchase, reconcile the bought item into inventory and reserve
   it into the assigned basket.

The line is therefore:

- **Automate:** discovery, normalization, scoring, duplicate handling,
  price refresh, bucket assignment, basket planning, buy-queue generation,
  deep links, and post-purchase reconciliation helpers.
- **Do not automate:** Steam buying, selling, listing, order placement,
  checkout, confirmation, or any other action that executes marketplace
  transactions.

The primary product endpoint after the current pricing foundation is a
planner/buy-queue loop: active plans define the strategy, source adapters feed
candidate listings and price observations, the planner assigns candidates to
specific plan/basket needs, and the operator only performs the final purchase
decision/action.

---

## Operating Assumptions

- The app is local-first and optimized for one operator.
- Manual buying remains the default workflow.
- Steam marketplace automation remains out of scope. The app may assist the
  operator with links, candidate details, and max-buy guidance, but the human
  operator executes marketplace actions.
- Discovery automation is in scope when it produces inspectable observations
  and recommendations rather than executing transactions.
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
- `GET /api/tradeups/buy-queue`

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
- plan-level buy queue assignment: given active plans, current inventory,
  active baskets, candidate price, and candidate float, assign viable listings
  to the best plan/basket/bucket/reserve role with a visible reason
- proposed basket construction: group exactly ten compatible inputs, preserve
  exact float values, compute projected output exteriors, and show expected
  EV/profit before the operator buys
- max-buy guidance should be attached to the candidate's assigned role, not
  just the candidate in isolation

### Global Basket Optimization Requirements

The planner is not a greedy per-candidate assigner. It is a global optimizer
over the full pool of viable inventory and candidates against active plans.

The product reason: if the operator has 39 viable skins across plans, adding
the 40th should produce the partition that yields the maximum number of viable
10-item baskets (and the maximum total expected value across them), not just
the locally best home for that one new item. A locally optimal assignment can
break a basket that was one float away from ready, or strand a scarce
collection slot in a basket that did not need it.

Concretely the planner must:

- treat the full set of `WATCHING` / `GOOD_BUY` candidates plus `HELD` /
  `RESERVED_FOR_BASKET` inventory as a single pool of slot-fillers
- treat all active `BUILDING` baskets plus zero or more proposed new baskets
  per active plan as the set of containers
- search partitions of that pool into ten-item groups under each plan's rules
  (rarity, collection mix, float bands, max buy)
- score each partition by total expected EV/profit, with viable-basket count
  as a tiebreaker so the optimizer prefers four ready baskets over three
  ready and one slightly higher EV trio
- recompute the optimal partition whenever the pool changes (new candidate,
  new price observation, plan edit, manual basket edit) so the buy queue
  reflects current optimum, not a stale greedy assignment
- for each candidate in the buy queue, surface not just the assigned basket
  but the *delta* between assigned-here vs assigned-elsewhere so the operator
  can override with full information

Tractability notes (these constrain implementation, not requirements):

- The plan-rule pre-filter shrinks the combinatorial space dramatically.
  Items only contend for baskets under plans whose rules accept them; most
  items match one or two plans, not all of them.
- Exact enumeration is feasible when per-plan candidate count is small (low
  tens). Above that, the planner should fall back to a heuristic (greedy
  initial assignment + local-search swaps that strictly improve total EV)
  and converge.
- The optimizer must be deterministic for a given input pool so the operator
  sees stable assignments across refreshes when nothing changed.
- The optimizer must be inspectable: every assignment should carry the reason
  and the next-best alternative so trust failures debug to a specific
  candidate or basket, not to "the planner moved things again."

Manual operator overrides win. If the operator pins a candidate to a specific
basket or marks an item reserved manually, the optimizer treats those as
fixed and optimizes the remainder around them.

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
- Estimated outcome values remain dynamic operator-managed plan data unless a
  local market price observation exists for the relevant market hash or
  projected exterior. The static catalog does not provide prices.

### Market Price Observation Requirements

- Dynamic prices are stored as local observations, not as static catalog data.
- Latest observed prices may override a plan outcome's manual
  `estimatedMarketValue`, but plan values remain the fallback when no
  observation exists.
- Price observations should be keyed by `marketHashName` and nullable catalog
  identity fields when a static catalog match exists.
- Projected-exterior EV should select the observed price for the projected
  market hash name when available.
- The first ingestion path should be local import or manual/API insertion.
  Automated Steam scraping or third-party price adapters should be added only
  after the local observation model is proven.
- Finished price automation should still be inspectable and operator-owned:
  source adapters produce normalized latest-price observations, the app stores
  them with source/freshness/history metadata, EV refreshes run explicitly or
  after import, and the operator reviews changes before acting. Bulk insertion
  can come from CSV/file drops, local adapter jobs, or a browser-assisted
  collector; none of those paths should automate buying, selling, order
  placement, checkout, or confirmation.
- Steam/browser collection, if added, should behave like an import adapter:
  gather visible/latest price facts, submit them through the same validated
  observation pipeline, and keep source/freshness/error reporting visible in
  `/market-prices`. It should not be treated as a hidden scoring dependency.
- Steam chart/history data can be useful for trend analysis, but browser
  chart/history endpoints are not treated as a stable official integration
  contract. Prefer building local observation history from latest-price imports
  first; add historical backfill only after selecting a reliable source.

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
- assign viable candidates into the planner/buy-queue model when enough plan,
  price, and float data exists
- return recommendation details for immediate extension feedback

### Integration Approach

The app-side ingestion endpoint exists and a local MV3 companion bridge lives
under `tools/steam-market-bridge/`. The bridge reads Steam listing globals and
float-enrichment DOM on Steam Market pages, then posts normalized candidates
to `POST /api/extension/candidates`. Ingestion remains permissive and
operator-controlled: it accepts typed float enrichment when available,
returns normalization/evaluation diagnostics, and tolerates missing catalog
matches rather than inventing them.

Future discovery automation should extend this contract rather than bypass it:
browser-assisted collectors or source adapters may gather many visible listing
facts, but they should submit normalized observations/candidates, receive
visible assignment and pricing diagnostics, and leave final marketplace action
execution to the operator.

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

### Phase 7: Planner And Buy Queue

Deliverables:

- transient `CandidateAssignment` view model carrying candidate, plan,
  basket, slot, role, max buy, expected profit, marginal EV contribution,
  float-fit explanation, pricing source/freshness, reason text, and ranked
  alternatives
- `plannerService` that performs global partition optimization across the
  full candidate + inventory pool against active plans and baskets
- `GET /api/tradeups/buy-queue` endpoint
- `/buy-queue` operator page grouped by plan and proposed basket
- `markBought` extension to carry intended basket/slot context forward into
  inventory and basket reservation
- focused planner tests for partition quality, manual-override pinning, slot
  contention resolution, float-band edge cases, max-buy gating, and stable
  output for unchanged inputs

Exit criteria:

- adding a new candidate to a pool of N items recomputes the optimal
  partition and the buy queue reflects the result deterministically
- the operator can scan the buy queue, understand each assignment's reason
  and runner-up, and complete a manual purchase with the assignment context
  preserved into inventory
- planner output is inspectable enough that disagreement debugs to a specific
  candidate or basket, not to opaque planner behavior

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
- dynamic price observations can improve EV, but stale or sparse observations
  may be worse than operator-entered outcome values if source age is not
  surfaced clearly

### Open Questions

- how detailed should the first expected-value model be for mixed baskets and multiple outcome distributions?
- how durable are Steam Market and CS2 Trader / CSFloat DOM selectors under real usage?
- should notification behavior exist in MVP or wait until the queue workflow is stable?
- when should stored candidate evaluations be recomputed after prices age?
- what freshness threshold should mark price observations stale for candidate
  and basket re-evaluation?
- which price source, if any, should backfill historical chart data after the
  local observation table has enough real usage?

These questions are real, but none of them block the foundation build.

---

## Documentation Rules

- `docs/PLAN.md` defines intended architecture, scope, priorities, and delivery order.
- `docs/PROGRESS.md` defines what is actually true in the repo now.
- If the two disagree, `PROGRESS.md` wins for current state and `PLAN.md` wins for intended direction.
- New implementation work should update `PROGRESS.md` as part of completion.
- Major scope changes should update both files in the same change.
