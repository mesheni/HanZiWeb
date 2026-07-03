import { z } from 'zod';

/**
 * Achievements / Badges — система достижений (PLAN_Features_v0.2 §8).
 *
 * Достижения разблокируются автоматически после каждого ответа в
 * `POST /sessions/:id/answer`. Сервер возвращает список только что
 * разблокированных достижений в `unlockedAchievements`, клиент
 * показывает их через toast (`useToast`).
 *
 * Типы:
 *  - `streak_7`        — стрик 7 дней подряд.
 *  - `words_100`       — 100 выученных слов (graduated или review).
 *  - `hsk1_complete`   — все слова HSK 1 в состоянии graduated.
 *  - `reviews_10k`     — 10 000 ответов (SessionAnswer) за всё время.
 *  - `perfect_session` — все ответы в сессии = Easy (4).
 */
export const AchievementTypeSchema = z.enum([
  'streak_7',
  'words_100',
  'hsk1_complete',
  'reviews_10k',
  'perfect_session',
]);
export type AchievementType = z.infer<typeof AchievementTypeSchema>;

/** Метаданные типа достижения (для UI). */
export interface AchievementMeta {
  type: AchievementType;
  /** Локализованное название. */
  title: string;
  /** Краткое описание условия. */
  description: string;
  /** Иконка (lucide-react name). */
  icon: 'Flame' | 'BookCheck' | 'GraduationCap' | 'Trophy' | 'Sparkles';
}

/**
 * Каталог всех достижений с метаданными для UI.
 * Порядок — порядок отображения.
 */
export const ACHIEVEMENT_CATALOG: readonly AchievementMeta[] = [
  {
    type: 'streak_7',
    title: 'Неделя подряд',
    description: '7 дней стрика — занимайся каждый день',
    icon: 'Flame',
  },
  {
    type: 'words_100',
    title: '100 слов',
    description: '100 слов в состоянии review или graduated',
    icon: 'BookCheck',
  },
  {
    type: 'hsk1_complete',
    title: 'HSK 1 пройден',
    description: 'Все слова HSK 1 в состоянии graduated',
    icon: 'GraduationCap',
  },
  {
    type: 'reviews_10k',
    title: '10 000 ревью',
    description: '10 000 ответов за всё время',
    icon: 'Trophy',
  },
  {
    type: 'perfect_session',
    title: 'Идеальная сессия',
    description: 'Все ответы в сессии — Easy',
    icon: 'Sparkles',
  },
] as const;

/** Одно разблокированное достижение. */
export const UserAchievementSchema = z.object({
  id: z.string().uuid(),
  type: AchievementTypeSchema,
  unlockedAt: z.string().datetime(),
});
export type UserAchievement = z.infer<typeof UserAchievementSchema>;

/** Ответ `GET /achievements`. */
export const UserAchievementsResponseSchema = z.object({
  achievements: z.array(UserAchievementSchema),
});
export type UserAchievementsResponse = z.infer<typeof UserAchievementsResponseSchema>;
