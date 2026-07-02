import cron from 'node-cron';
import webpush from 'web-push';
import { prisma } from './prisma.js';
import { loadConfig } from '../config.js';

let initialized = false;

export function initCronJobs() {
  const config = loadConfig();

  if (!config.VAPID_PUBLIC_KEY || !config.VAPID_PRIVATE_KEY) {
    console.warn('VAPID keys not configured — push notifications disabled');
    return;
  }

  webpush.setVapidDetails(
    config.VAPID_SUBJECT,
    config.VAPID_PUBLIC_KEY,
    config.VAPID_PRIVATE_KEY,
  );

  if (initialized) return;
  initialized = true;

  cron.schedule('0 * * * *', () => {
    sendDueReminders().catch((err) => {
      console.error('Cron: sendDueReminders failed:', err);
    });
  });

  cron.schedule('30 * * * *', () => {
    sendInactiveReminders().catch((err) => {
      console.error('Cron: sendInactiveReminders failed:', err);
    });
  });

  console.log('Cron jobs initialized');
}

async function sendDueReminders() {
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
      } catch (err: unknown) {
        const error = err as { statusCode?: number };
        if (error.statusCode === 404 || error.statusCode === 410) {
          await prisma.userDevice.deleteMany({ where: { id: device.id } });
        } else {
          console.error(`Push failed for device ${device.id}:`, err);
        }
      }
    });

    await Promise.allSettled(sendPromises);
  }
}

async function sendInactiveReminders() {
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
      } catch (err: unknown) {
        const error = err as { statusCode?: number };
        if (error.statusCode === 404 || error.statusCode === 410) {
          await prisma.userDevice.deleteMany({ where: { id: device.id } });
        } else {
          console.error(`Push failed for device ${device.id}:`, err);
        }
      }
    });

    await Promise.allSettled(sendPromises);
  }
}
