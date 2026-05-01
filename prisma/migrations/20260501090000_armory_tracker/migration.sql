CREATE TABLE "ArmoryPass" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "purchasedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalCost" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "stars" INTEGER NOT NULL DEFAULT 40,
    "notes" TEXT
);

CREATE TABLE "ArmoryReward" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "inventoryItemId" TEXT,
    "marketHashName" TEXT NOT NULL,
    "weaponName" TEXT,
    "skinName" TEXT,
    "collection" TEXT,
    "catalogSkinId" TEXT,
    "catalogCollectionId" TEXT,
    "catalogWeaponDefIndex" INTEGER,
    "catalogPaintIndex" INTEGER,
    "rarity" TEXT,
    "exterior" TEXT,
    "floatValue" REAL,
    "pattern" INTEGER,
    "inspectLink" TEXT,
    "starsSpent" INTEGER NOT NULL,
    "costPerStar" DECIMAL NOT NULL,
    "costBasis" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estimatedValue" DECIMAL,
    "valueObservedAt" DATETIME,
    "salePrice" DECIMAL,
    "saleFees" DECIMAL,
    "soldAt" DATETIME,
    "realizedProfit" DECIMAL,
    "realizedProfitPct" REAL,
    "notes" TEXT,
    CONSTRAINT "ArmoryReward_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ArmoryExpectedOdds" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "updatedAt" DATETIME NOT NULL,
    "rarity" TEXT NOT NULL,
    "expectedPct" REAL NOT NULL
);

CREATE UNIQUE INDEX "ArmoryReward_inventoryItemId_key" ON "ArmoryReward"("inventoryItemId");
CREATE INDEX "ArmoryPass_purchasedAt_idx" ON "ArmoryPass"("purchasedAt");
CREATE INDEX "ArmoryReward_receivedAt_idx" ON "ArmoryReward"("receivedAt");
CREATE INDEX "ArmoryReward_rarity_idx" ON "ArmoryReward"("rarity");
CREATE INDEX "ArmoryReward_collection_idx" ON "ArmoryReward"("collection");
CREATE INDEX "ArmoryReward_catalogCollectionId_rarity_idx" ON "ArmoryReward"("catalogCollectionId", "rarity");
CREATE INDEX "ArmoryReward_catalogSkinId_idx" ON "ArmoryReward"("catalogSkinId");
CREATE INDEX "ArmoryReward_marketHashName_idx" ON "ArmoryReward"("marketHashName");
CREATE UNIQUE INDEX "ArmoryExpectedOdds_rarity_key" ON "ArmoryExpectedOdds"("rarity");
