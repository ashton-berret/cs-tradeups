# Phase 4 Operator UI — Implementation Plan

**Status:** Historical implementation plan. Phase 4 has been implemented; see
`docs/PROGRESS.md` for current state.
**Last Updated:** 2026-04-24
**Scope:** `/dashboard`, `/candidates`, `/inventory`, `/tradeups/plans`,
`/tradeups/baskets`, `/tradeups/executions`
**Companion:** `docs/PLAN.md` (intended direction),
`docs/PROGRESS.md` (actual state), `src/routes/api/README.md` (API surface)

---

## 1. Global Conventions

These apply to every page below. They exist so each page file stays small
and predictable.

### 1.1 Data boundary

- Pages call **HTTP `/api/**`** only — never import `$lib/server/**`
  services directly from `+page.server.ts`. This keeps the same contract
  the extension and any future clients use, and matches the boundary
  decision in `docs/PROGRESS.md` §"Immediate Next Steps".
- `+page.server.ts` loads use SvelteKit's injected `fetch` so relative
  URLs resolve and cookies/headers pass through on SSR.
- Mutations default to **SvelteKit form actions** (progressive-enhanced
  via `use:enhance`). Read-modify flows that need optimistic UI (basket
  slot reorder, filter/sort changes) may use a thin client fetch helper
  instead of an action.

### 1.2 Shared client helpers (proposed, new)

Create `src/lib/client/api.ts` — a thin typed fetch wrapper that:

- Accepts a relative path and a body.
- Throws a typed `ApiError` with `{ status, error, message, issues? }`
  parsed from the standard error envelope documented in
  `src/routes/api/README.md` §"Error translation".
- Is used by actions and by any client-side mutations.

```ts
// src/lib/client/api.ts
export class ApiError extends Error {
  status: number;
  code: string;               // e.g. "ValidationError"
  issues?: unknown[];
}
export async function apiFetch<T>(
  fetchFn: typeof fetch,
  path: string,
  init?: RequestInit,
): Promise<T>; // throws ApiError on non-2xx
```

### 1.3 Shared UI primitives (new, under `src/lib/components/`)

Only add what genuinely repeats across pages. Candidate additions:

- `DataTable.svelte` — generic header/row snippet-based table with
  loading/empty/error slots. Used by candidates, inventory, plans,
  baskets, executions.
- `PaginationControl.svelte` — page, limit, totalPages from
  `PaginatedResponse<T>`.
- `FilterBar.svelte` — host slot for per-page filter inputs + a reset
  button. Pushes state to URL search params.
- `StatusBadge.svelte` — maps every domain enum
  (`CandidateDecisionStatus`, `InventoryStatus`,
  `TradeupBasketStatus`) to a semantic colored `<Badge>`.
- `Money.svelte` / `Percent.svelte` / `FloatValue.svelte` — tiny
  formatters so every page renders money/percent/float consistently.
- `ConfirmModal.svelte` — wraps `Modal` with "confirm/cancel" semantics
  and a `danger` variant for destructive actions.

Everything else stays in the page file until a third copy appears.

### 1.4 UI state model

Every data-bearing page exposes the same five visual states:

| State          | Trigger                                                    |
| -------------- | ---------------------------------------------------------- |
| loading        | initial load (SSR fallback) / client-side fetch pending    |
| empty          | load succeeded, zero rows                                  |
| error          | `+page.server.ts` throws → SvelteKit `+error.svelte` page  |
| populated      | normal                                                     |
| confirmation   | destructive mutations (delete, cancel basket, etc.)        |

Action feedback (form.error, form.success) is rendered inline at the
top of the relevant form. Use toasts only if/when added; not in scope
for this phase.

### 1.5 Svelte 5 conventions

- `let { data, form } = $props();` for load/action payloads.
- `let x = $state(...)` for local UI state (filters, modal open flags).
- `$derived` for computed view-model values.
- No global stores beyond the existing `theme` store.
- Keep business logic OUT of components. Pages massage DTOs into view
  shapes; anything non-trivial becomes a pure helper in
  `src/lib/client/viewModels/<page>.ts`.

### 1.6 Filter/sort/page state

Filter/sort/page state is mirrored in the URL (`?status=GOOD_BUY&...`)
so the browser back button works and links are shareable. Pages compute
their filter object from `url.searchParams` in `load`, then pass the
current filter back to the page so inputs render their current value.

---

## 2. File List (Proposed)

Only files to be added or replaced. Existing placeholder `+page.svelte`
files become real components.

```
src/lib/client/
  api.ts                                         (new)
  viewModels/
    candidates.ts                                (new)
    inventory.ts                                 (new)
    plans.ts                                     (new)
    baskets.ts                                   (new)
    executions.ts                                (new)
    dashboard.ts                                 (new)

src/lib/components/
  DataTable.svelte                               (new)
  PaginationControl.svelte                       (new)
  FilterBar.svelte                               (new)
  StatusBadge.svelte                             (new)
  ConfirmModal.svelte                            (new)
  Money.svelte                                   (new)
  Percent.svelte                                 (new)
  FloatValue.svelte                              (new)

src/routes/dashboard/
  +page.server.ts                                (new)
  +page.svelte                                   (replace placeholder)

src/routes/candidates/
  +page.server.ts                                (new)
  +page.svelte                                   (replace placeholder)
  CandidateRow.svelte                            (new, local)
  CandidateDetailModal.svelte                    (new, local)
  BuyCandidateModal.svelte                       (new, local)

src/routes/inventory/
  +page.server.ts                                (new)
  +page.svelte                                   (replace placeholder)
  InventoryRow.svelte                            (new, local)
  InventoryEditModal.svelte                      (new, local)
  ManualAddInventoryModal.svelte                 (new, local)

src/routes/tradeups/plans/
  +page.server.ts                                (new)
  +page.svelte                                   (replace placeholder)
  PlanCard.svelte                                (new, local)
  PlanEditorModal.svelte                         (new, local)
  RuleEditor.svelte                              (new, local)
  OutcomeEditor.svelte                           (new, local)

src/routes/tradeups/baskets/
  +page.server.ts                                (new)
  +page.svelte                                   (replace placeholder)
  BasketCard.svelte                              (new, local)
  BasketSlotGrid.svelte                          (new, local)
  BasketBuilderModal.svelte                      (new, local)
  EligibleInventoryList.svelte                   (new, local)

src/routes/tradeups/executions/
  +page.server.ts                                (new)
  +page.svelte                                   (replace placeholder)
  ExecutionRow.svelte                            (new, local)
  RecordResultModal.svelte                       (new, local)
  RecordSaleModal.svelte                         (new, local)
  NewExecutionModal.svelte                       (new, local)

src/routes/
  +error.svelte                                  (new, shared error page)
```

"Local" components live next to the page that owns them and are not
imported elsewhere. Promote to `src/lib/components/` only on the third
usage.

---

## 3. Per-Page Plans

Each subsection follows the same shape: data needs → `load` contract →
mutations → types → components → UI states → open questions.

### 3.1 `/dashboard`

**Purpose:** At-a-glance KPIs, recent activity, expected-vs-realized
series. Entry point after login.

**Data it needs (from existing `/api`):**

- `GET /api/analytics/summary` — top-line KPIs
- `GET /api/analytics/activity?limit=20` — activity feed
- `GET /api/analytics/plan-performance` — per-plan rollups
- `GET /api/analytics/expected-vs-realized` — execution series

All four are fetched in parallel inside `load`.

**`+page.server.ts` load shape:**

```ts
// NOTE: AnalyticsSummaryDTO is not yet exported from $lib/types/services.
//       See §5 "API gaps" below.
export interface DashboardLoad {
  summary: AnalyticsSummaryDTO;
  activity: ActivityEntry[];
  planPerformance: PlanPerformanceRow[];
  evRealized: EvRealizedPoint[];
}
export const load: PageServerLoad = async ({ fetch }) => { /* TODO */ };
```

**Form actions:** none. Dashboard is read-only in Phase 4. A
"re-evaluate open candidates" button may call
`POST /api/candidates/reevaluate-open` via a small action and then
invalidate. Ship without it if time-boxed.

**Components used:**

- `Card` (KPI tiles)
- `DataTable` (plan performance, activity)
- `StatusBadge`
- Chart: **deferred** — render expected-vs-realized as a
  `DataTable` fallback for Phase 4 per PROGRESS §"Immediate Next Steps".
  ECharts is listed as not-installed; do not add it in this phase.

**UI states:**

- loading: skeleton cards (SSR renders real data; skeleton is only for
  client-side invalidation).
- empty: zero executions ⇒ show "no executions yet" placeholder in the
  expected-vs-realized section; KPIs still render with zeros.
- error: fallback to `+error.svelte`.

---

### 3.2 `/candidates`

**Purpose:** Review the queue of scored listings; decide
pass/watch/good-buy; convert "bought" into inventory.

**Data it needs:**

- `GET /api/candidates?status=...&...` — primary list
- `GET /api/tradeups/plans?isActive=true` — to show "matched plan" names
  alongside `matchedPlanId` on each row. Loaded once on the page.

**`+page.server.ts` load shape:**

```ts
export interface CandidatesLoad {
  page: PaginatedResponse<CandidateDTO>;
  filter: CandidateFilter;       // echoed for inputs
  activePlans: PlanDTO[];        // for matchedPlanId → name lookup
}
export const load: PageServerLoad = async ({ url, fetch }) => { /* TODO */ };
```

**Form actions:**

```ts
export const actions: Actions = {
  // PATCH /api/candidates/[id]  { status: 'PASSED' | 'WATCHING' | 'GOOD_BUY' }
  setStatus: async ({ request, fetch }) => { /* TODO */ },

  // POST /api/candidates/[id]/buy → creates InventoryItem
  // Body: { purchasePrice, purchaseFees?, purchaseDate? }
  buy: async ({ request, fetch }) => { /* TODO */ },

  // POST /api/candidates/[id]/reevaluate
  reevaluate: async ({ request, fetch }) => { /* TODO */ },

  // POST /api/candidates  (manual add)
  create: async ({ request, fetch }) => { /* TODO */ },

  // DELETE /api/candidates/[id]
  delete: async ({ request, fetch }) => { /* TODO */ },
};
```

**Types the page declares locally:**

```ts
type CandidateRowVM = CandidateDTO & {
  matchedPlanName: string | null;     // resolved via activePlans
  canBuy: boolean;                    // derived: status !== BOUGHT/INVALID
  stalenessLabel: string;             // from StalenessLevel
};
```

**Components:**

- `FilterBar` (status, rarity, exterior, float min/max, price min/max, search)
- `DataTable` of `CandidateRow.svelte`
- `CandidateDetailModal.svelte` — read-only detail + notes editor,
  triggers the set-status/reevaluate actions.
- `BuyCandidateModal.svelte` — confirms purchase price and fees before
  submitting `buy`.
- `PaginationControl`

**UI states:**

- loading: SSR renders rows; client-side filter/sort invalidation
  shows a subtle progress bar on the table header.
- empty: "No candidates match these filters." with a "clear filters"
  button if any filter is active.
- error: `+error.svelte`.
- success: after `buy`, redirect to `/inventory` with
  `?highlight=<inventoryItemId>` or keep user on /candidates with a
  success banner. **Pick one — defaulting to "stay + banner" in this
  plan** so the queue workflow is uninterrupted.
- confirmation: delete uses `ConfirmModal`. Status changes do not.

---

### 3.3 `/inventory`

**Purpose:** Manage held items — update estimated current value,
status, notes; manually add off-candidate purchases.

**Data it needs:**

- `GET /api/inventory?status=...&...` — primary list
- `GET /api/tradeups/baskets?status=BUILDING` (optional, future)
  — for a "quick add to basket" affordance. Deferred unless cheap.

**`+page.server.ts` load shape:**

```ts
export interface InventoryLoad {
  page: PaginatedResponse<InventoryItemDTO>;
  filter: InventoryFilter;
}
export const load: PageServerLoad = async ({ url, fetch }) => { /* TODO */ };
```

**Form actions:**

```ts
export const actions: Actions = {
  // POST /api/inventory
  create: async ({ request, fetch }) => { /* TODO */ },

  // PATCH /api/inventory/[id] { status?, currentEstValue?, notes? }
  update: async ({ request, fetch }) => { /* TODO */ },

  // DELETE /api/inventory/[id]
  delete: async ({ request, fetch }) => { /* TODO */ },
};
```

**Types the page declares:**

```ts
type InventoryRowVM = InventoryItemDTO & {
  ageDays: number;                   // now - purchaseDate
  unrealizedDelta: number | null;    // currentEstValue - purchasePrice
};
```

**Components:**

- `FilterBar` (status, rarity, exterior, `availableForBasket`, search)
- `DataTable` of `InventoryRow.svelte`
- `InventoryEditModal.svelte` — currentEstValue/status/notes
- `ManualAddInventoryModal.svelte` — full create form

**UI states:** standard loading/empty/error/success; delete uses
`ConfirmModal`.

**Known constraint:** `availableForBasket=true` on the HTTP filter
returns held, unreserved items but is **not plan-aware**. The basket
builder page (§3.5) is where plan-aware eligibility matters; see §5.

---

### 3.4 `/tradeups/plans`

**Purpose:** CRUD for plans and their nested rules/outcomes. The
highest-complexity form in the app.

**Data it needs:**

- `GET /api/tradeups/plans?...` — list
- On edit: `GET /api/tradeups/plans/[id]` — single plan with rules +
  outcomes. Fetched lazily when the editor modal opens, not in `load`.

**`+page.server.ts` load shape:**

```ts
export interface PlansLoad {
  page: PaginatedResponse<PlanDTO>; // plan summary list
  filter: PlanFilter;
}
export const load: PageServerLoad = async ({ url, fetch }) => { /* TODO */ };
```

**Form actions:**

```ts
export const actions: Actions = {
  // POST   /api/tradeups/plans       (full create with rules + outcomes)
  create: async ({ request, fetch }) => { /* TODO */ },
  // PATCH  /api/tradeups/plans/[id]  (metadata only — thresholds, isActive)
  updatePlan: async ({ request, fetch }) => { /* TODO */ },
  // DELETE /api/tradeups/plans/[id]
  deletePlan: async ({ request, fetch }) => { /* TODO */ },

  // POST   /api/tradeups/plans/[id]/rules
  addRule: async ({ request, fetch }) => { /* TODO */ },
  // PATCH  /api/tradeups/plans/rules/[ruleId]
  updateRule: async ({ request, fetch }) => { /* TODO */ },
  // DELETE /api/tradeups/plans/rules/[ruleId]
  deleteRule: async ({ request, fetch }) => { /* TODO */ },

  // POST   /api/tradeups/plans/[id]/outcomes
  addOutcome: async ({ request, fetch }) => { /* TODO */ },
  // PATCH  /api/tradeups/plans/outcomes/[outcomeId]
  updateOutcome: async ({ request, fetch }) => { /* TODO */ },
  // DELETE /api/tradeups/plans/outcomes/[outcomeId]
  deleteOutcome: async ({ request, fetch }) => { /* TODO */ },
};
```

**Types:**

```ts
// Editor uses the Zod-inferred input types directly so validation
// stays aligned with the API boundary.
import type { CreatePlanInput, UpdatePlanInput } from '$lib/types/domain';

type PlanCardVM = {
  plan: PlanDTO;
  ruleCount: number;
  outcomeCount: number;
  totalProbabilityWeight: number;     // sanity-check sum
  isCompositionValid: boolean;        // weight sum > 0 && rules cover 10 slots
};
```

**Components:**

- `FilterBar` (isActive, inputRarity, targetRarity, search)
- Grid of `PlanCard.svelte`
- `PlanEditorModal.svelte` — wraps `RuleEditor` and `OutcomeEditor` in
  tabs. Handles both create (one big POST) and edit (metadata PATCH +
  rule/outcome sub-actions).
- `RuleEditor.svelte` — repeater of planRuleSchema inputs
- `OutcomeEditor.svelte` — repeater of outcomeItemSchema inputs

**UI states:**

- loading/empty/error: standard.
- confirmation: `ConfirmModal` on delete. Extra warning for plans
  that have existing baskets or executions — **API returns 409 if
  delete is blocked** (planService currently guards this). Render the
  409 message inline.
- success: after create, close modal and re-invalidate list.

**Validation UX:** the plan create form echoes Zod issues from the
response's `issues[]` onto the offending field. Key server refinements
to surface cleanly:

- `targetRarity must be exactly one tier above inputRarity`
- per-rule `minFloat must be <= maxFloat`

---

### 3.5 `/tradeups/baskets`

**Purpose:** Compose 10-item baskets from inventory against a plan;
mark READY; cancel.

**Data it needs:**

- `GET /api/tradeups/baskets?...` — list
- On builder open:
  - `GET /api/tradeups/baskets/[id]` — single basket with items
  - **Plan-aware eligible inventory** — see §5 (missing endpoint)

**`+page.server.ts` load shape:**

```ts
export interface BasketsLoad {
  page: PaginatedResponse<BasketDTO>;
  filter: BasketFilter;
  activePlans: PlanDTO[]; // needed for the "new basket" picker
}
export const load: PageServerLoad = async ({ url, fetch }) => { /* TODO */ };
```

**Form actions:**

```ts
export const actions: Actions = {
  // POST /api/tradeups/baskets { planId, name?, notes? }
  create: async ({ request, fetch }) => { /* TODO */ },
  // PATCH /api/tradeups/baskets/[id]
  updateMeta: async ({ request, fetch }) => { /* TODO */ },
  // DELETE /api/tradeups/baskets/[id]
  delete: async ({ request, fetch }) => { /* TODO */ },

  // POST /api/tradeups/baskets/[id]/items { inventoryItemId, slotIndex }
  addItem: async ({ request, fetch }) => { /* TODO */ },
  // DELETE /api/tradeups/baskets/[id]/items/[inventoryItemId]
  removeItem: async ({ request, fetch }) => { /* TODO */ },
  // PATCH /api/tradeups/baskets/[id]/items/reorder
  reorder: async ({ request, fetch }) => { /* TODO */ },

  // POST /api/tradeups/baskets/[id]/ready
  markReady: async ({ request, fetch }) => { /* TODO */ },
  // POST /api/tradeups/baskets/[id]/cancel
  cancel: async ({ request, fetch }) => { /* TODO */ },
};
```

**Types:**

```ts
type BasketCardVM = {
  basket: BasketDTO;
  planName: string;                   // resolved via activePlans
  slotsFilled: number;                // === basket.itemCount
  readinessLabel: 'BUILDING' | 'READY' | 'EXECUTED' | 'CANCELLED';
  profitBadge: 'GOOD' | 'NEUTRAL' | 'BAD' | 'UNKNOWN';
};
```

**Components:**

- `FilterBar` (status, planId)
- Grid of `BasketCard.svelte`
- `BasketBuilderModal.svelte` — opens a 10-slot grid
  (`BasketSlotGrid.svelte`) on the left and the eligible-inventory
  panel (`EligibleInventoryList.svelte`) on the right. Click-to-add
  into the next empty slot; click-slot-to-remove. Reorder deferred
  (POST reorder endpoint exists but drag-drop adds meaningful scope).
- `ConfirmModal` for cancel and delete.

**UI states:**

- loading/empty/error/success: standard.
- confirmation:
  - cancel basket → ConfirmModal, warn that reserved inventory will
    be released.
  - mark READY → no confirmation if server returns 200; show 409
    message inline if not ready (e.g. fewer than 10 slots filled,
    rarity mismatch, etc.) — `BasketReadinessIssue[]` is already
    returned by the evaluation API but the `ready` endpoint may
    surface the same reasons via 409 message text. See §5.

---

### 3.6 `/tradeups/executions`

**Purpose:** Record contract results, later record the sale, and show
history.

**Data it needs:**

- `GET /api/tradeups/executions?...` — list
- `GET /api/tradeups/baskets?status=READY` — dropdown source for the
  "record new execution" modal. Loaded once on page.

**`+page.server.ts` load shape:**

```ts
export interface ExecutionsLoad {
  page: PaginatedResponse<ExecutionDTO>;
  filter: ExecutionFilter;
  readyBaskets: BasketDTO[];          // for new-execution modal
}
export const load: PageServerLoad = async ({ url, fetch }) => { /* TODO */ };
```

**Form actions:**

```ts
export const actions: Actions = {
  // POST /api/tradeups/executions { basketId, executedAt, notes? }
  create: async ({ request, fetch }) => { /* TODO */ },

  // PATCH /api/tradeups/executions/[id]/result { resultMarketHashName, ... }
  recordResult: async ({ request, fetch }) => { /* TODO */ },

  // PATCH /api/tradeups/executions/[id]/sale { salePrice, saleFees?, saleDate }
  recordSale: async ({ request, fetch }) => { /* TODO */ },
};
```

**Types:**

```ts
type ExecutionRowVM = ExecutionDTO & {
  stage: 'PENDING_RESULT' | 'PENDING_SALE' | 'COMPLETE';
  // derived from presence of resultMarketHashName + salePrice
  expectedVsRealizedDelta: number | null;
};
```

**Components:**

- `FilterBar` (planId, hasResult, hasSale)
- `DataTable` of `ExecutionRow.svelte`
- `NewExecutionModal.svelte` — READY-basket picker + executedAt
- `RecordResultModal.svelte`
- `RecordSaleModal.svelte`

**UI states:**

- loading/empty/error: standard. Empty = "No executions yet. Mark a
  basket READY and record it here."
- success: after any recording action, re-invalidate list; stay on
  page.
- confirmation: no destructive actions on this page (executions are
  append-only; deletion is not exposed in Phase 4).

---

## 4. Error / Loading Strategy (Cross-Cutting)

- Add `src/routes/+error.svelte` with a minimal layout that reads
  `$page.status` and `$page.error` and renders 404/500 distinctly. All
  page loads let SvelteKit `error(status, msg)` bubble; `ApiError` is
  translated to `error(err.status, err.message)` in page load catches.
- Actions return `fail(status, { error, issues?, values? })` on Zod or
  API errors so forms can echo field-level messages.
- No global toast system in this phase. Banners only.

---

## 5. Unresolved API Gaps & Risky Assumptions

The UI plan above exposes the following gaps. None block scaffolding;
each is flagged where it surfaces.

### Gaps that likely require a new endpoint

1. **Plan-aware inventory eligibility** — PROGRESS §"Still
   unresolved" already tracks this. The basket builder (§3.5) wants
   `GET /api/inventory/eligible?planId=...` returning
   `InventoryItemDTO[]` sourced from
   `inventoryService.listAvailableForBasket`. Workaround for Phase 4
   only: client-side filter `GET /api/inventory?availableForBasket=true`
   by `plan.inputRarity` + rule collections. Acceptable for MVP; flag
   to migrate.

2. **Analytics summary DTO** — `GET /api/analytics/summary` is used
   by the dashboard but `AnalyticsSummaryDTO` is not in
   `$lib/types/services.ts` (only `PlanPerformanceRow`,
   `ActivityEntry`, and `EvRealizedPoint` are). Need to confirm the
   route's current response shape (`src/lib/server/analytics/
   analyticsService.ts`) and either export a DTO or have the UI pin
   its own local interface. **Risky assumption:** the dashboard plan
   assumes a `summary` object exists; confirm before wiring.

3. **`BasketReadinessIssue[]` from the `ready` endpoint** — the
   evaluation route can return structured issues, but the "mark
   ready" endpoint likely reports 409 with a plain message. If the UI
   is to highlight specific slots or rules, the endpoint should
   return the issues array. Workaround: call
   `POST /api/tradeups/evaluate { kind: 'basket', id }` before
   `ready` to preview issues, then disable the button. Acceptable for
   Phase 4.

### Assumptions worth double-checking before build

- **Activity entry types.** Dashboard groups activity by
  `ActivityEntry.kind` (6 variants per `src/lib/types/services.ts`);
  the UI will use those labels verbatim.
- **Staleness derivation.** `CandidateDTO.staleness` is computed
  server-side. The UI treats it as authoritative and will not
  recompute.
- **Decimal → number.** Services already convert; UI never sees
  `Decimal`. Formatting is a pure number formatter. Verified by
  `src/lib/server/utils/decimal.ts`.
- **`CandidateDecisionStatus: BOUGHT` transition.** The UI assumes
  `POST /api/candidates/[id]/buy` flips the candidate's status AND
  creates an `InventoryItem`. Confirmed by PROGRESS §"Phase 2" +
  `inventoryService.convertCandidate`.
- **Reorder endpoint in-scope.** Phase 4 will ship basket add/remove
  only; reorder action lives behind a flag-free but hidden control
  and ships later. Keeps the builder simple.
- **Chart rendering deferred.** ECharts is explicitly not installed.
  Dashboard expected-vs-realized renders as a table. Do not install
  chart deps in this phase.
- **No auth in the UI.** Shared-secret auth exists only on the
  extension endpoint. All `/api/**` UI calls are same-origin and
  unauth'd, matching the local-first single-operator assumption.

### Assumptions that could bite later

- Large inventory lists in the basket builder may need server-side
  pagination/search rather than the proposed single fetch. Start
  with a cap (`limit=200`) and revisit if the local dataset grows.
- Plan editor "one big POST" on create vs "create plan then add
  rules/outcomes sequentially" — the former matches the existing
  `createPlanSchema` shape; the latter is needed on edit. Editor
  must distinguish new-basket and editing modes cleanly. Propose:
  new plan = single POST to `/api/tradeups/plans`; edits use the
  sub-resource endpoints only.
- Form actions rely on `use:enhance` for UX; server-side still needs
  to handle no-JS fallback. Plan for both since SvelteKit supports
  it for free, but no extra work needed.

---

## 6. Implementation Order (Suggested)

The order mirrors the dependency chain: shared helpers first, then
read-heavy pages, then the composition-heavy ones.

1. Shared client + components: `api.ts`, `DataTable`, `FilterBar`,
   `PaginationControl`, `StatusBadge`, formatters, `ConfirmModal`,
   `+error.svelte`.
2. `/candidates` — highest-traffic workflow; proves the action +
   action-error UX end-to-end.
3. `/inventory` — similar shape, simpler.
4. `/tradeups/plans` — biggest form; builds on action patterns.
5. `/tradeups/baskets` — depends on inventory and plans working.
6. `/tradeups/executions` — depends on READY baskets existing.
7. `/dashboard` — last, because its data is most meaningful once the
   other pages have been used.

Each page lands with its own `+page.server.ts`, local components,
and a short PROGRESS.md update ticking its Phase 4 checkbox.

---

## 7. Out-of-Scope for Phase 4

- Real chart rendering (ECharts install + components).
- Drag-drop basket slot reorder.
- Bulk candidate actions (multi-select pass/buy).
- Notifications or toast system.
- Typed service errors migration (tracked separately in PROGRESS).
- New API endpoints beyond the plan-aware eligibility route in §5.1,
  which can be deferred with the documented workaround.



## Potential Issues
 API gaps (§5) — three worth your attention before building:
    a. Plan-aware inventory eligibility endpoint (already tracked in PROGRESS; documented workaround for Phase 4).
    b. AnalyticsSummaryDTO not exported from $lib/types/services.ts — confirm the /api/analytics/summary shape before wiring the dashboard.
    c. BasketReadinessIssue[] is not returned from the ready endpoint; builder calls /api/tradeups/evaluate first as a preview.
