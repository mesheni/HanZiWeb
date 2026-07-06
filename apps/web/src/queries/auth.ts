import { useMutation } from '@tanstack/react-query';
import type {
  ChangePassword,
  ChangePasswordResponse,
  ForgotPassword,
  ForgotPasswordResponse,
  ResetPassword,
  ResetPasswordResponse,
} from '@hanzi/shared';
import { apiPost, apiPut } from '../api/client';

/**
 * Хук для смены пароля (PLAN_Features_v0.3 §1).
 *
 * Вызывает `PUT /api/auth/change-password` с `currentPassword` и
 * `newPassword`. На успех — `onSuccess` из react-query, в настройках
 * обычно показывается toast «Пароль изменён». На ошибку пробрасывается
 * `Error` с сообщением от сервера (например, `INVALID_PASSWORD` или
 * `PASSWORD_NOT_SET`).
 */
export function useChangePassword() {
  return useMutation<ChangePasswordResponse, Error, ChangePassword>({
    mutationFn: (input) => apiPut<ChangePasswordResponse>('/auth/change-password', input),
  });
}

/**
 * Запрос ссылки на сброс пароля (PLAN_Features_v0.3 §2).
 *
 * Вызывает `POST /api/auth/forgot-password` с email пользователя.
 * Сервер ВСЕГДА отвечает `success: true` (даже если email не зарегистрирован),
 * чтобы не давать enumeration-утечек. В UI на этом хуке всегда показываем
 * общее сообщение «Если аккаунт существует, письмо отправлено».
 *
 * Реальные ошибки, которые нужно показать:
 * - 429 `RATE_LIMIT_EXCEEDED` — слишком много запросов с этого IP.
 * - 503 `EMAIL_NOT_CONFIGURED` — сервер без SMTP (dev/prod не настроен).
 * - 500 `EMAIL_SEND_FAILED` — SMTP упал.
 */
export function useForgotPassword() {
  return useMutation<ForgotPasswordResponse, Error, ForgotPassword>({
    mutationFn: (input) => apiPost<ForgotPasswordResponse>('/auth/forgot-password', input),
  });
}

/**
 * Подтверждение сброса пароля по токену из письма (PLAN_Features_v0.3 §2).
 *
 * Вызывает `POST /api/auth/reset-password` с `token` (из query-параметра
 * ссылки) и `newPassword`. На успех — `onSuccess` (редирект на /login).
 *
 * Ошибки:
 * - 400 `INVALID_TOKEN` — токен не найден или истёк (15 минут).
 * - 400 `VALIDATION_ERROR` — `newPassword` не прошёл Zod-валидацию.
 * - 429 `RATE_LIMIT_EXCEEDED` — слишком много попыток с этого IP.
 */
export function useResetPassword() {
  return useMutation<ResetPasswordResponse, Error, ResetPassword>({
    mutationFn: (input) => apiPost<ResetPasswordResponse>('/auth/reset-password', input),
  });
}
