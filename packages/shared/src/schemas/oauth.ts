import { z } from 'zod';

/**
 * Провайдеры социальной аутентификации
 * (PLAN_Features_v0.2 §13).
 */
export const OAuthProviderSchema = z.enum(['google', 'apple', 'yandex']);
export type OAuthProvider = z.infer<typeof OAuthProviderSchema>;

/**
 * Имя, отображаемое в UI для каждого провайдера.
 */
export const OAUTH_PROVIDER_LABELS: Record<OAuthProvider, string> = {
  google: 'Google',
  apple: 'Apple',
  yandex: 'Яндекс',
};

/**
 * Метаданные пользователя, полученные от провайдера.
 * Используется в `findOrCreateOAuthUser` для создания
 * или обновления `User.displayName` / `avatarUrl`.
 */
export const OAuthProfileSchema = z.object({
  provider: OAuthProviderSchema,
  /** Уникальный ID пользователя у провайдера (sub / id). */
  providerUserId: z.string().min(1),
  /** Email, если провайдер его вернул. */
  email: z.string().email().optional(),
  /** Email подтверждён провайдером. */
  emailVerified: z.boolean().default(false),
  /** Имя / displayName. */
  displayName: z.string().max(120).optional(),
  /** URL аватара. */
  avatarUrl: z.string().url().optional(),
});

export type OAuthProfile = z.infer<typeof OAuthProfileSchema>;

/**
 * Привязка пользователя к провайдеру (ответ на
 * `GET /api/auth/accounts`).
 */
export const UserAccountSchema = z.object({
  id: z.string().uuid(),
  provider: OAuthProviderSchema,
  providerEmail: z.string().email().nullable(),
  createdAt: z.string().datetime(),
});

export type UserAccountInfo = z.infer<typeof UserAccountSchema>;

export const UserAccountsResponseSchema = z.object({
  accounts: z.array(UserAccountSchema),
  /** Может ли пользователь удалить хотя бы одну привязку
   * (false, если у него нет пароля и привязка единственная). */
  canUnlink: z.boolean(),
});

export type UserAccountsResponse = z.infer<typeof UserAccountsResponseSchema>;

/**
 * Одноразовый код, выдаваемый после успешного OAuth-flow.
 * Клиент обменивает его на пару access+refresh через
 * `POST /api/auth/oauth/exchange` (см. также `OAuthCallbackPage`
 * на web). Хранится в Redis с TTL ~60 секунд.
 */
export const OAuthExchangeSchema = z.object({
  code: z.string().min(16).max(128),
});

export type OAuthExchange = z.infer<typeof OAuthExchangeSchema>;
