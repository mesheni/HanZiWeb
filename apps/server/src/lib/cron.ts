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

export async function sendDueReminders(logger: CronLogger) {
  const config = loadConfig();
  if (!config.VAPID_PUBLIC_KEY) return;

  const now = new Date();
  const hour = now.getHours();

  const isMorning = hour >= 7 && hour < 12;
  const isEvening = hour >= 18 && hour < 23;

  if (!isMorning && !isEvening) return;

  const users = await prisma.user.findMany({
    where: {
      notificationEnabled: true,
      devices: { some: {} },
    },
    include: { devices: true },
  });

  let pushes = 0;
  for (const user of users) {
    const timePref = user.notificationTime;
    if (timePref === 'morning' && !isMorning) continue;
    if (timePref === 'evening' && !isEvening) continue;

    const wordsDueToday = await prisma.userWordProgress.count({
      where: {
        userId: user.id,
        dueDate: { lte: now },
        state: { in: ['learning', 'review'] },
      },
    });

    if (wordsDueToday === 0) continue;

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
