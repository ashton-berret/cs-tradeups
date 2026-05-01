CREATE TABLE "new_ArmoryExpectedOdds" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "updatedAt" DATETIME NOT NULL,
    "collection" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "expectedPct" REAL NOT NULL
);

INSERT INTO "new_ArmoryExpectedOdds" ("id", "updatedAt", "collection", "rarity", "expectedPct")
SELECT "id", "updatedAt", 'Default', "rarity", "expectedPct"
FROM "ArmoryExpectedOdds";

DROP TABLE "ArmoryExpectedOdds";
ALTER TABLE "new_ArmoryExpectedOdds" RENAME TO "ArmoryExpectedOdds";

CREATE UNIQUE INDEX "ArmoryExpectedOdds_collection_rarity_key"
  ON "ArmoryExpectedOdds"("collection", "rarity");

CREATE INDEX "ArmoryExpectedOdds_collection_idx"
  ON "ArmoryExpectedOdds"("collection");
