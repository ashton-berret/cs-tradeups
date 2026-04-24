ALTER TABLE "TradeupPlanRule" ADD COLUMN "catalogCollectionId" TEXT;

ALTER TABLE "TradeupOutcomeItem" ADD COLUMN "catalogSkinId" TEXT;
ALTER TABLE "TradeupOutcomeItem" ADD COLUMN "catalogCollectionId" TEXT;
ALTER TABLE "TradeupOutcomeItem" ADD COLUMN "catalogWeaponDefIndex" INTEGER;
ALTER TABLE "TradeupOutcomeItem" ADD COLUMN "catalogPaintIndex" INTEGER;

CREATE INDEX "TradeupPlanRule_catalogCollectionId_rarity_idx"
  ON "TradeupPlanRule"("catalogCollectionId", "rarity");

CREATE INDEX "TradeupOutcomeItem_catalogCollectionId_rarity_idx"
  ON "TradeupOutcomeItem"("catalogCollectionId", "rarity");
CREATE INDEX "TradeupOutcomeItem_catalogSkinId_idx"
  ON "TradeupOutcomeItem"("catalogSkinId");
CREATE INDEX "TradeupOutcomeItem_catalogWeaponDefIndex_catalogPaintIndex_idx"
  ON "TradeupOutcomeItem"("catalogWeaponDefIndex", "catalogPaintIndex");
