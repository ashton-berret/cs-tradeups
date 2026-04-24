-- Catalog identity linkage for dynamic rows.
--
-- Why these columns exist:
--   CandidateListing / InventoryItem need a stable join boundary into the
--   static CS2 catalog snapshot so matching does not depend on repeated
--   string parsing at read time.
--
-- Added as nullable because legacy rows and unmatched manual rows must
-- continue to work.

ALTER TABLE "CandidateListing" ADD COLUMN "catalogSkinId" TEXT;
ALTER TABLE "CandidateListing" ADD COLUMN "catalogCollectionId" TEXT;
ALTER TABLE "CandidateListing" ADD COLUMN "catalogWeaponDefIndex" INTEGER;
ALTER TABLE "CandidateListing" ADD COLUMN "catalogPaintIndex" INTEGER;

ALTER TABLE "InventoryItem" ADD COLUMN "catalogSkinId" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN "catalogCollectionId" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN "catalogWeaponDefIndex" INTEGER;
ALTER TABLE "InventoryItem" ADD COLUMN "catalogPaintIndex" INTEGER;

CREATE INDEX "CandidateListing_catalogCollectionId_rarity_idx"
  ON "CandidateListing"("catalogCollectionId", "rarity");
CREATE INDEX "CandidateListing_catalogSkinId_idx"
  ON "CandidateListing"("catalogSkinId");
CREATE INDEX "CandidateListing_catalogWeaponDefIndex_catalogPaintIndex_idx"
  ON "CandidateListing"("catalogWeaponDefIndex", "catalogPaintIndex");

CREATE INDEX "InventoryItem_catalogCollectionId_rarity_idx"
  ON "InventoryItem"("catalogCollectionId", "rarity");
CREATE INDEX "InventoryItem_catalogSkinId_idx"
  ON "InventoryItem"("catalogSkinId");
CREATE INDEX "InventoryItem_catalogWeaponDefIndex_catalogPaintIndex_idx"
  ON "InventoryItem"("catalogWeaponDefIndex", "catalogPaintIndex");
