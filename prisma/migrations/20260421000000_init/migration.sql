-- CreateTable
CREATE TABLE "CandidateListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "marketHashName" TEXT NOT NULL,
    "weaponName" TEXT,
    "skinName" TEXT,
    "collection" TEXT,
    "rarity" TEXT,
    "exterior" TEXT,
    "floatValue" REAL,
    "pattern" INTEGER,
    "inspectLink" TEXT,
    "listPrice" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "listingUrl" TEXT,
    "listingId" TEXT,
    "source" TEXT NOT NULL,
    "rawPayload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'WATCHING',
    "qualityScore" REAL,
    "liquidityScore" REAL,
    "expectedProfit" DECIMAL,
    "expectedProfitPct" REAL,
    "maxBuyPrice" DECIMAL,
    "matchedPlanId" TEXT,
    "marginalBasketValue" DECIMAL,
    "timesSeen" INTEGER NOT NULL DEFAULT 1,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    CONSTRAINT "CandidateListing_matchedPlanId_fkey" FOREIGN KEY ("matchedPlanId") REFERENCES "TradeupPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "marketHashName" TEXT NOT NULL,
    "weaponName" TEXT,
    "skinName" TEXT,
    "collection" TEXT,
    "rarity" TEXT,
    "exterior" TEXT,
    "floatValue" REAL,
    "pattern" INTEGER,
    "inspectLink" TEXT,
    "purchasePrice" DECIMAL NOT NULL,
    "purchaseCurrency" TEXT NOT NULL DEFAULT 'USD',
    "purchaseFees" DECIMAL,
    "purchaseDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'HELD',
    "currentEstValue" DECIMAL,
    "notes" TEXT,
    "candidateId" TEXT,
    CONSTRAINT "InventoryItem_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CandidateListing" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TradeupPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "inputRarity" TEXT NOT NULL,
    "targetRarity" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "minProfitThreshold" DECIMAL,
    "minProfitPctThreshold" REAL,
    "minLiquidityScore" REAL,
    "notes" TEXT
);

-- CreateTable
CREATE TABLE "TradeupPlanRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "planId" TEXT NOT NULL,
    "collection" TEXT,
    "rarity" TEXT,
    "exterior" TEXT,
    "minFloat" REAL,
    "maxFloat" REAL,
    "maxBuyPrice" DECIMAL,
    "minQuantity" INTEGER,
    "maxQuantity" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isPreferred" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "TradeupPlanRule_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TradeupPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TradeupOutcomeItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "planId" TEXT NOT NULL,
    "marketHashName" TEXT NOT NULL,
    "weaponName" TEXT,
    "skinName" TEXT,
    "collection" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "estimatedMarketValue" DECIMAL NOT NULL,
    "probabilityWeight" REAL NOT NULL DEFAULT 1.0,
    CONSTRAINT "TradeupOutcomeItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TradeupPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TradeupBasket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "planId" TEXT NOT NULL,
    "name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'BUILDING',
    "totalCost" DECIMAL,
    "expectedEV" DECIMAL,
    "expectedProfit" DECIMAL,
    "expectedProfitPct" REAL,
    "averageFloat" REAL,
    "notes" TEXT,
    CONSTRAINT "TradeupBasket_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TradeupPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TradeupBasketItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "basketId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TradeupBasketItem_basketId_fkey" FOREIGN KEY ("basketId") REFERENCES "TradeupBasket" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TradeupBasketItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TradeupExecution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "basketId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "executedAt" DATETIME NOT NULL,
    "inputCost" DECIMAL NOT NULL,
    "expectedEV" DECIMAL,
    "resultMarketHashName" TEXT,
    "resultWeaponName" TEXT,
    "resultSkinName" TEXT,
    "resultCollection" TEXT,
    "resultExterior" TEXT,
    "resultFloatValue" REAL,
    "estimatedResultValue" DECIMAL,
    "salePrice" DECIMAL,
    "saleFees" DECIMAL,
    "saleDate" DATETIME,
    "realizedProfit" DECIMAL,
    "realizedProfitPct" REAL,
    "notes" TEXT,
    CONSTRAINT "TradeupExecution_basketId_fkey" FOREIGN KEY ("basketId") REFERENCES "TradeupBasket" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TradeupExecution_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TradeupPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CandidateListing_marketHashName_floatValue_idx" ON "CandidateListing"("marketHashName", "floatValue");

-- CreateIndex
CREATE INDEX "CandidateListing_status_idx" ON "CandidateListing"("status");

-- CreateIndex
CREATE INDEX "CandidateListing_matchedPlanId_idx" ON "CandidateListing"("matchedPlanId");

-- CreateIndex
CREATE INDEX "CandidateListing_createdAt_idx" ON "CandidateListing"("createdAt");

-- CreateIndex
CREATE INDEX "CandidateListing_collection_idx" ON "CandidateListing"("collection");

-- CreateIndex
CREATE INDEX "CandidateListing_rarity_idx" ON "CandidateListing"("rarity");

-- CreateIndex
CREATE INDEX "InventoryItem_status_idx" ON "InventoryItem"("status");

-- CreateIndex
CREATE INDEX "InventoryItem_collection_rarity_idx" ON "InventoryItem"("collection", "rarity");

-- CreateIndex
CREATE INDEX "InventoryItem_candidateId_idx" ON "InventoryItem"("candidateId");

-- CreateIndex
CREATE INDEX "InventoryItem_marketHashName_idx" ON "InventoryItem"("marketHashName");

-- CreateIndex
CREATE INDEX "TradeupPlanRule_planId_idx" ON "TradeupPlanRule"("planId");

-- CreateIndex
CREATE INDEX "TradeupPlanRule_collection_rarity_idx" ON "TradeupPlanRule"("collection", "rarity");

-- CreateIndex
CREATE INDEX "TradeupOutcomeItem_planId_idx" ON "TradeupOutcomeItem"("planId");

-- CreateIndex
CREATE INDEX "TradeupBasket_planId_idx" ON "TradeupBasket"("planId");

-- CreateIndex
CREATE INDEX "TradeupBasket_status_idx" ON "TradeupBasket"("status");

-- CreateIndex
CREATE INDEX "TradeupBasketItem_basketId_idx" ON "TradeupBasketItem"("basketId");

-- CreateIndex
CREATE INDEX "TradeupBasketItem_inventoryItemId_idx" ON "TradeupBasketItem"("inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "TradeupBasketItem_basketId_inventoryItemId_key" ON "TradeupBasketItem"("basketId", "inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "TradeupBasketItem_basketId_slotIndex_key" ON "TradeupBasketItem"("basketId", "slotIndex");

-- CreateIndex
CREATE UNIQUE INDEX "TradeupExecution_basketId_key" ON "TradeupExecution"("basketId");

-- CreateIndex
CREATE INDEX "TradeupExecution_planId_idx" ON "TradeupExecution"("planId");

-- CreateIndex
CREATE INDEX "TradeupExecution_executedAt_idx" ON "TradeupExecution"("executedAt");
