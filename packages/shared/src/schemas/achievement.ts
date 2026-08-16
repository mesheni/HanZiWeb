import { z } from 'zod';

/**
 * Achievements / Badges — система достижений (PLAN_Features_v0.2 §8).
 *
 * Достижения разблокируются автоматически после каждого ответа в
 * `POST /sessions/:id/answer`. Сервер возвращает список только что
 * разблокированных достижений в `unlockedAchievements`, клиент
 * показывает их через toast (`useToast`).
 *
 * Типы (global — проверяются после каждого ответа):
 *  - `first_review`     — первый ответ (review) за всё время.
 *  - `streak_7`         — стрик 7 дней подряд.
 *  - `streak_30`        — стрик 30 дней подряд.
 *  - `streak_100`       — стрик 100 дней подряд.
 *  - `words_100`       — 100 слов в состоянии review или graduated.
 *  - `words_500`       — 500 слов в состоянии review или graduated.
 *  - `words_1000`      — 1000 слов в состоянии review или graduated.
 *  - `hsk1_complete`   — все слова HSK 1 в состоянии graduated.
 *  - `hsk2_complete`   — все слова HSK 2 в состоянии graduated.
 *  - `hsk3_complete`   — все слова HSK 3 в состоянии graduated.
 *  - `reviews_1k`      — 1 000 ответов (SessionAnswer) за всё время.
 *  - `reviews_10k`     — 10 000 ответов за всё время.
 *  - `reviews_50k`     — 50 000 ответов за всё время.
 *  - `speed_demon`     — 50+ ответов в одной сессии.
 *  - `early_bird`      — хотя бы одна сессия до 8:00.
 *  - `night_owl`       — хотя бы одна сессия после 0:00.
 *  - `perfect_session`  — все ответы в сессии = Easy (4).
 *  - `perfect_5`       — 5 идеальных сессий за всё время.
 *  - `xp_1000`         — набрать 1 000 XP.
 *  - `xp_5000`         — набрать 5 000 XP.
 *  - `xp_10000`        — набрать 10 000 XP.
 */
export const AchievementTypeSchema = z.enum([
  'first_review',
  'streak_7',
  'streak_30',
  'streak_100',
  'words_100',
  'words_500',
  'words_1000',
  'hsk1_complete',
  'hsk2_complete',
  'hsk3_complete',
  'reviews_1k',
  'reviews_10k',
  'reviews_50k',
  'speed_demon',
  'early_bird',
  'night_owl',
  'perfect_session',
  'perfect_5',
  'xp_1000',
  'xp_5000',
  'xp_10000',
]);
export type AchievementType = z.infer<typeof AchievementTypeSchema>;

export type AchievementIconName =
  | 'Flame'
  | 'BookCheck'
  | 'GraduationCap'
  | 'Trophy'
  | 'Sparkles'
  | 'Rocket'
  | 'Star'
  | 'Target'
  | 'Zap'
  | 'Sun'
  | 'Moon'
  | 'Heart'
  | 'PenTool'
  | 'Medal'
  | 'Sword'
  | 'Shield'
  | 'Hourglass'
  | 'Feather'
  | 'Gem'
  | 'Diamond'
  | 'Crown';

/** Метаданные типа достижения (для UI). */
export interface AchievementMeta {
  type: AchievementType;
  /** Локализованное название. */
  title: string;
  /** Краткое описание условия. */
  description: string;
  /** Иконка (lucide-react name). */
  icon: AchievementIconName;
}

/**
 * Каталог всех достижений с метаданными для UI.
 * Порядок — порядок отображения.
 */
export const ACHIEVEMENT_CATALOG: readonly AchievementMeta[] = [
  {
    type: 'first_review',
    title: 'Первый шаг',
    description: 'Завершите первое повторение',
    icon: 'Star',
  },
  {
    type: 'streak_7',
    title: 'Неделя подряд',
    description: '7 дней стрика — занимайся каждый день',
    icon: 'Flame',
  },
  {
    type: 'streak_30',
    title: 'Месяц подряд',
    description: '30 дней стрика — дисциплина формируется',
    icon: 'Sword',
  },
  {
    type: 'streak_100',
    title: 'Стопроцентный',
    description: '100 дней стрика — настоящее мастерство',
    icon: 'Shield',
  },
  {
    type: 'words_100',
    title: '100 слов',
    description: '100 слов в состоянии review или graduated',
    icon: 'BookCheck',
  },
  {
    type: 'words_500',
    title: '500 слов',
    description: '500 слов — уверенный словарный запас',
    icon: 'Target',
  },
  {
    type: 'words_1000',
    title: '1000 слов',
    description: '1000 слов — серьёзный уровень',
    icon: 'Rocket',
  },
  {
    type: 'hsk1_complete',
    title: 'HSK 1 пройден',
    description: 'Все слова HSK 1 в состоянии graduated',
    icon: 'GraduationCap',
  },
  {
    type: 'hsk2_complete',
    title: 'HSK 2 пройден',
    description: 'Все слова HSK 2 в состоянии graduated',
    icon: 'Medal',
  },
  {
    type: 'hsk3_complete',
    title: 'HSK 3 пройден',
    description: 'Все слова HSK 3 в состоянии graduated',
    icon: 'Trophy',
  },
  {
    type: 'reviews_1k',
    title: '1 000 ревью',
    description: '1 000 ответов за всё время',
    icon: 'Zap',
  },
  {
    type: 'reviews_10k',
    title: '10 000 ревью',
    description: '10 000 ответов за всё время',
    icon: 'Trophy',
  },
  {
    type: 'reviews_50k',
    title: '50 000 ревью',
    description: '50 000 ответов — настоящий подвиг',
    icon: 'Crown',
  },
  {
    type: 'speed_demon',
    title: 'Спид-демон',
    description: '50+ ответов в одной сессии',
    icon: 'Zap',
  },
  {
    type: 'early_bird',
    title: 'Ранняя пташка',
    description: 'Начните занятие до 8:00 утра',
    icon: 'Sun',
  },
  {
    type: 'night_owl',
    title: 'Ночная сова',
    description: 'Занимайтесь после полуночи',
    icon: 'Moon',
  },
  {
    type: 'perfect_session',
    title: 'Идеальная сессия',
    description: 'Все ответы в сессии — Easy',
    icon: 'Sparkles',
  },
  {
    type: 'perfect_5',
    title: '5 идеальных',
    description: '5 сессий, где все ответы — Easy',
    icon: 'Heart',
  },
  {
    type: 'xp_1000',
    title: '1 000 XP',
    description: 'Наберите 1 000 очков опыта',
    icon: 'Gem',
  },
  {
    type: 'xp_5000',
    title: '5 000 XP',
    description: 'Наберите 5 000 очков опыта',
    icon: 'Diamond',
  },
  {
    type: 'xp_10000',
    title: '10 000 XP',
    description: 'Наберите 10 000 очков опыта — настоящий мастер',
    icon: 'Crown',
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
