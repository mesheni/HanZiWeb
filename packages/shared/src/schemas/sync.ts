import { z } from 'zod';

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
  newDifficulty: z.number(),
  newState: z.enum(['new', 'learning', 'review', 'graduated']),
  newDueDate: z.string(),
  intervalDays: z.number(),
  xpGain: z.number(),
});
export type SyncResult = z.infer<typeof SyncResultSchema>;

export const SyncResponseSchema = z.object({
  results: z.array(SyncResultSchema),
  serverChanges: z.array(z.any()),
});
export type SyncResponse = z.infer<typeof SyncResponseSchema>;
