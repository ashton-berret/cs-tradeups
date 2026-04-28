-- AlterTable
ALTER TABLE "TradeupCombination" ADD COLUMN "tradeupLabId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "TradeupCombination_tradeupLabId_key" ON "TradeupCombination"("tradeupLabId");
