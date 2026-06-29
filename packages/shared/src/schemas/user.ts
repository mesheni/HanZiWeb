import { z } from 'zod';

/**
 * Пользователь приложения.
 */
export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  xp: z.number().int().nonnegative().default(0),
  currentStreak: z.number().int().nonnegative().default(0),
  subscriptionTier: z.enum(['free', 'pro']).default('free'),
  subscriptionExpiresAt: z.string().datetime().nullable().default(null),
  lastActiveDate: z.string().datetime().nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type User = z.infer<typeof UserSchema>;

/** Публичный профиль (без email, для отображения) */
export const PublicUserSchema = UserSchema.omit({ email: true });
export type PublicUser = z.infer<typeof PublicUserSchema>;
