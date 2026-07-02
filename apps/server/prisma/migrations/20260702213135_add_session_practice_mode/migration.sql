-- AlterTable
ALTER TABLE "Session" ADD COLUMN "mode"         TEXT NOT NULL DEFAULT 'mixed';
ALTER TABLE "Session" ADD COLUMN "practiceType" TEXT NOT NULL DEFAULT 'flip-card';
