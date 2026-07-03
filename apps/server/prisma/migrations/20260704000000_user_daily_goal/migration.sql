-- AlterTable
-- Ежедневная цель пользователя по количеству ревью.
-- Используется в `GET /api/stats/dashboard` (поле `dailyGoal`) и
-- в кольцевом прогрессе на главной странице.
-- См. PLAN_Features_v0.2 §9 (Ежедневная цель).
ALTER TABLE "User" ADD COLUMN "dailyGoal" INTEGER NOT NULL DEFAULT 20;
