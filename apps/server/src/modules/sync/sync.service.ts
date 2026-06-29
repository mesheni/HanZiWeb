import { prisma } from '../../lib/prisma.js';
import { recalcFsrs } from '../sessions/srs.js';
import type { SyncRequest, SyncResponse, SyncResult } from '@hanzi/shared';

export async function processSync(userId: string, input: SyncRequest): Promise<SyncResponse> {
  const results: SyncResult[] = [];

  for (const change of input.changes) {
    if (change.type === 'study_answer') {
      const { wordId, rating, timestamp } = change.payload as any;

      const progress = await prisma.userWordProgress.findUnique({
        where: { userId_wordId: { userId, wordId } },
      });

      if (!progress) {
        continue;
      }

      const existingTime = progress.lastReviewDate?.getTime() ?? 0;
      const changeTime = new Date(timestamp).getTime();

      if (changeTime < existingTime) {
        continue;
      }

      const { newStability, newDifficulty, newState, intervalDays } = recalcFsrs(
        rating,
        progress.stability,
        progress.difficulty,
        progress.state,
      );

      const newDueDate = new Date();
      newDueDate.setDate(newDueDate.getDate() + intervalDays);

      await prisma.userWordProgress.update({
        where: { userId_wordId: { userId, wordId } },
        data: {
          state: newState,
          stability: newStability,
          difficulty: newDifficulty,
          reps: { increment: 1 },
          dueDate: newDueDate,
          lastReviewDate: new Date(),
        },
      });

      const xpGain = ({ 1: 0, 2: 1, 3: 3, 4: 5 } as Record<number, number>)[rating as number] ?? 0;
      if (xpGain > 0) {
        await prisma.user.update({
          where: { id: userId },
          data: { xp: { increment: xpGain } },
        });
      }

      results.push({
        changeId: change.id,
        wordId,
        newStability,
        newDifficulty,
        newState,
        newDueDate: newDueDate.toISOString(),
        intervalDays,
        xpGain,
      });
    }
  }

  const allProgress = await prisma.userWordProgress.findMany({
    where: { userId },
  });

  const serverChanges = allProgress.map((p) => ({
    wordId: p.wordId,
    state: p.state,
    stability: p.stability,
    difficulty: p.difficulty,
    reps: p.reps,
    dueDate: p.dueDate.toISOString(),
    lastReviewDate: p.lastReviewDate?.toISOString() ?? null,
    timestamp: p.lastReviewDate?.toISOString() ?? p.dueDate.toISOString(),
  }));

  return { results, serverChanges };
}
