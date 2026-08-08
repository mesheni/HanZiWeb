import { z } from 'zod';
import { WordStateSchema, SrsRatingSchema } from './progress.js';

export const PendingChangeTypeSchema = z.enum(['study_answer']);
export type PendingChangeType = z.infer<typeof PendingChangeTypeSchema>;

/** Payload ответа в сессии (live и офлайн-очередь) — контракт study_answer. */
export const StudyAnswerPayloadSchema = z.object({
  wordId: z.string(),
  rating: SrsRatingSchema,
  timestamp: z.string().datetime(),
  sessionId: z.string().optional(),
});
export type StudyAnswerPayload = z.infer<typeof StudyAnswerPayloadSchema>;

/**
 * Payload локальной офлайн-очереди мобильного SDK. Сейчас единственный
 * тип изменения — study_answer, поэтому алиас на StudyAnswerPayloadSchema;
 * имя сохранено для совместимости (PendingChange в SyncEngine).
 */
export const PendingChangePayloadSchema = StudyAnswerPayloadSchema;
export type PendingChangePayload = z.infer<typeof PendingChangePayloadSchema>;

export const PendingChangeSchema = z.object({
  id: z.string(),
  type: PendingChangeTypeSchema,
  payload: PendingChangePayloadSchema,
  isSynced: z.boolean().default(false),
  createdAt: z.string().datetime(),
});
export type PendingChange = z.infer<typeof PendingChangeSchema>;

/**
 * Изменение в теле sync-запроса — discriminated union по `type`
 * (PLANCorrection #21): payload каждой ветки типизирован и валидируется
 * контрактом, сервер разбирает его без ручных кастов.
 */
export const SyncChangeSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string(),
    type: z.literal('study_answer'),
    payload: StudyAnswerPayloadSchema,
  }),
]);
export type SyncChange = z.infer<typeof SyncChangeSchema>;

export const SyncRequestSchema = z.object({
  changes: z.array(SyncChangeSchema),
  /**
   * Курсор инкрементального sync (PLAN_Features_v0.4 §48): ISO-время
   * последнего успешного sync клиента. Сервер отдаёт в `serverChanges`
   * только прогресс, изменённый ПОСЛЕ этого момента (lastReviewDate >
   * since, либо новые карточки с dueDate > since), — бандл линейный по
   * изменённому, а не O(все записи). Первый sync — без курсора → полный
   * снапшот.
   */
  sinceTimestamp: z.string().datetime().optional(),
});
export type SyncRequest = z.infer<typeof SyncRequestSchema>;

/** Терминальный исход изменения (F05): каждый вход получает ровно один ack. */
export const SyncOutcomeSchema = z.enum(['applied', 'duplicate', 'stale', 'rejected']);
export type SyncOutcome = z.infer<typeof SyncOutcomeSchema>;

export const SyncResultSchema = z.object({
  changeId: z.string(),
  /**
   * applied   — ответ применён (поля new* валидны);
   * duplicate — ответ уже записан (live-пост успел, P2002) — полей new*
   *             можно не применять;
   * stale     — изменение старше текущего состояния прогресса — пропущено;
   * rejected  — сервер не может применить (нет записи прогресса).
   */
  outcome: SyncOutcomeSchema,
  wordId: z.string(),
  newStability: z.number(),
  // Difficulty — каноническая FSRS-5 шкала [1, 10], как во всех
  // остальных схемах (progress.ts): значение вне диапазона не должно
  // попадать в WatermelonDB и ломать следующий FSRS-вызов
  // (PLAN_Features_v0.4 §41, §46).
  newDifficulty: z.number().min(1).max(10),
  newState: z.enum(['new', 'learning', 'review', 'graduated']),
  newDueDate: z.string(),
  intervalDays: z.number(),
  xpGain: z.number(),
});
export type SyncResult = z.infer<typeof SyncResultSchema>;

/**
 * Строка прогресса, которую сервер присылает в `serverChanges`
 * (зеркало `ServerChange` из `packages/mobile-sdk/src/sync/SyncEngine.ts`
 * и ответа `sync.service.ts`). Контракт фиксируется схемой, чтобы
 * дрифт сервера детектился на границе (PLAN_Features_v0.4 §40).
 */
export const ServerChangeSchema = z.object({
  wordId: z.string(),
  state: WordStateSchema,
  stability: z.number(),
  difficulty: z.number().min(1).max(10),
  reps: z.number().int().min(0),
  dueDate: z.string(),
  lastReviewDate: z.string().nullable(),
  timestamp: z.string(),
});
export type ServerChange = z.infer<typeof ServerChangeSchema>;

export const SyncResponseSchema = z.object({
  results: z.array(SyncResultSchema),
  serverChanges: z.array(ServerChangeSchema),
});
export type SyncResponse = z.infer<typeof SyncResponseSchema>;
