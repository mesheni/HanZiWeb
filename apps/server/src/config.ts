import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  // Публичный origin web-клиента (для редиректа после OAuth).
  // По умолчанию совпадает с CORS_ORIGIN.
  WEB_PUBLIC_URL: z.string().optional(),

  // --- Audio (Google Cloud TTS) ---
  // Путь к JSON-ключу сервисного аккаунта Google Cloud.
  // Если не задан — эндпоинт /audio/generate вернёт 501.
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  // GCS-бакет для загрузки сгенерированных mp3.
  // Если не задан — аудио сохраняется локально в `audioStoragePath`.
  GCS_BUCKET_NAME: z.string().optional(),
  // Локальная директория для dev-хранения аудио (по умолчанию ./storage/audio).
  AUDIO_STORAGE_PATH: z.string().default('./storage/audio'),
  // Публичный base URL, по которому клиент может скачать локальное аудио.
  // В dev это обычно http://localhost:3001/audio/files
  AUDIO_PUBLIC_BASE_URL: z.string().default('http://localhost:3001/audio/files'),

  // --- Push Notifications (Web Push / VAPID) ---
  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  VAPID_SUBJECT: z.string().default('mailto:admin@hanzi.app'),

  // --- OAuth (PLAN_Features_v0.2 §13) ---
  // Каждый провайдер опционален: если client_id+client_secret не заданы,
  // соответствующая кнопка в UI даст понятное сообщение «не настроено».
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  APPLE_OAUTH_CLIENT_ID: z.string().optional(),
  APPLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  YANDEX_OAUTH_CLIENT_ID: z.string().optional(),
  YANDEX_OAUTH_CLIENT_SECRET: z.string().optional(),

  // --- Analytics (PLAN_Features_v0.2 §14: PostHog) ---
  // API-ключ проекта PostHog (Project API Key, НЕ personal API key).
  // Если не задан — /ingest работает как no-op (200/204) и события
  // отбрасываются, чтобы dev-окружение работало без внешних сервисов.
  POSTHOG_API_KEY: z.string().optional(),
  // Host PostHog. По умолчанию — облако PostHog (eu/host depending on region).
  POSTHOG_HOST: z.string().default('https://eu.i.posthog.com'),

  // --- Email (PLAN_Features_v0.3 §2: password reset) ---
  // Если SMTP_* не заданы — /auth/forgot-password будет отвечать 503
  // (EMAIL_NOT_CONFIGURED), чтобы dev-окружение не пыталось отправлять
  // письма на несуществующий сервер.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  // Использовать TLS (true для 465, false для 587+STARTTLS).
  SMTP_SECURE: z.coerce.boolean().default(false),
  // Адрес отправителя (From:). Должен быть валидным для SMTP-сервера.
  SMTP_FROM: z.string().default('HanZi <no-reply@hanzi.app>'),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(): Config {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:', result.error.flatten());
    process.exit(1);
  }
  return result.data;
}

/** Публичный origin web-клиента для редиректов после OAuth. */
export function getWebPublicUrl(cfg: Config = loadConfig()): string {
  return cfg.WEB_PUBLIC_URL ?? cfg.CORS_ORIGIN;
}
