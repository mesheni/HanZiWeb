import { useMutation } from '@tanstack/react-query';
import type { ChangePassword, ChangePasswordResponse } from '@hanzi/shared';
import { apiPut } from '../api/client';

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
