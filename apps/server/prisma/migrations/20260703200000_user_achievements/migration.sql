-- CreateTable
-- Достижения пользователя (badges) — см. PLAN_Features_v0.2 §8.
-- Проверяются после каждого ответа в /sessions/:id/answer
-- и возвращаются в ответе + показываются через toast.
CREATE TABLE "UserAchievement" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "type"       TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAchievement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserAchievement_userId_type_key" ON "UserAchievement"("userId", "type");
CREATE INDEX        "UserAchievement_userId_idx"       ON "UserAchievement"("userId");

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
