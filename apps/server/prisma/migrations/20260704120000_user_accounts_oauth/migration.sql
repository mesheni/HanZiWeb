-- Социальный вход (Google/Apple/Yandex) — см. PLAN_Features_v0.2 §13.
-- Добавляем таблицу `UserAccount` (связь User ↔ внешний провайдер),
-- делаем `passwordHash` опциональным (для пользователей без пароля)
-- и расширяем User полями displayName/avatarUrl/emailVerified.

-- AlterTable
ALTER TABLE "User"
  ALTER COLUMN "passwordHash" DROP NOT NULL,
  ADD COLUMN "displayName"   TEXT,
  ADD COLUMN "avatarUrl"     TEXT,
  ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "UserAccount" (
    "id"             TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "provider"       TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "providerEmail"  TEXT,
    "providerMeta"   TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserAccount_provider_providerUserId_key"
  ON "UserAccount"("provider", "providerUserId");
CREATE INDEX "UserAccount_userId_idx" ON "UserAccount"("userId");

-- AddForeignKey
ALTER TABLE "UserAccount" ADD CONSTRAINT "UserAccount_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
