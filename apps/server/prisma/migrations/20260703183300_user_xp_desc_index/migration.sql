-- CreateIndex
-- Индекс по xp DESC для быстрого leaderboard (топ-100 пользователей).
-- См. PLAN_Features_v0.2 §7 (Leaderboard / социальная статистика).
CREATE INDEX "User_xp_idx" ON "User"("xp" DESC);
