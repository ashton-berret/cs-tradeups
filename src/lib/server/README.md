# Server layer

This directory holds everything that runs only on the server: the Prisma
singleton, domain services, the evaluation engine, and analytics. It is
the implementation home for Phase 2.

## Layout

```
server/
├─ db/
│  └─ client.ts                    # Prisma singleton (exports `db`)
├─ catalog/
│  ├─ catalogService.ts            # static CS2 catalog snapshot loader
│  └─ linkage.ts                   # candidate/inventory -> catalog matching
├─ utils/
│  ├─ decimal.ts                   # Prisma.Decimal <-> number boundary
│  ├─ money.ts                     # rounding + money arithmetic
│  └─ float.ts                     # exterior band + float range helpers
├─ candidates/
│  ├─ candidateService.ts          # lifecycle: ingest, evaluate, convert
│  ├─ duplicateDetection.ts        # merge policy + staleness classification
│  └─ normalization.ts             # extension payload -> internal shape
├─ inventory/
│  └─ inventoryService.ts          # cost-basis ledger + status machine
├─ tradeups/
│  ├─ planService.ts               # plans + rules + outcomes, re-eval fan-out
│  ├─ basketService.ts             # 10-slot assembly with eager metrics
│  ├─ executionService.ts          # atomic execute + result + sale
│  └─ evaluation/
│     ├─ ruleMatching.ts           # candidate <-> plan rule matching
│     ├─ expectedValue.ts          # CS2 collection-weighted EV
│     ├─ scoring.ts                # quality + liquidity (liquidity stubbed)
│     ├─ recommendation.ts         # profit + score -> decision status
│     └─ evaluationService.ts      # orchestrator + /api entrypoint
└─ analytics/
   └─ analyticsService.ts          # dashboard rollups (read-only)
```

## Contract rules

1. **Inputs are pre-validated.** Route handlers Zod-parse the payload and
   pass typed inputs (`CreateCandidateInput`, etc.) into services. Services
   enforce only what Zod cannot express: referential integrity, state-
   machine transitions, cross-row invariants.

2. **Outputs are DTOs with plain `number`.** Every service returns the
   shapes defined in `$lib/types/services`. `Prisma.Decimal` never leaves
   the server layer.

3. **Mutations are transactional when they span rows.** If a service
   touches more than one table (e.g., `markBought`, `addItem`,
   `createExecution`), wrap the work in `db.$transaction`.

4. **Eager metric recomputation.** Basket metrics are refreshed inside the
   same transaction as any add/remove/reorder. No lazy reads, no stale
   values surfaced to UI.

5. **Evaluation fan-out is caller-driven.** A service that mutates a plan
   is responsible for calling `reevaluateAllForPlan`. Individual evaluators
   never cascade.

6. **Preserve user intent.** `recommendation.deriveRecommendation`
   preserves user-applied PASSED/WATCHING unless the candidate no longer
   matches any plan.

## Open references

- Phase-2 open items and evaluation caveats are tracked in
  `docs/PROGRESS.md` → Open Questions. The notable ones for implementers:
  per-skin float ranges, liquidity data source, re-eval triggers on price
  age.
