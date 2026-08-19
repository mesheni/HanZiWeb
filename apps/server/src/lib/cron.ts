import cron from 'node-cron';
import webpush from 'web-push';
import { prisma } from './prisma.js';
import { loadConfig } from '../config.js';

/**
 * Минимальный логгер для cron-джобов. Структурно совместим с
 * `FastifyBaseLogger` (pino): `app.log` передаётся из `index.ts`
 * (F27 — structured observability), в тестах — vi.fn()-объект.
 */
export interface CronLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

let initialized = false;

export function initCronJobs(logger: CronLogger) {
  const config = loadConfig();

  if (!config.VAPID_PUBLIC_KEY || !config.VAPID_PRIVATE_KEY) {
    logger.warn({ component: 'cron' }, 'VAPID keys not configured — push notifications disabled');
    return;
  }

  webpush.setVapidDetails(config.VAPID_SUBJECT, config.VAPID_PUBLIC_KEY, config.VAPID_PRIVATE_KEY);

  if (initialized) return;
  initialized = true;

  cron.schedule('0 * * * *', () => {
    sendDueReminders(logger).catch((err) => {
      logger.error({ component: 'cron', job: 'sendDueReminders', err }, 'Cron job failed');
    });
  });

  cron.schedule('30 * * * *', () => {
    sendInactiveReminders(logger).catch((err) => {
      logger.error({ component: 'cron', job: 'sendInactiveReminders', err }, 'Cron job failed');
    });
  });

  logger.info({ component: 'cron', jobs: 2 }, 'Cron jobs initialized');
}

function localHourIn(timezone: string | null, now: Date): number | null {
  try {
    return Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone ?? 'UTC',
        hour: 'numeric',
        hourCycle: 'h23',
      }).format(now),
    );
  } catch {
    // Битая таймзона в старых записях — пропускаем пользователя.
    return null;
  }
}

export async function sendDueReminders(logger: CronLogger) {
  const config = loadConfig();
  if (!config.VAPID_PUBLIC_KEY) return;

  const now = new Date();

  const users = await prisma.user.findMany({
    where: {
      notificationEnabled: true,
      devices: { some: {} },
    },
    include: { devices: true },
  });
  if (users.length === 0) return;

  // Один groupBy вместо COUNT'а на каждого пользователя (N+1).
  const dueCounts = await prisma.userWordProgress.groupBy({
    by: ['userId'],
    where: {
      userId: { in: users.map((u) => u.id) },
      dueDate: { lte: now },
      state: { in: ['learning', 'review'] },
    },
    _count: true,
  });
  const dueByUser = new Map(dueCounts.map((row) => [row.userId, row._count]));

  let pushes = 0;
  for (const user of users) {
    const wordsDueToday = dueByUser.get(user.id) ?? 0;
    if (wordsDueToday === 0) continue;

    // Окно morning/evening — по локальным часам пользователя, а не сервера.
    const localHour = localHourIn(user.timezone, now);
    if (localHour === null) continue;
    const isMorning = localHour >= 7 && localHour < 12;
    const isEvening = localHour >= 18 && localHour < 23;

    const timePref = user.notificationTime;
    if (timePref === 'morning' && !isMorning) continue;
    if (timePref === 'evening' && !isEvening) continue;
    if (!isMorning && !isEvening) continue;

    const payload = JSON.stringify({
      title: 'HanZi — Время повторения!',
      body: `У вас ${wordsDueToday} слов для повторения сегодня.`,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      url: '/',
    });

    const sendPromises = user.devices.map(async (device) => {
      try {
        await webpush.sendNotification(
          { endpoint: device.fcmToken, keys: { p256dh: device.p256dh, auth: device.auth } },
          payload,
        );
        pushes += 1;
      } catch (err: unknown) {
        const error = err as { statusCode?: number };
        if (error.statusCode === 404 || error.statusCode === 410) {
          await prisma.userDevice.deleteMany({ where: { id: device.id } });
          logger.info(
            {
              component: 'cron',
              job: 'sendDueReminders',
              deviceId: device.id,
              statusCode: error.statusCode,
            },
            'Push device removed (gone)',
          );
        } else {
          logger.error(
            { component: 'cron', job: 'sendDueReminders', deviceId: device.id, err },
            'Push failed',
          );
        }
      }
    });

    await Promise.allSettled(sendPromises);
  }
  logger.info(
    { component: 'cron', job: 'sendDueReminders', users: users.length, pushes },
    'Due reminders sent',
  );
}

export async function sendInactiveReminders(logger: CronLogger) {
  const config = loadConfig();
  if (!config.VAPID_PUBLIC_KEY) return;

  const thresholdHours = 24;
  const cutoff = new Date(Date.now() - thresholdHours * 60 * 60 * 1000);

  const users = await prisma.user.findMany({
    where: {
      notificationEnabled: true,
      lastActiveDate: { lt: cutoff },
      devices: { some: {} },
    },
    include: { devices: true },
  });

  let pushes = 0;
  for (const user of users) {
    const payload = JSON.stringify({
      title: 'HanZi — Не забывайте про слова!',
      body: 'Вы давно не заходили. Пора повторить несколько слов!',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      url: '/',
    });

    const sendPromises = user.devices.map(async (device) => {
      try {
        await webpush.sendNotification(
          { endpoint: device.fcmToken, keys: { p256dh: device.p256dh, auth: device.auth } },
          payload,
        );
        pushes += 1;
      } catch (err: unknown) {
        const error = err as { statusCode?: number };
        if (error.statusCode === 404 || error.statusCode === 410) {
          await prisma.userDevice.deleteMany({ where: { id: device.id } });
          logger.info(
            {
              component: 'cron',
              job: 'sendInactiveReminders',
              deviceId: device.id,
              statusCode: error.statusCode,
            },
            'Push device removed (gone)',
          );
        } else {
          logger.error(
            { component: 'cron', job: 'sendInactiveReminders', deviceId: device.id, err },
            'Push failed',
          );
        }
      }
    });

    await Promise.allSettled(sendPromises);
  }
  logger.info(
    { component: 'cron', job: 'sendInactiveReminders', users: users.length, pushes },
    'Inactive reminders sent',
  );
}
