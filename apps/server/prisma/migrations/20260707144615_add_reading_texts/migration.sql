-- CreateTable
CREATE TABLE "ReadingText" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "hskLevel" INTEGER NOT NULL,
    "author" TEXT,
    "source" TEXT,
    "wordCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadingText_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadingTextWord" (
    "id" TEXT NOT NULL,
    "textId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "length" INTEGER NOT NULL,

    CONSTRAINT "ReadingTextWord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserWordPriority" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserWordPriority_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserReadingProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "textId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserReadingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReadingTextWord_textId_position_idx" ON "ReadingTextWord"("textId", "position");

-- CreateIndex
CREATE INDEX "ReadingTextWord_wordId_idx" ON "ReadingTextWord"("wordId");

-- CreateIndex
CREATE INDEX "UserWordPriority_userId_idx" ON "UserWordPriority"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserWordPriority_userId_wordId_key" ON "UserWordPriority"("userId", "wordId");

-- CreateIndex
CREATE INDEX "UserReadingProgress_userId_idx" ON "UserReadingProgress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserReadingProgress_userId_textId_key" ON "UserReadingProgress"("userId", "textId");

-- AddForeignKey
ALTER TABLE "ReadingTextWord" ADD CONSTRAINT "ReadingTextWord_textId_fkey" FOREIGN KEY ("textId") REFERENCES "ReadingText"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingTextWord" ADD CONSTRAINT "ReadingTextWord_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserWordPriority" ADD CONSTRAINT "UserWordPriority_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserWordPriority" ADD CONSTRAINT "UserWordPriority_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserReadingProgress" ADD CONSTRAINT "UserReadingProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserReadingProgress" ADD CONSTRAINT "UserReadingProgress_textId_fkey" FOREIGN KEY ("textId") REFERENCES "ReadingText"("id") ON DELETE CASCADE ON UPDATE CASCADE;


