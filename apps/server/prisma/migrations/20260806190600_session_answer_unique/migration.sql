-- CreateIndex
CREATE UNIQUE INDEX "SessionAnswer_sessionId_wordId_key" ON "SessionAnswer"("sessionId", "wordId");