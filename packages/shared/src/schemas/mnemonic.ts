import { z } from 'zod';

/**
 * Личная мнемоника пользователя к слову. Отдельна от `Word.mnemonic`
 * (seed-мнемоника едина для всех): личная ассоциация важнее для
 * запоминания и синхронизируется между устройствами.
 */
export const UserMnemonicSchema = z.object({
  wordId: z.string().uuid(),
  text: z.string().min(1).max(500),
  updatedAt: z.string().datetime(),
});
export type UserMnemonic = z.infer<typeof UserMnemonicSchema>;

/** Тело PUT /users/me/mnemonics/:wordId. */
export const MnemonicUpsertSchema = z.object({
  text: z.string().min(1).max(500),
});
export type MnemonicUpsert = z.infer<typeof MnemonicUpsertSchema>;

/**
 * Query для `GET /users/me/mnemonics?wordIds=a,b,c` — пакетная выборка
 * мнемоник по списку слов (для флеш-карт и палитры). До 50 id за раз.
 */
export const MnemonicBatchQuerySchema = z.object({
  wordIds: z.string().min(1).max(1000),
});
export type MnemonicBatchQuery = z.infer<typeof MnemonicBatchQuerySchema>;

export const MnemonicBatchResponseSchema = z.object({
  items: z.array(UserMnemonicSchema),
});
export type MnemonicBatchResponse = z.infer<typeof MnemonicBatchResponseSchema>;
