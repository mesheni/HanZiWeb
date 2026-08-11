import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';

// F27: cron-джобы без единого теста. Мокаем prisma/web-push/node-cron —
// проверяем бизнес-логику выбора получателей и обработку ошибок пушей.
vi.mock('./prisma.js', () => ({
  prisma: {
    user: { findMany: vi.fn() },
    userWordProgress: { count: vi.fn() },
    userDevice: { deleteMany: vi.fn() },
  },
}));

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

vi.mock('node-cron', () => ({
  default: { schedule: vi.fn() },
}));

import webpush from 'web-push';
import cron from 'node-cron';
import { prisma } from './prisma.js';
import { initCronJobs, sendDueReminders, sendInactiveReminders } from './cron.js';

// Типизация моков — как в tests.generation.test.ts: каст к vi.fn,
// чтобы mockResolvedValue/mockRejectedValue принимали тестовые объекты.
const sendNotification = webpush.sendNotification as ReturnType<typeof vi.fn>;
const schedule = cron.schedule as ReturnType<typeof vi.fn>;
const findUsers = prisma.user.findMany as ReturnType<typeof vi.fn>;
const countDue = prisma.userWordProgress.count as ReturnType<typeof vi.fn>;
const deleteDevices = prisma.userDevice.deleteMany as ReturnType<typeof vi.fn>;

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

const device = (id: string, fcmToken: string) => ({
  id,
  fcmToken,
  p256dh: 'p256',
  auth: 'auth',
  platform: 'web',
});

const user = (id: string, overrides: Partial<Record<string, unknown>> = {}) => ({
  id,
  notificationEnabled: true,
  notificationTime: 'morning',
  notificationFrequency: 1,
  devices: [device(`dev-${id}`, `tok-${id}`)],
  ...overrides,
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

afterAll(() => {
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_SUBJECT;
});

describe('initCronJobs (F27)', () => {
  beforeEach(() => {
    process.env.VAPID_PUBLIC_KEY = '';
    process.env.VAPID_PRIVATE_KEY = '';
  });

  it('без VAPID-ключей — предупреждение, расписание не создаётся', () => {
    const logger = makeLogger();
    initCronJobs(logger);
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('с VAPID-ключами — два джоба; повторный вызов не дублирует', () => {
    process.env.VAPID_PUBLIC_KEY = 'pub';
    process.env.VAPID_PRIVATE_KEY = 'priv';
    const logger = makeLogger();
    initCronJobs(logger);
    initCronJobs(logger);
    expect(schedule).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ jobs: 2 }),
      'Cron jobs initialized',
    );
  });
});

describe('sendDueReminders (F27)', () => {
  beforeEach(() => {
    process.env.VAPID_PUBLIC_KEY = 'pub';
    process.env.VAPID_PRIVATE_KEY = 'priv';
  });

  it('вне утреннего/вечернего окна — запрос к БД не делается', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T15:00:00'));
    const logger = makeLogger();
    await sendDueReminders(logger);
    expect(findUsers).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('утром шлёт только morning-пользователям с due-словами', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T10:00:00'));
    findUsers.mockResolvedValue([user('u1'), user('u2', { notificationTime: 'evening' })]);
    countDue.mockResolvedValue(3);

    const logger = makeLogger();
    await sendDueReminders(logger);

    expect(findUsers).toHaveBeenCalledOnce();
    expect(countDue).toHaveBeenCalledTimes(1);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const sent = sendNotification.mock.calls[0]![0] as { endpoint: string };
    expect(sent.endpoint).toBe('tok-u1');
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ job: 'sendDueReminders', users: 2, pushes: 1 }),
      'Due reminders sent',
    );
  });

  it('0 due-слов — push не отправляется', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T10:00:00'));
    findUsers.mockResolvedValue([user('u1')]);
    countDue.mockResolvedValue(0);

    await sendDueReminders(makeLogger());

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('устройство с 404/410 удаляется из БД, остальные получают push', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T10:00:00'));
    findUsers.mockResolvedValue([
      { ...user('u1'), devices: [device('d-gone', 'tok-gone'), device('d-ok', 'tok-ok')] },
    ]);
    countDue.mockResolvedValue(2);
    sendNotification.mockRejectedValueOnce({ statusCode: 410 }).mockResolvedValueOnce(undefined);

    await sendDueReminders(makeLogger());

    expect(deleteDevices).toHaveBeenCalledWith({ where: { id: 'd-gone' } });
    expect(sendNotification).toHaveBeenCalledTimes(2);
    const second = sendNotification.mock.calls[1]![0] as { endpoint: string };
    expect(second.endpoint).toBe('tok-ok');
  });

  it('сетевая ошибка (без 404/410) — устройство остаётся, ошибка логируется', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T10:00:00'));
    findUsers.mockResolvedValue([{ ...user('u1'), devices: [device('d-err', 'tok-err')] }]);
    countDue.mockResolvedValue(1);
    sendNotification.mockRejectedValueOnce(new Error('network'));

    const logger = makeLogger();
    await sendDueReminders(logger);

    expect(deleteDevices).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ job: 'sendDueReminders', deviceId: 'd-err' }),
      'Push failed',
    );
  });
});

describe('sendInactiveReminders (F27)', () => {
  beforeEach(() => {
    process.env.VAPID_PUBLIC_KEY = 'pub';
    process.env.VAPID_PRIVATE_KEY = 'priv';
  });

  it('шлёт неактивным пользователям и удаляет gone-устройства', async () => {
    findUsers.mockResolvedValue([
      { ...user('u1'), devices: [device('d-gone', 'tok-gone'), device('d-ok', 'tok-ok')] },
    ]);
    sendNotification.mockRejectedValueOnce({ statusCode: 404 }).mockResolvedValueOnce(undefined);

    await sendInactiveReminders(makeLogger());

    expect(deleteDevices).toHaveBeenCalledWith({ where: { id: 'd-gone' } });
    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it('без VAPID-ключа — не обращается к БД', async () => {
    process.env.VAPID_PUBLIC_KEY = '';
    await sendInactiveReminders(makeLogger());
    expect(findUsers).not.toHaveBeenCalled();
  });
});
