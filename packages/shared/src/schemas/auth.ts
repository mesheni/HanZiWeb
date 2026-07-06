import { z } from 'zod';

/**
 * Допустимые TLD для email при регистрации (PLAN_Features_v0.3 §3).
 *
 * Сервис ориентирован на российскую аудиторию и хранит персональные
 * данные на территории РФ (152-ФЗ), поэтому регистрация разрешена
 * только с почтой в домене `.ru`. Серверная конфигурация может
 * дополнительно расширить список через `ALLOWED_EMAIL_TLDS` env.
 */
export const DEFAULT_ALLOWED_EMAIL_TLDS = ['ru'] as const;

/** Код ошибки, возвращаемый сервером при попытке регистрации с запрещённым доменом. */
export const EMAIL_DOMAIN_NOT_ALLOWED_CODE = 'EMAIL_DOMAIN_NOT_ALLOWED';

/**
 * Проверяет, что TLD email'а входит в список разрешённых.
 * Сравнение регистронезависимое, домен нормализуется.
 */
export function isAllowedEmailTld(
  email: string,
  allowedTlds: readonly string[] = DEFAULT_ALLOWED_EMAIL_TLDS,
): boolean {
  const atIndex = email.lastIndexOf('@');
  if (atIndex === -1) return false;
  const domain = email.slice(atIndex + 1).toLowerCase().trim();
  if (!domain || !domain.includes('.')) return false;
  const tld = domain.split('.').pop() ?? '';
  if (!tld) return false;
  const normalized = allowedTlds.map((t) => t.toLowerCase());
  return normalized.includes(tld);
}

/** Регистрация */
export const RegisterSchema = z.object({
  email: z
    .string()
    .email()
    .refine((email) => isAllowedEmailTld(email), {
      message: 'Email domain not allowed. Only .ru domains are accepted.',
    }),
  password: z.string().min(8).max(128),
});

export type Register = z.infer<typeof RegisterSchema>;

/** Вход */
export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type Login = z.infer<typeof LoginSchema>;

/** Ответ на успешную аутентификацию */
export const AuthResponseSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    xp: z.number().int().nonnegative(),
    currentStreak: z.number().int().nonnegative(),

  }),
  accessToken: z.string(),
  /** access-токен живёт 15 минут */
  expiresIn: z.number(),
});

export type AuthResponse = z.infer<typeof AuthResponseSchema>;

/** Refresh токен */
export const RefreshSchema = z.object({
  /** Refresh-токен приходит в HttpOnly cookie, но на случай если нужен body */
  refreshToken: z.string().optional(),
});

export type Refresh = z.infer<typeof RefreshSchema>;

/** Смена пароля (PLAN_Features_v0.3 §1) */
export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(8).max(128),
    newPassword: z.string().min(8).max(128),
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from the current one',
    path: ['newPassword'],
  });

export type ChangePassword = z.infer<typeof ChangePasswordSchema>;

/** Ответ на смену пароля. */
export const ChangePasswordResponseSchema = z.object({
  success: z.literal(true),
});

export type ChangePasswordResponse = z.infer<typeof ChangePasswordResponseSchema>;

/**
 * Запрос сброса пароля (PLAN_Features_v0.3 §2).
 *
 * Сервер всегда отвечает `ForgotPasswordResponseSchema` (`{ success: true }`)
 * независимо от того, зарегистрирован ли такой email — иначе можно
 * использовать эндпоинт для enumeration-атак (узнать, какие email
 * зарегистрированы в системе).
 */
export const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

export type ForgotPassword = z.infer<typeof ForgotPasswordSchema>;

/**
 * Подтверждение сброса пароля (PLAN_Features_v0.3 §2).
 *
 * На сервер отправляется одноразовый токен из ссылки в письме
 * и новый пароль. Те же требования к длине, что и при регистрации.
 */
export const ResetPasswordSchema = z.object({
  token: z.string().min(1).max(256),
  newPassword: z.string().min(8).max(128),
});

export type ResetPassword = z.infer<typeof ResetPasswordSchema>;

/** Ответ на запрос сброса (всегда одинаковый). */
export const ForgotPasswordResponseSchema = z.object({
  success: z.literal(true),
});

export type ForgotPasswordResponse = z.infer<typeof ForgotPasswordResponseSchema>;

/** Ответ на подтверждение сброса. */
export const ResetPasswordResponseSchema = z.object({
  success: z.literal(true),
});

export type ResetPasswordResponse = z.infer<typeof ResetPasswordResponseSchema>;
