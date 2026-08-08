import { prisma } from '../../lib/prisma.js';
import { recalcFsrs } from '../sessions/srs.js';
import { computeElapsedDays, sanitizeClientTimestamp } from '../sessions/timePolicy.js';
import { markSessionCompleted } from '../sessions/sessions.service.js';
import * as achievementsService from '../achievements/achievements.service.js';
import type { SyncRequest, SyncResponse, SyncResult, SyncOutcome } from '@hanzi/shared';

/**
 * F05: терминальный ack для НЕ применённого изменения. Клиенты (web и
 * mobile-sdk) отмечают change как isSynced по любому результату с его
 * changeId — до фикса skip-пути молчали (`continue` без результата),
 * и изменение оставалось в pending навсегда (бесконечный retry).
 *
 * Поля new* для не-applied исходов — информационные (текущее состояние
 * прогресса, для rejected — нули); применять их не нужно.
 */
function skipResult(
  changeId: string,
  wordId: string,
  outcome: Exclude<SyncOutcome, 'applied'>,
  progress?: {
    stability: number;
    difficulty: number;
    state: string;
    dueDate: Date;
  } | null,
): SyncResult {
  return {
    changeId,
    wordId,
    outcome,
    newStability: progress?.stability ?? 0,
    newDifficulty: progress?.difficulty ?? 5,
    newState: (progress?.state ?? 'new') as SyncResult['newState'],
    newDueDate: (progress?.dueDate ?? new Date()).toISOString(),
    intervalDays: 0,
    xpGain: 0,
  };
}

/** Сколько раз перечитывать прогресс при конкурентной записи (F06). */
const MAX_SYNC_ATTEMPTS = 3;

/** Сигнал: CAS-запись не прошла — строка изменилась конкурентно. */
class ConcurrentUpdateError extends Error {}

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
      const changeTime = new Date(timestamp).getTime();
      const xpGain = ({ 1: 0, 2: 1, 3: 3, 4: 5 } as Record<number, number>)[rating as number] ?? 0;

      // F06: весь цикл «чтение → дедуп → расчёт → запись» выполняется
      // ВНУТРИ транзакции с optimistic-условием (stability/reps как
      // «версия» строки), как в recordAnswer (PLANCorrection #17).
      // До фикса прогресс читался вне транзакции, и два конкурентных
      // flush (или flush + live-ответ) пересчитывали FSRS от одного и
      // того же устаревшего состояния: проигравший молча терял своё
      // обновление (reps инкрементился, а stability/dueDate оставались
      // от победителя — рассинхрон). Теперь проигравший получает
      // count === 0, откатывается, перечитывает и пересчитывает от
      // актуального состояния; ретрай ограничен.
      let lastProgress: {
        stability: number;
        difficulty: number;
        state: string;
        dueDate: Date;
      } | null = null;
      let finalResult: SyncResult | null = null;

      for (let attempt = 0; attempt < MAX_SYNC_ATTEMPTS && finalResult === null; attempt++) {
        const serverNow = new Date();
        // F04: сервер — источник истины. Клиентский `timestamp` остаётся
        // только для дедупа и офлайн-elapsed (с серверной границей).
        const boundedChangeTime = sanitizeClientTimestamp(changeTime, serverNow.getTime());

        try {
          const txResult = await prisma.$transaction(
            async (tx): Promise<
              | { kind: 'applied'; createdHere: boolean; result: SyncResult }
              | { kind: 'rejected' }
              | { kind: 'stale' }
              | { kind: 'duplicate' }
            > => {
              const progress = await tx.userWordProgress.findUnique({
                where: { userId_wordId: { userId, wordId } },
              });

              // F05: rejected — записи прогресса нет (слово удалено).
              if (!progress) {
                return { kind: 'rejected' };
              }
              lastProgress = progress;

              const existingTime = progress.lastReviewDate?.getTime() ?? 0;
              // Дедуп по времени (fix v0.4 §45 follow-up). Клиент штампует
              // `answeredAt` один раз на ответ и кладёт его же в payload
              // очереди, поэтому после успешного live-post (lastReviewDate =
              // серверное время ответа ≈ клиентский timestamp при
              // синхронных часах) flush приходит с тем же timestamp →
              // `changeTime <= existingTime` → пропуск. Строгое `<`
              // пропускало этот случай, и ответ применялся второй раз
              // (reps/XP ×2). Для клиентов с ушедшими вперёд часами
              // срабатывает страховка ниже — SessionAnswer по
              // (sessionId, wordId).
              if (changeTime <= existingTime) {
                // F05: stale — изменение старше текущего lastReviewDate.
                return { kind: 'stale' };
              }

              // Страховка на уровне данных: ответ за то же слово в той же
              // сессии уже записан (live-post успел примениться, а flush
              // догнал с более поздним timestamp) — не пересчитываем
              // прогресс повторно.
              if (sessionId) {
                const existingAnswer = await tx.sessionAnswer.findFirst({
                  where: { sessionId, wordId },
                });
                if (existingAnswer) {
                  // F05: duplicate — этот ответ уже записан в сессии.
                  return { kind: 'duplicate' };
                }
              }

              // Elapsed с последнего повторения (PLAN_Features_v0.4 §35):
              // офлайн-ответ может прийти с опозданием — это должно
              // влиять на retrievability и пересчёт stability (F04:
              // ограничено серверной границей).
              const lastReviewMs = progress.lastReviewDate?.getTime() ?? 0;
              const elapsedDays = computeElapsedDays(
                lastReviewMs,
                boundedChangeTime,
                serverNow.getTime(),
              );
              const { newStability, newDifficulty, newState, intervalDays } = recalcFsrs(
                rating,
                progress.stability,
                progress.difficulty,
                progress.state,
                elapsedDays,
              );

              const newDueDate = new Date();
              newDueDate.setDate(newDueDate.getDate() + intervalDays);

              // F06: CAS-запись — версия (stability, reps) из свежего
              // чтения ВНУТРИ транзакции. count === 0 → конкурентный
              // flush уже применился → откат транзакции и ретрай.
              const updated = await tx.userWordProgress.updateMany({
                where: {
                  userId,
                  wordId,
                  stability: progress.stability,
                  reps: progress.reps,
                },
                data: {
                  state: newState,
                  stability: newStability,
                  difficulty: newDifficulty,
                  reps: { increment: 1 },
                  dueDate: newDueDate,
                  lastReviewDate: serverNow,
                },
              });
              if (updated.count === 0) {
                throw new ConcurrentUpdateError();
              }

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

              return {
                kind: 'applied',
                createdHere,
                result: {
                  changeId: change.id,
                  outcome: 'applied',
                  wordId,
                  newStability,
                  newDifficulty,
                  newState,
                  newDueDate: newDueDate.toISOString(),
                  intervalDays,
                  xpGain,
                },
              };
            },
          );

          if (txResult.kind === 'applied') {
            if (txResult.createdHere && sessionId) {
              appliedSessionIds.add(sessionId);
            }
            finalResult = txResult.result;
            // XP вне транзакции — инкрементный, идемпотентный (как в
            // recordAnswer): при сбое основной транзакции его отсутствие
            // лишь «не награждает» пользователя.
            if (xpGain > 0) {
              await prisma.user.update({
                where: { id: userId },
                data: { xp: { increment: xpGain } },
              });
            }
          } else {
            // F05: терминальный ack для не-applied исходов.
            finalResult = skipResult(change.id, wordId, txResult.kind, lastProgress);
          }
        } catch (err) {
          if (err instanceof ConcurrentUpdateError) {
            // Строка изменилась после нашего чтения — конкурентный
            // ответ уже закоммичен. Перечитываем и пересчитываем.
            continue;
          }
          // Уникальный индекс (sessionId, wordId): ответ уже записан
          // конкурентным flush'ем. Прогресс НЕ пересчитываем повторно.
          if ((err as { code?: string }).code === 'P2002') {
            // F05: duplicate — терминальный ack обязателен.
            finalResult = skipResult(change.id, wordId, 'duplicate', lastProgress);
            continue;
          }
          throw err;
        }
      }

      if (finalResult === null) {
        // Все попытки упёрлись в конкурентную запись — ответ уже
        // применился другим flush'ем (наш CAS всё время давал 0).
        // Терминальный ack, чтобы клиент не ушёл в вечный retry (F05).
        finalResult = skipResult(change.id, wordId, 'duplicate', lastProgress);
      }
      results.push(finalResult);
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
