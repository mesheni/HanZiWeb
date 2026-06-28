import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

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
