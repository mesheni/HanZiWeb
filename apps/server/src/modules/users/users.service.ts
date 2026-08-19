import { prisma } from '../../lib/prisma.js';
import { DAILY_GOAL_DEFAULT } from '@hanzi/shared';
import type { UpdateUserSettings, UserSettings } from '@hanzi/shared';

/**
 * Возвращает пользовательские настройки: `dailyGoal` + `timezone`.
 * Если `dailyGoal` по какой-то причине не заполнен, отдаём дефолт;
 * `timezone: null` — UTC (backward-compat, v0.4 §24).
 *
 * См. PLAN_Features_v0.2 §9.
 */
export async function getUserSettings(userId: string): Promise<UserSettings> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { dailyGoal: true, timezone: true },
  });

  return {
    dailyGoal: user?.dailyGoal && user.dailyGoal > 0 ? user.dailyGoal : DAILY_GOAL_DEFAULT,
    timezone: user?.timezone ?? null,
  };
}

/**
 * Применяет патч `UpdateUserSettings` к пользователю.
 * Поддерживается `dailyGoal` (v0.2 §9) и `timezone` (v0.4 §24/§25).
 *
 * Бросает 404, если пользователь не найден.
 */
export async function updateUserSettings(
  userId: string,
  patch: UpdateUserSettings,
): Promise<UserSettings> {
  const data: { dailyGoal?: number; timezone?: string | null } = {};
  if (patch.dailyGoal !== undefined) {
    data.dailyGoal = patch.dailyGoal;
  }
  if (patch.timezone !== undefined) {
    // Битая IANA-таймзона уронила бы Intl.DateTimeFormat в каждом
    // последующем streak/dashboard-запросе — валидируем на входе.
    if (patch.timezone !== null) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: patch.timezone });
      } catch {
        throw Object.assign(new Error('Invalid timezone'), {
          statusCode: 400,
          code: 'INVALID_TIMEZONE',
        });
      }
    }
    data.timezone = patch.timezone;
  }

  // Если ничего не передано — просто читаем текущее значение.
  if (Object.keys(data).length === 0) {
    return getUserSettings(userId);
  }

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: { dailyGoal: true, timezone: true },
    });
    return { dailyGoal: user.dailyGoal, timezone: user.timezone };
  } catch (err) {
    const prismaCode = (err as { code?: string }).code;
    if (prismaCode === 'P2025') {
      throw Object.assign(new Error('User not found'), { statusCode: 404, code: 'NOT_FOUND' });
    }
    throw err;
  }
}
