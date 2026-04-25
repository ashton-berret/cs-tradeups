# API layer

This directory contains the SvelteKit `+server.ts` route handlers that
expose the Phase 2 service layer over HTTP. Routes are thin: parse the
request, call a service function, return the DTO. Business logic lives in
`$lib/server/**`, not here.

## Conventions

### Validation

Every request body is parsed with a Zod schema from `$lib/schemas/**`
before it reaches a service. Query strings on list endpoints are coerced
via `coerceSearchParams` (`$lib/server/http/query.ts`) and then parsed
with the matching `*FilterSchema`.

### Response shapes

Response bodies mirror the service DTOs in `$lib/types/services` exactly.
No reshaping in the route. List endpoints use the
`PaginatedResponse<T>` envelope that the service already returns; single-
entity reads/writes return the raw DTO.

### Status codes

| Code | When                                                         |
| ---- | ------------------------------------------------------------ |
| 200  | Successful GET or PATCH                                      |
| 201  | Successful POST that creates a new resource                  |
| 204  | Successful DELETE (no body)                                  |
| 400  | Zod validation failure (`ValidationError` + `issues` list)   |
| 401  | Missing or bad shared-secret header (`UnauthorizedError`)    |
| 404  | Service reports an entity does not exist (`NotFoundError`)   |
| 409  | Service invariant / state-machine failure (`ConflictError`)  |
| 503  | Shared-secret env var not configured                         |
| 500  | Any other thrown Error                                       |

### Error translation

All handlers wrap their body in `try { ... } catch (err) { return toErrorResponse(err); }`.
`toErrorResponse` (in `$lib/server/http/errors.ts`) classifies as follows:

1. `ZodError` → 400 with the full `issues[]`.
2. Any `HttpError` subclass (`NotFoundError`, `ConflictError`,
   `UnauthorizedError`, `ServiceUnavailableError`, `ValidationError`) →
   the class's baked-in status.
3. Any other `Error` → substring-match on the message to pick 404 vs 409;
   anything unrecognized becomes 500.

The substring matcher is a Phase 3 pragmatic choice because Phase 2
services throw plain `Error`. The typed error classes are already in
place so a future pass can migrate the service layer to throw them
directly without any route changes.

Response body for every error:

```jsonc
{
  "error": "NotFoundError",        // class name
  "message": "Candidate not found: abc123", // optional
  "issues": [ /* Zod issue list, only on 400s from .parse() */ ]
}
```

## Shared-secret policy (extension endpoint)

`POST /api/extension/candidates` is the only route that is externally
reachable in a meaningful sense — the rest are single-user local calls
from the app itself. It is guarded by:

- Required header: `X-Extension-Secret`
- Required env var: `EXTENSION_SHARED_SECRET`

The guard (`$lib/server/http/extensionAuth.ts`) fails closed:

- Env var unset → `503 ServiceUnavailableError`
- Header missing or mismatched → `401 UnauthorizedError`

This is intentionally thin for the MVP (single operator, local host). It
is not a substitute for real auth; rotate the secret via `.env` and
don't check it into the repo.

## Route map

### Extension

- `POST /api/extension/candidates`

### Catalog

- `GET /api/catalog`
- `GET /api/catalog/summary`

### Market prices

- `POST /api/market-prices/import`
  - JSON body: `{ source, observations }`.
  - CSV body: `text/csv` with `source` query param and columns
    `marketHashName`, `currency`, `lowestSellPrice`, `medianSellPrice`,
    `volume`, and `observedAt`. Invalid CSV imports return per-row
    `rowErrors` and do not partially import valid rows.
  - Local JSON/CSV normalization lives in
    `src/lib/server/marketPrices/localImportAdapter.ts`; route handlers should
    stay transport-only as new sources are added.
  - Successful imports refresh open candidate evaluations and active basket
    metrics; the response includes `refresh` counts.
- `POST /api/market-prices/refresh`
  - Re-runs the same dependent EV refresh without importing observations.
  - Returns candidate and basket refresh counts plus basket refresh errors.
- `GET /api/market-prices/summary`
  - Returns source/currency groups for all observations matching
    `search`/`source`/`currency` and `latestOnly`, including counts,
    newest/oldest observation times, and freshness counts.
- `GET /api/market-prices/latest`
  - Without lookup params: paginated observation list filtered by `search`,
    `source`, and `currency`, with `sortBy` (`observedAt`, `marketValue`,
    `source`, `currency`), `sortDir`, and `latestOnly`.
  - With lookup params: latest single observation by `marketHashName`, or by
    `catalogSkinId` plus `exterior`.
  - Observation DTOs include `freshness` derived from `observedAt`.

### Exports

- `GET /api/exports/executions.csv`
- `GET /api/exports/expected-vs-realized.csv`

### Candidates

- `GET  /api/candidates`
- `POST /api/candidates`
- `GET    /api/candidates/[id]`
- `PATCH  /api/candidates/[id]`
- `DELETE /api/candidates/[id]`
- `POST /api/candidates/[id]/buy`
- `POST /api/candidates/[id]/reevaluate`
- `POST /api/candidates/reevaluate-open`
- `POST /api/candidates/refresh-stale`
- `POST /api/candidates/bulk/status`
- `POST /api/candidates/bulk/delete`
- `POST /api/candidates/bulk/reevaluate`

### Inventory

- `GET  /api/inventory`
- `GET  /api/inventory/eligible`
- `POST /api/inventory`
- `GET    /api/inventory/[id]`
- `PATCH  /api/inventory/[id]`
- `DELETE /api/inventory/[id]`

### Trade-up plans

- `GET  /api/tradeups/plans`
- `POST /api/tradeups/plans`
- `GET    /api/tradeups/plans/[id]`
- `PATCH  /api/tradeups/plans/[id]`
- `DELETE /api/tradeups/plans/[id]`
- `POST   /api/tradeups/plans/[id]/rules`
- `PATCH  /api/tradeups/plans/rules/[ruleId]`
- `DELETE /api/tradeups/plans/rules/[ruleId]`
- `POST   /api/tradeups/plans/[id]/outcomes`
- `PATCH  /api/tradeups/plans/outcomes/[outcomeId]`
- `DELETE /api/tradeups/plans/outcomes/[outcomeId]`

### Trade-up baskets

- `GET  /api/tradeups/baskets`
- `POST /api/tradeups/baskets`
- `GET    /api/tradeups/baskets/[id]`
- `PATCH  /api/tradeups/baskets/[id]`
- `DELETE /api/tradeups/baskets/[id]`
- `POST   /api/tradeups/baskets/[id]/items`
- `POST   /api/tradeups/baskets/[id]/items/bulk`
- `DELETE /api/tradeups/baskets/[id]/items/[inventoryItemId]`
- `PATCH  /api/tradeups/baskets/[id]/items/reorder`
- `POST   /api/tradeups/baskets/[id]/ready`
- `POST   /api/tradeups/baskets/[id]/cancel`

### Evaluation

- `POST /api/tradeups/evaluate`
  - Basket evaluations include per-outcome EV pricing metadata with
    `priceSource` (`OBSERVED_MARKET` or `PLAN_FALLBACK`) and the market hash
    used for the priced value. Observed market prices include
    `priceFreshness` and `priceObservedAt`.

### Executions

- `GET  /api/tradeups/executions`
- `POST /api/tradeups/executions`
- `GET   /api/tradeups/executions/[id]`
- `PATCH /api/tradeups/executions/[id]/result`
- `PATCH /api/tradeups/executions/[id]/sale`

### Analytics

- `GET /api/analytics/summary`
- `GET /api/analytics/plan-performance`
- `GET /api/analytics/activity`
- `GET /api/analytics/expected-vs-realized`
