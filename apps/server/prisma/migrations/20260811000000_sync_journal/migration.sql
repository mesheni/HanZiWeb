-- F32: серверный журнал изменений — персистентный источник serverChanges
-- инкрементального sync (вместо эвристики по lastReviewDate/dueDate).

-- CreateTable
CREATE TABLE "SyncJournal" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "changeType" TEXT NOT NULL DEFAULT 'study_answer',
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncJournal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncJournal_userId_id_idx" ON "SyncJournal"("userId", "id");

-- AddForeignKey
ALTER TABLE "SyncJournal" ADD CONSTRAINT "SyncJournal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
