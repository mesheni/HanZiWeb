-- AlterTable
ALTER TABLE "Deck"
  ADD COLUMN "ownerId"   TEXT,
  ADD COLUMN "shareCode" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "Deck_shareCode_key" ON "Deck"("shareCode");
CREATE INDEX        "Deck_ownerId_idx"  ON "Deck"("ownerId");

-- AddForeignKey
ALTER TABLE "Deck" ADD CONSTRAINT "Deck_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
