import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as audioService from './audio.service.js';
import * as analyticsService from '../analytics/analytics.service.js';

const GenerateAudioSchema = z.object({
  text: z.string().min(1).max(200),
  language: z.enum(['zh-CN', 'zh-TW', 'en-US', 'ru-RU']).default('zh-CN'),
  wordId: z.string().uuid().optional(),
});

export async function audioRoutes(app: FastifyInstance) {
  /**
   * POST /audio/generate
   * Принимает { text, language, wordId? }, генерирует mp3 через Google TTS,
   * сохраняет URL в Words.audio_url (если указан wordId), возвращает URL.
   */
  app.post('/generate', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = GenerateAudioSchema.parse(request.body);
    const { text, language, wordId } = body;

    try {
      // Если указан wordId — используем generateAudioForWord, который сам сохранит URL в БД
      const result = wordId
        ? await audioService.generateAudioForWord(wordId, language)
        : await audioService.generateAudio(text, language);

      // Аналитика: событие `audio_generated` с источником (cache | generated).
      // Не блокирует ответ даже при сбое аналитики.
      void analyticsService
        .forward(
          {
            events: [
              {
                name: 'audio_generated',
                properties: {
                  source: result.source,
                  language,
                  has_word_id: wordId != null,
                },
              },
            ],
          },
          { userId: request.userId, lib: 'hanzi-server' },
        )
        .catch((err) => request.log.warn({ err }, 'analytics forward failed'));

      return reply.send({
        success: true,
        data: { audioUrl: result.audioUrl, source: result.source },
      });
    } catch (err) {
      const e = err as { statusCode?: number; code?: string; message?: string };
      const status = e.statusCode ?? 500;
      return reply.status(status).send({
        success: false,
        error: { code: e.code ?? 'AUDIO_ERROR', message: e.message ?? 'Audio generation failed' },
      });
    }
  });

  /**
   * GET /audio/files/:fileName
   * Раздаёт локально сохранённые аудиофайлы (только для dev-хранилища).
   */
  app.get<{ Params: { fileName: string } }>('/files/:fileName', async (request, reply) => {
    const file = audioService.readAudioFile(request.params.fileName);
    if (!file) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Audio file not found' },
      });
    }
    reply.type(file.mime);
    return reply.send(file.data);
  });
}
