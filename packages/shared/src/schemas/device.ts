import { z } from 'zod';

export const RegisterDeviceSchema = z.object({
  fcmToken: z.string().min(1),
  p256dh: z.string().default(''),
  auth: z.string().default(''),
  platform: z.string().default('web'),
});

export type RegisterDevice = z.infer<typeof RegisterDeviceSchema>;

export const UpdateNotificationSettingsSchema = z.object({
  notificationEnabled: z.boolean(),
  notificationTime: z.enum(['morning', 'evening', 'both']).default('morning'),
  notificationFrequency: z.number().int().min(1).max(24).default(1),
});

export type UpdateNotificationSettings = z.infer<typeof UpdateNotificationSettingsSchema>;
