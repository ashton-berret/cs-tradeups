-- CreateTable
CREATE TABLE "TradeupThesis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "comboId" TEXT NOT NULL,
    "baseId" TEXT NOT NULL,
    "inputRarity" TEXT NOT NULL,
    "statTrak" BOOLEAN NOT NULL,
    "partition" JSONB NOT NULL,
    "collections" JSONB NOT NULL,
    "wearRegimeIndex" INTEGER NOT NULL,
    "targetAvgWearProp" REAL NOT NULL,
    "inputCostP50" DECIMAL NOT NULL,
    "outputValueGrossP50" DECIMAL NOT NULL,
    "outputValueNetP50" DECIMAL NOT NULL,
    "evMedian" DECIMAL NOT NULL,
    "profitChance" REAL NOT NULL,
    "score" REAL NOT NULL,
    "missingOutputPrices" INTEGER NOT NULL DEFAULT 0,
    "missingInputPrices" INTEGER NOT NULL DEFAULT 0,
    "totalOutputSkins" INTEGER NOT NULL,
    "totalInputSlots" INTEGER NOT NULL DEFAULT 10,
    "inputResolution" JSONB NOT NULL,
    "outputResolution" JSONB NOT NULL,
    "scoreVersion" TEXT NOT NULL,
    "catalogVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    CONSTRAINT "TradeupThesis_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "TradeupCombo" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TradeupThesis_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES "TradeupComboBase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TradeupThesis_score_status_idx" ON "TradeupThesis"("score", "status");

-- CreateIndex
CREATE INDEX "TradeupThesis_inputRarity_statTrak_status_idx" ON "TradeupThesis"("inputRarity", "statTrak", "status");

-- CreateIndex
CREATE INDEX "TradeupThesis_status_score_idx" ON "TradeupThesis"("status", "score");

-- CreateIndex
CREATE INDEX "TradeupThesis_baseId_idx" ON "TradeupThesis"("baseId");

-- CreateIndex
CREATE UNIQUE INDEX "TradeupThesis_comboId_scoreVersion_key" ON "TradeupThesis"("comboId", "scoreVersion");
