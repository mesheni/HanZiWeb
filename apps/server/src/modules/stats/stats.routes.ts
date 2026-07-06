import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LeaderboardQuerySchema, ProgressImportRequestSchema } from '@hanzi/shared';
import * as statsService from './stats.service.js';

const ExportFormatQuerySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
});

export async function statsRoutes(app: FastifyInstance) {
  /** GET /stats/overview — общая статистика пользователя */
  app.get('/overview', { preHandler: [app.authenticate] }, async (request, reply) => {
    const stats = await statsService.getOverview(request.userId);
    return reply.send({ success: true, data: stats });
  });

  /** GET /stats/dashboard — данные для главного дашборда */
  app.get('/dashboard', { preHandler: [app.authenticate] }, async (request, reply) => {
    const data = await statsService.getDashboard(request.userId);
    return reply.send({ success: true, data });
  });

  /** GET /stats/activity?year=2026 — календарь активности (год) */
  app.get<{ Querystring: { year?: string; month?: string } }>(
    '/activity',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const year = request.query.year ? parseInt(request.query.year, 10) : new Date().getFullYear();
      const month = request.query.month ? parseInt(request.query.month, 10) : undefined;
      const data = await statsService.getActivityData(request.userId, year, month);
      return reply.send({ success: true, data });
    },
  );

  /** GET /stats/streak — вычисление и обновление daily streak */
  app.get('/streak', { preHandler: [app.authenticate] }, async (request, reply) => {
    const streak = await statsService.getUserStreak(request.userId);
    return reply.send({ success: true, data: streak });
  });

  /**
   * GET /stats/leaderboard?period=week|all&limit=100
   * Топ пользователей по XP/стрику.
   * См. PLAN_Features_v0.2 §7.
   */
  app.get<{ Querystring: { period?: string; limit?: string } }>(
    '/leaderboard',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const query = LeaderboardQuerySchema.parse(request.query);
      const data = await statsService.getLeaderboard(
        request.userId,
        query.period,
        query.limit,
      );
      return reply.send({ success: true, data });
    },
  );

  /**
   * GET /stats/study-map
   * Карта изучения — прогресс по каждой колоде (PLAN_Features_v0.3 §5).
   * Возвращает `StudyMapResponseSchema`:
   * `{ decks: DeckProgress[], totalWords, totalLearned, overallPercentage }`.
   * Каждая `DeckProgress` содержит `deckId`, `deckName`, `totalWords`,
   * `learnedWords` (state = graduated), `percentage` (0..100) и
   * `color` (low | medium | high | complete). Колоды отсортированы:
   * сначала системные (HSK), потом кастомные; внутри групп — по
   * убыванию процента.
   */
  app.get('/study-map', { preHandler: [app.authenticate] }, async (request, reply) => {
    const data = await statsService.getStudyMap(request.userId);
    return reply.send({ success: true, data });
  });

  /** POST /stats/reset-progress — полный сброс прогресса */
  app.post('/reset-progress', { preHandler: [app.authenticate] }, async (request, reply) => {
    const result = await statsService.resetProgress(request.userId);
    return reply.send({ success: true, data: result });
  });

  /**
   * GET /stats/export?format=json|csv
   * Экспорт всего прогресса пользователя (`UserWordProgress`) для
   * бэкапа или аналитики.
   *
   * - `format=json` (по умолчанию) — JSON-файл `progress-<date>.json`
   *   с обёрткой `ProgressExportSchema` (version/exportedAt/userId/progress[]).
   * - `format=csv`  — CSV-файл `progress-<date>.csv` с заголовком
   *   `wordId,state,stability,difficulty,reps,dueDate,lastReviewDate`.
   *
   * См. PLAN_Features_v0.2 §10.
   */
  app.get<{ Querystring: { format?: string } }>(
    '/export',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { format } = ExportFormatQuerySchema.parse(request.query);
      const data = await statsService.buildProgressExport(request.userId);
      const dateStr = data.exportedAt.slice(0, 10);

      if (format === 'csv') {
        const csv = statsService.toProgressCsv(data.progress);
        const filename = `hanzi-progress-${dateStr}.csv`;
        return reply
          .header('Content-Type', 'text/csv; charset=utf-8')
          .header('Content-Disposition', `attachment; filename="${filename}"`)
          .send(csv);
      }

      const filename = `hanzi-progress-${dateStr}.json`;
      return reply
        .header('Content-Type', 'application/json; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(JSON.stringify(data, null, 2));
    },
  );

  /**
   * POST /stats/import
   * Восстановление прогресса из JSON-бэкапа.
   * Тело — `ProgressImportRequestSchema`:
   * `{ mode: "merge" | "replace", progress: ProgressRecord[] }`.
   *
   * - `merge`   — добавляет новые записи и обновляет существующие.
   * - `replace` — сначала удаляет весь текущий прогресс, потом вставляет.
   *
   * Записи с неизвестным `wordId` молча пропускаются.
   * См. PLAN_Features_v0.2 §10.
   */
  app.post('/import', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = ProgressImportRequestSchema.parse(request.body);
    const result = await statsService.applyProgressImport(
      request.userId,
      body.mode,
      body.progress,
    );
    return reply.send({ success: true, data: result });
  });
}
