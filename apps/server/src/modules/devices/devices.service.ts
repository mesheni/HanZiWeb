import { prisma } from '../../lib/prisma.js';
import type { RegisterDevice, UpdateNotificationSettings } from '@hanzi/shared';

export async function registerDevice(userId: string, input: RegisterDevice) {
  const existing = await prisma.userDevice.findUnique({
    where: { fcmToken: input.fcmToken },
  });

  if (existing) {
    if (existing.userId !== userId) {
      await prisma.userDevice.update({
        where: { fcmToken: input.fcmToken },
        data: { userId, platform: input.platform, p256dh: input.p256dh, auth: input.auth },
      });
    }
    return { registered: true };
  }

  await prisma.userDevice.create({
    data: {
      userId,
      fcmToken: input.fcmToken,
      p256dh: input.p256dh,
      auth: input.auth,
      platform: input.platform,
    },
  });

  return { registered: true };
}

export async function unregisterDevice(userId: string, fcmToken: string) {
  await prisma.userDevice.deleteMany({
    where: { userId, fcmToken },
  });
  return { unregistered: true };
}

export async function updateNotificationSettings(userId: string, input: UpdateNotificationSettings) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      notificationEnabled: input.notificationEnabled,
      notificationTime: input.notificationTime,
      notificationFrequency: input.notificationFrequency,
    },
    select: {
      notificationEnabled: true,
      notificationTime: true,
      notificationFrequency: true,
    },
  });
  return user;
}

export async function getNotificationSettings(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      notificationEnabled: true,
      notificationTime: true,
      notificationFrequency: true,
    },
  });
  return user;
}
