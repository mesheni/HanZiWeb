-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastFreezeGrantAt" TIMESTAMP(3),
ADD COLUMN     "streakFreezeCount" INTEGER NOT NULL DEFAULT 1;

