/**
 * Скрипт пакетной генерации аудио для всех слов без audio_url.
 *
 * Запуск:
 *   pnpm --filter @hanzi/server exec tsx scripts/generate-audio.ts
 *   (или: pnpm --filter @hanzi/server run audio:generate)
 *
 * Требует GOOGLE_APPLICATION_CREDENTIALS в окружении.
 * Опционально принимает --limit=N для ограничения количества слов.
 */
import { generateAudioForAllMissingWords } from '../src/modules/audio/audio.service.js';

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1] ?? '1000', 10) : 1000;

  console.log(`Starting batch audio generation (limit: ${limit})...\n`);

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('❌ GOOGLE_APPLICATION_CREDENTIALS is not set.');
    console.error('   Set it to the path of your Google Cloud service account JSON key.');
    console.error('   See .env.example for details.');
    process.exit(1);
  }

  const result = await generateAudioForAllMissingWords({ limit });

  console.log('\nBatch audio generation complete.');
  console.log(`  Total words scanned: ${result.total}`);
  console.log(`  Generated:           ${result.generated}`);
  console.log(`  Failed:              ${result.failed}`);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('Batch audio generation failed:', err);
    process.exit(1);
  });
