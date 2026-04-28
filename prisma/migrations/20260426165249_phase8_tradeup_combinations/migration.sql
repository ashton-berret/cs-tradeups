-- CreateTable
CREATE TABLE "TradeupCombination" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "mode" TEXT NOT NULL,
    "sourcePlanId" TEXT,
    "inputRarity" TEXT NOT NULL,
    "targetRarity" TEXT NOT NULL,
    "thesisTotalCost" DECIMAL NOT NULL,
    "thesisTotalEV" DECIMAL NOT NULL,
    "thesisExpectedProfit" DECIMAL NOT NULL,
    "thesisExpectedProfitPct" REAL NOT NULL,
    "thesisAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "thesisPlanSnapshot" JSONB NOT NULL,
    CONSTRAINT "TradeupCombination_sourcePlanId_fkey" FOREIGN KEY ("sourcePlanId") REFERENCES "TradeupPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TradeupCombinationInput" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "combinationId" TEXT NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "collection" TEXT NOT NULL,
    "catalogSkinId" TEXT,
    "catalogCollectionId" TEXT,
    "weaponName" TEXT,
    "skinName" TEXT,
    "floatValue" REAL,
    "price" DECIMAL NOT NULL,
    CONSTRAINT "TradeupCombinationInput_combinationId_fkey" FOREIGN KEY ("combinationId") REFERENCES "TradeupCombination" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TradeupCombinationSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "combinationId" TEXT NOT NULL,
    "observedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalCost" DECIMAL NOT NULL,
    "totalEV" DECIMAL NOT NULL,
    "expectedProfit" DECIMAL NOT NULL,
    "expectedProfitPct" REAL NOT NULL,
    "evBreakdown" JSONB,
    CONSTRAINT "TradeupCombinationSnapshot_combinationId_fkey" FOREIGN KEY ("combinationId") REFERENCES "TradeupCombination" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TradeupCombination_isActive_createdAt_idx" ON "TradeupCombination"("isActive", "createdAt");

-- CreateIndex
CREATE INDEX "TradeupCombination_sourcePlanId_idx" ON "TradeupCombination"("sourcePlanId");

-- CreateIndex
CREATE INDEX "TradeupCombinationInput_combinationId_idx" ON "TradeupCombinationInput"("combinationId");

-- CreateIndex
CREATE INDEX "TradeupCombinationInput_catalogSkinId_idx" ON "TradeupCombinationInput"("catalogSkinId");

-- CreateIndex
CREATE INDEX "TradeupCombinationInput_catalogCollectionId_idx" ON "TradeupCombinationInput"("catalogCollectionId");

-- CreateIndex
CREATE UNIQUE INDEX "TradeupCombinationInput_combinationId_slotIndex_key" ON "TradeupCombinationInput"("combinationId", "slotIndex");

-- CreateIndex
CREATE INDEX "TradeupCombinationSnapshot_combinationId_observedAt_idx" ON "TradeupCombinationSnapshot"("combinationId", "observedAt");
