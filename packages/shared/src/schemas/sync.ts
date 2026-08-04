import { z } from 'zod';
import { WordStateSchema } from './progress.js';

export const PendingChangeTypeSchema = z.enum(['study_answer']);
export type PendingChangeType = z.infer<typeof PendingChangeTypeSchema>;

export const PendingChangePayloadSchema = z.object({
  wordId: z.string(),
  rating: z.number().int().min(1).max(4),
  timestamp: z.string().datetime(),
  sessionId: z.string().optional(),
});
export type PendingChangePayload = z.infer<typeof PendingChangePayloadSchema>;

export const PendingChangeSchema = z.object({
  id: z.string(),
  type: PendingChangeTypeSchema,
  payload: PendingChangePayloadSchema,
  isSynced: z.boolean().default(false),
  createdAt: z.string().datetime(),
});
export type PendingChange = z.infer<typeof PendingChangeSchema>;

export const SyncChangeSchema = z.object({
  id: z.string(),
  type: PendingChangeTypeSchema,
  payload: PendingChangePayloadSchema,
});

export const SyncRequestSchema = z.object({
  changes: z.array(SyncChangeSchema),
});
export type SyncRequest = z.infer<typeof SyncRequestSchema>;

export const SyncResultSchema = z.object({
  changeId: z.string(),
  wordId: z.string(),
  newStability: z.number(),
  // Difficulty ограничена [0, 1] — как во всех остальных схемах
  // (progress.ts): значение вне диапазона не должно попадать в
  // WatermelonDB и ломать следующий FSRS-вызов (PLAN_Features_v0.4 §41).
  newDifficulty: z.number().min(0).max(1),
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
  difficulty: z.number().min(0).max(1),
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
