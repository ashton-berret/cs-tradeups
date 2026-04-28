-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN "steamAssetId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_steamAssetId_key" ON "InventoryItem"("steamAssetId");
