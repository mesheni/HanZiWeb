import { z } from 'zod';
import { WordStateSchema, SrsRatingSchema } from './progress.js';

export const PendingChangeTypeSchema = z.enum([
  'study_answer',
  'mnemonic_upsert',
  'mnemonic_delete',
]);
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
 * Payload офлайн-изменения личной мнемоники. `updatedAt` — клиентский
 * штамп редактирования: на нём построен last-write-wins при конфликте
 * правок с разных устройств.
 */
export const MnemonicUpsertPayloadSchema = z.object({
  wordId: z.string(),
  text: z.string().min(1).max(500),
  updatedAt: z.string().datetime(),
});
export type MnemonicUpsertPayload = z.infer<typeof MnemonicUpsertPayloadSchema>;

export const MnemonicDeletePayloadSchema = z.object({
  wordId: z.string(),
  updatedAt: z.string().datetime(),
});
export type MnemonicDeletePayload = z.infer<typeof MnemonicDeletePayloadSchema>;

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
  z.object({
    id: z.string(),
    type: z.literal('mnemonic_upsert'),
    payload: MnemonicUpsertPayloadSchema,
  }),
  z.object({
    id: z.string(),
    type: z.literal('mnemonic_delete'),
    payload: MnemonicDeletePayloadSchema,
  }),
]);
export type SyncChange = z.infer<typeof SyncChangeSchema>;

export const SyncRequestSchema = z.object({
  changes: z.array(SyncChangeSchema),
  /**
   * Курсор инкрементального sync (F32): монотонный id последней
   * полученной записи серверного журнала `SyncJournal`. Сервер отдаёт
   * в `serverChanges` записи с `id > sinceCursor` — источник правды —
   * журнал, а не эвристика по полям прогресса. Первый sync — без
   * курсора → полный снапшот + `nextCursor`.
   */
  sinceCursor: z.number().int().nonnegative().optional(),
  /**
   * Устаревший ISO-курсор (v0.5 и ранее). Если задан `sinceCursor` —
   * игнорируется.
   * @deprecated Используйте sinceCursor (F32).
   */
  sinceTimestamp: z.string().datetime().optional(),
});
export type SyncRequest = z.infer<typeof SyncRequestSchema>;

/** Терминальный исход изменения (F05): каждый вход получает ровно один ack. */
export const SyncOutcomeSchema = z.enum(['applied', 'duplicate', 'stale', 'rejected']);
export type SyncOutcome = z.infer<typeof SyncOutcomeSchema>;

/** Ack для изменения мнемоники: поля FSRS-прогресса не применимы. */
export const MnemonicSyncResultSchema = z
  .object({
    changeId: z.string(),
    outcome: SyncOutcomeSchema,
    wordId: z.string(),
  })
  .strict();
export type MnemonicSyncResult = z.infer<typeof MnemonicSyncResultSchema>;

/**
 * Ack для study_answer: помимо исхода содержит новое FSRS-состояние
 * (информационно — сервер остаётся источником истины).
 */
export const StudyAnswerSyncResultSchema = z
  .object({
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
  })
  // strict: без этого результат study_answer с мусорным полем проходит
  // как вариант-мнемоника (zod игнорирует лишние ключи) — union не
  // ловит дрейф контракта.
  .strict();
export type StudyAnswerSyncResult = z.infer<typeof StudyAnswerSyncResultSchema>;

/** Ack одного изменения из батча sync: study_answer или мнемоника. */
export const SyncResultSchema = z.union([StudyAnswerSyncResultSchema, MnemonicSyncResultSchema]);
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
  /**
   * F32: курсор для следующего sync-запроса — максимальный id журнала
   * из выданной пачки (или текущий курсор, если изменений не было).
   */
  nextCursor: z.number().int().nonnegative(),
});
export type SyncResponse = z.infer<typeof SyncResponseSchema>;
