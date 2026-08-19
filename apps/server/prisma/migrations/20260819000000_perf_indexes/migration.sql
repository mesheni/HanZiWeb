-- CreateIndex
CREATE INDEX "UserWordProgress_userId_state_idx" ON "UserWordProgress"("userId", "state");

-- CreateIndex
CREATE INDEX "Session_userId_startedAt_idx" ON "Session"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "SessionAnswer_answeredAt_idx" ON "SessionAnswer"("answeredAt");

