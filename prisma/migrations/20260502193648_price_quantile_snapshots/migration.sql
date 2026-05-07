-- CreateTable
CREATE TABLE "PriceQuantileSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "catalogSkinId" TEXT NOT NULL,
    "marketHashName" TEXT NOT NULL,
    "exterior" TEXT NOT NULL,
    "statTrak" BOOLEAN NOT NULL,
    "windowDays" INTEGER NOT NULL,
    "observationCount" INTEGER NOT NULL,
    "effectiveSampleSize" REAL NOT NULL,
    "p10" DECIMAL NOT NULL,
    "p50" DECIMAL NOT NULL,
    "p90" DECIMAL NOT NULL,
    "mean" DECIMAL NOT NULL,
    "volatility" REAL NOT NULL,
    "recencyTau" INTEGER NOT NULL,
    "coldStart" BOOLEAN NOT NULL,
    "sourceFilter" JSONB,
    "computedAt" DATETIME NOT NULL,
    "isLatest" BOOLEAN NOT NULL
);

-- CreateIndex
CREATE INDEX "PriceQuantileSnapshot_catalogSkinId_exterior_statTrak_isLatest_idx" ON "PriceQuantileSnapshot"("catalogSkinId", "exterior", "statTrak", "isLatest");

-- CreateIndex
CREATE INDEX "PriceQuantileSnapshot_coldStart_isLatest_idx" ON "PriceQuantileSnapshot"("coldStart", "isLatest");

-- Partial unique index: only one "latest" row per (catalogSkinId, exterior, statTrak, windowDays)
CREATE UNIQUE INDEX "PriceQuantileSnapshot_latest_unique" ON "PriceQuantileSnapshot"("catalogSkinId", "exterior", "statTrak", "windowDays") WHERE "isLatest" = 1;
