import { prisma } from '../../lib/prisma.js';
import { recalcFsrs } from '../sessions/srs.js';
import { computeElapsedDays, sanitizeClientTimestamp } from '../sessions/timePolicy.js';
import { markSessionCompleted } from '../sessions/sessions.service.js';
import * as achievementsService from '../achievements/achievements.service.js';
import type { SyncRequest, SyncResponse, SyncResult } from '@hanzi/shared';

export async function processSync(userId: string, input: SyncRequest): Promise<SyncResponse> {
  const results: SyncResult[] = [];
  // Сессии, в которые этот батч реально записал ответы, — для проверки
  // достижений (PLANCorrection #16).
  const appliedSessionIds = new Set<string>();

  for (const change of input.changes) {
    // Discriminated union по type (PLANCorrection #21): в ветке
    // study_answer payload уже типизирован StudyAnswerPayloadSchema
    // (валидация на границе — SyncRequestSchema.parse в sync.routes.ts).
    if (change.type === 'study_answer') {
      const { wordId, rating, timestamp, sessionId } = change.payload;

      const progress = await prisma.userWordProgress.findUnique({
        where: { userId_wordId: { userId, wordId } },
      });

      if (!progress) {
        continue;
      }

      const existingTime = progress.lastReviewDate?.getTime() ?? 0;
      const changeTime = new Date(timestamp).getTime();

      // F04: сервер — источник истины. Клиентский `timestamp` остаётся
      // только для дедупа и офлайн-elapsed (с серверной границей);
      // в lastReviewDate/SessionAnswer.answeredAt/lastActiveDate пишется
      // серверное время — иначе клиент подделывал бы расписание FSRS
      // и стрик произвольными датами.
      const serverNow = new Date();
      const boundedChangeTime = sanitizeClientTimestamp(changeTime, serverNow.getTime());

      // Дедуп по времени (fix v0.4 §45 follow-up). Клиент штампует
      // `answeredAt` один раз на ответ и кладёт его же в payload
      // очереди, поэтому после успешного live-post (lastReviewDate =
      // серверное время ответа ≈ клиентский timestamp при синхронных
      // часах) flush приходит с тем же timestamp →
      // `changeTime <= existingTime` → пропуск. Строгое `<` пропускало
      // этот случай, и ответ применялся второй раз (reps/XP ×2).
      // Для клиентов с ушедшими вперёд часами срабатывает страховка
      // ниже — SessionAnswer по (sessionId, wordId).
      if (changeTime <= existingTime) {
        continue;
      }

      // Страховка на уровне данных: ответ за то же слово в той же
      // сессии уже записан (live-post успел примениться, а flush догнал
      // с более поздним timestamp) — пропускаем, чтобы не пересчитывать
      // прогресс повторно.
      if (sessionId) {
        const existingAnswer = await prisma.sessionAnswer.findFirst({
          where: { sessionId, wordId },
        });
        if (existingAnswer) {
          continue;
        }
      }

      // Elapsed с последнего повторения (PLAN_Features_v0.4 §35):
      // офлайн-ответ может прийти с опозданием — это должно влиять
      // на retrievability и пересчёт stability. Отсчитываем от
      // timestamp'а ответа (ограниченного серверным «сейчас» и
      // серверным elapsed — F04), чтобы серверный пересчёт совпадал
      // с live-путём, а клиент не мог накручивать дефицит R.
      const lastReviewMs = progress.lastReviewDate?.getTime() ?? 0;
      const elapsedDays = computeElapsedDays(lastReviewMs, boundedChangeTime, serverNow.getTime());
      const { newStability, newDifficulty, newState, intervalDays } = recalcFsrs(
        rating,
        progress.stability,
        progress.difficulty,
        progress.state,
        elapsedDays,
      );

      const newDueDate = new Date();
      newDueDate.setDate(newDueDate.getDate() + intervalDays);

      try {
        const created = await prisma.$transaction(async (tx) => {
          await tx.userWordProgress.update({
            where: { userId_wordId: { userId, wordId } },
            data: {
              state: newState,
              stability: newStability,
              difficulty: newDifficulty,
              reps: { increment: 1 },
              dueDate: newDueDate,
              lastReviewDate: serverNow,
            },
          });

          let createdHere = false;
          if (sessionId) {
            // IDOR-защита, как в recordAnswer: счётчик инкрементим
            // только в СВОЕЙ сессии (updateMany с фильтром userId),
            // SessionAnswer создаём лишь если сессия наша. Чужая или
            // удалённая сессия молча пропускается — прогресс юзера
            // применяется в любом случае.
            const owned = await tx.session.updateMany({
              where: { id: sessionId, userId },
              data: { cardsCompleted: { increment: 1 } },
            });
            if (owned.count === 1) {
              await tx.sessionAnswer.create({
                data: { sessionId, wordId, rating, answeredAt: serverNow },
              });
              createdHere = true;
              // F03: sync-путь тоже завершает сессию — по достижении
              // cardsTotal проставляем completedAt.
              const row = await tx.session.findUnique({
                where: { id: sessionId },
                select: { cardsTotal: true },
              });
              await markSessionCompleted(tx, sessionId, row?.cardsTotal ?? 0, serverNow);
            }
          }

          // Стрик/активность (PLANCorrection #16): lastActiveDate =
          // max(lastActiveDate, серверное «сейчас») — монотонная
          // идемпотентная операция, безопасна при повторных flush
          // (F04: серверное время, не клиентский timestamp).
          await tx.user.updateMany({
            where: {
              id: userId,
              OR: [{ lastActiveDate: null }, { lastActiveDate: { lt: serverNow } }],
            },
            data: { lastActiveDate: serverNow },
          });

          return createdHere;
        });
        if (created && sessionId) {
          appliedSessionIds.add(sessionId);
        }
      } catch (err) {
        // Гонка между findFirst и create (два параллельных flush):
        // уникальный индекс (sessionId, wordId) — финальная защита от
        // повторного применения. Прогресс НЕ пересчитываем повторно.
        if ((err as { code?: string }).code === 'P2002') {
          continue;
        }
        throw err;
      }

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

  // Достижения за офлайн-ответы (PLANCorrection #16) — best-effort, как
  // в recordAnswer: после батча, по одной проверке на сессию с реально
  // записанными ответами. Ошибки не роняют sync; unlocked-список клиенту
  // не отдаётся (появится при следующем live-ответе).
  for (const sid of appliedSessionIds) {
    try {
      await achievementsService.checkAllAchievements(userId, sid);
    } catch (err) {
      console.error('checkAllAchievements failed', err);
    }
  }

  // Инкрементальный sync (PLAN_Features_v0.4 §48): при наличии курсора
  // отдаём только прогресс, изменённый после него — lastReviewDate
  // обновляется при каждом ответе, а новые карточки (lastReviewDate
  // null) сигнализируют о себе через dueDate = момент создания.
  // Без курсора (первый sync) — полный снапшот.
  const since = input.sinceTimestamp ? new Date(input.sinceTimestamp) : undefined;
  const allProgress = await prisma.userWordProgress.findMany({
    where: {
      userId,
      ...(since
        ? {
            OR: [
              { lastReviewDate: { gt: since } },
              { lastReviewDate: null, dueDate: { gt: since } },
            ],
          }
        : {}),
    },
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
