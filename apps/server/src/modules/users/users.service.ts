import { prisma } from '../../lib/prisma.js';
import { DAILY_GOAL_DEFAULT } from '@hanzi/shared';
import type { UpdateUserSettings, UserSettings } from '@hanzi/shared';

/**
 * Возвращает пользовательские настройки (сейчас — `dailyGoal`).
 * Если у пользователя поле по какой-то причине не заполнено (не должно
 * быть после миграции), отдаём дефолт.
 *
 * См. PLAN_Features_v0.2 §9.
 */
export async function getUserSettings(userId: string): Promise<UserSettings> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { dailyGoal: true },
  });

  return {
    dailyGoal: user?.dailyGoal && user.dailyGoal > 0 ? user.dailyGoal : DAILY_GOAL_DEFAULT,
  };
}

/**
 * Применяет патч `UpdateUserSettings` к пользователю. Сейчас
 * поддерживается только `dailyGoal` — схема расширяемая.
 *
 * Бросает 404, если пользователь не найден.
 */
export async function updateUserSettings(
  userId: string,
  patch: UpdateUserSettings,
): Promise<UserSettings> {
  const data: { dailyGoal?: number } = {};
  if (patch.dailyGoal !== undefined) {
    data.dailyGoal = patch.dailyGoal;
  }

  // Если ничего не передано — просто читаем текущее значение.
  if (Object.keys(data).length === 0) {
    return getUserSettings(userId);
  }

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: { dailyGoal: true },
    });
    return { dailyGoal: user.dailyGoal };
  } catch (err) {
    const prismaCode = (err as { code?: string }).code;
    if (prismaCode === 'P2025') {
      throw Object.assign(new Error('User not found'), { statusCode: 404, code: 'NOT_FOUND' });
    }
    throw err;
  }
}
