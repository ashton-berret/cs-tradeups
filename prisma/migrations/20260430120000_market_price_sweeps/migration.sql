CREATE TABLE "MarketPriceSweep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "trigger" TEXT NOT NULL,
    "watchlistCount" INTEGER NOT NULL DEFAULT 0,
    "requested" INTEGER NOT NULL DEFAULT 0,
    "written" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "candidatesReevaluated" INTEGER NOT NULL DEFAULT 0,
    "basketsRecomputed" INTEGER NOT NULL DEFAULT 0,
    "errorsJson" JSONB,
    "notes" TEXT
);

CREATE INDEX "MarketPriceSweep_startedAt_idx"
  ON "MarketPriceSweep"("startedAt");

CREATE INDEX "MarketPriceSweep_trigger_startedAt_idx"
  ON "MarketPriceSweep"("trigger", "startedAt");
