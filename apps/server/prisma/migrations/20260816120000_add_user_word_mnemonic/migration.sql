-- CreateTable
CREATE TABLE "UserWordMnemonic" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserWordMnemonic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserWordMnemonic_userId_idx" ON "UserWordMnemonic"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserWordMnemonic_userId_wordId_key" ON "UserWordMnemonic"("userId", "wordId");

-- AddForeignKey
ALTER TABLE "UserWordMnemonic" ADD CONSTRAINT "UserWordMnemonic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserWordMnemonic" ADD CONSTRAINT "UserWordMnemonic_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE CASCADE ON UPDATE CASCADE;

