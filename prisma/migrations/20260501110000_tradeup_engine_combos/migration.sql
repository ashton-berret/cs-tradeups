CREATE TABLE "TradeupComboBase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inputRarity" TEXT NOT NULL,
    "statTrak" BOOLEAN NOT NULL,
    "partition" JSONB NOT NULL,
    "partitionHash" TEXT NOT NULL,
    "collections" JSONB NOT NULL,
    "outputDistribution" JSONB NOT NULL,
    "hasSingleOutputCollection" BOOLEAN NOT NULL,
    "crossCollection" BOOLEAN NOT NULL,
    "catalogVersion" TEXT NOT NULL
);

CREATE TABLE "TradeupCombo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "baseId" TEXT NOT NULL,
    "wearRegimeIndex" INTEGER NOT NULL,
    "targetAvgWearProp" REAL NOT NULL,
    "wearIntervalLow" REAL NOT NULL,
    "wearIntervalHigh" REAL NOT NULL,
    "outputProjection" JSONB NOT NULL,
    "catalogVersion" TEXT NOT NULL,
    CONSTRAINT "TradeupCombo_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES "TradeupComboBase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TradeupComboBase_inputRarity_statTrak_partitionHash_catalogVersion_key"
  ON "TradeupComboBase"("inputRarity", "statTrak", "partitionHash", "catalogVersion");

CREATE INDEX "TradeupComboBase_inputRarity_statTrak_catalogVersion_idx"
  ON "TradeupComboBase"("inputRarity", "statTrak", "catalogVersion");

CREATE INDEX "TradeupComboBase_catalogVersion_idx"
  ON "TradeupComboBase"("catalogVersion");

CREATE UNIQUE INDEX "TradeupCombo_baseId_wearRegimeIndex_key"
  ON "TradeupCombo"("baseId", "wearRegimeIndex");

CREATE INDEX "TradeupCombo_catalogVersion_idx"
  ON "TradeupCombo"("catalogVersion");

CREATE INDEX "TradeupCombo_baseId_idx"
  ON "TradeupCombo"("baseId");
