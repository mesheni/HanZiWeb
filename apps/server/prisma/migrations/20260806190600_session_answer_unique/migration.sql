-- F11: preflight — исторические дубликаты (sessionId, wordId) от
-- двойного flush (live-post + офлайн-очередь, fix v0.4 §45 follow-up)
-- уронили бы CREATE UNIQUE INDEX unique-violation'ом и миграция
-- провалилась бы в проде. Удаляем дубликаты, оставляя самый ранний
-- ответ (минимальные (answeredAt, id)) на каждую пару.
DELETE FROM "SessionAnswer" a
USING "SessionAnswer" b
WHERE a."sessionId" = b."sessionId"
  AND a."wordId" = b."wordId"
  AND (a."answeredAt", a.id) > (b."answeredAt", b.id);

-- CreateIndex
CREATE UNIQUE INDEX "SessionAnswer_sessionId_wordId_key" ON "SessionAnswer"("sessionId", "wordId");