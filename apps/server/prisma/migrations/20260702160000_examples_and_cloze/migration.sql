-- AlterTable
ALTER TABLE "Example"
  ADD COLUMN "source"    TEXT        NOT NULL DEFAULT 'manual',
  ADD COLUMN "tatoebaId" BIGINT,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "Example_tatoebaId_key" ON "Example"("tatoebaId");
CREATE INDEX        "Example_wordId_idx"   ON "Example"("wordId");

-- CreateTable
CREATE TABLE "ClozeProgress" (
    "id"           TEXT NOT NULL,
    "userId"       TEXT NOT NULL,
    "wordId"       TEXT NOT NULL,
    "exampleId"    TEXT NOT NULL,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "wrongCount"   INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt"   TIMESTAMP(3),
    "lastCorrect"  BOOLEAN,

    CONSTRAINT "ClozeProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClozeProgress_userId_exampleId_key" ON "ClozeProgress"("userId", "exampleId");
CREATE INDEX        "ClozeProgress_userId_idx"          ON "ClozeProgress"("userId");

-- AddForeignKey
ALTER TABLE "ClozeProgress" ADD CONSTRAINT "ClozeProgress_userId_fkey"  FOREIGN KEY ("userId")  REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClozeProgress" ADD CONSTRAINT "ClozeProgress_wordId_fkey"  FOREIGN KEY ("wordId")  REFERENCES "Word"("id") ON DELETE CASCADE ON UPDATE CASCADE;
