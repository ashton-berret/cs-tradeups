-- Phase 5 schema additions.
--
-- Columns added (all non-destructive; NULL or explicit default):
--   CandidateListing.mergeCount             — distinct price-refresh count (Workstream A)
--   CandidateListing.evaluationRefreshedAt  — stamp set by evaluateCandidate (Workstream B)
--   CandidateListing.pinnedByUser           — honors user-chosen status across re-eval (Workstream C)
--   TradeupPlan.minCompositeScore           — per-plan quality*liquidity floor (Workstream C)

ALTER TABLE "CandidateListing" ADD COLUMN "mergeCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CandidateListing" ADD COLUMN "evaluationRefreshedAt" DATETIME;
ALTER TABLE "CandidateListing" ADD COLUMN "pinnedByUser" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TradeupPlan" ADD COLUMN "minCompositeScore" REAL;
