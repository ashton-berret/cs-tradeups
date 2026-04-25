CREATE TABLE "MarketPriceObservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "marketHashName" TEXT NOT NULL,
    "catalogSkinId" TEXT,
    "catalogCollectionId" TEXT,
    "catalogWeaponDefIndex" INTEGER,
    "catalogPaintIndex" INTEGER,
    "exterior" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "lowestSellPrice" DECIMAL,
    "medianSellPrice" DECIMAL,
    "volume" INTEGER,
    "source" TEXT NOT NULL,
    "observedAt" DATETIME NOT NULL,
    "rawPayload" JSONB
);

CREATE INDEX "MarketPriceObservation_marketHashName_currency_observedAt_idx"
  ON "MarketPriceObservation"("marketHashName", "currency", "observedAt");

CREATE INDEX "MarketPriceObservation_catalogSkinId_exterior_currency_observedAt_idx"
  ON "MarketPriceObservation"("catalogSkinId", "exterior", "currency", "observedAt");

CREATE INDEX "MarketPriceObservation_catalogCollectionId_exterior_currency_observedAt_idx"
  ON "MarketPriceObservation"("catalogCollectionId", "exterior", "currency", "observedAt");

CREATE INDEX "MarketPriceObservation_source_observedAt_idx"
  ON "MarketPriceObservation"("source", "observedAt");
