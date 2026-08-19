# План исправлений найденных багов

## Волна 1 — критичные (потеря данных / блокировка пользователей)

1. **`apps/web/src/db/sync.ts`** — переделать `flushChanges()`: убрать «молчаливый выход» при `isSyncing`. Воспроизвести паттерн из `packages/mobile-sdk/src/sync/SyncEngine.ts` (`flushPromise` + последующий trailing-flush, если за время полёта пришли новые изменения). Добавить тест на сценарий «enqueue во время полёта flush → изменение доходит до сервера».

2. **`apps/server/src/index.ts`** — вынести `/auth/refresh` из общего auth-скопа rate-limit (20/мин): отдельный лимит для refresh (например 120/мин) или исключение. Поправить устаревший комментарий «5 requests/minute».

3. **`apps/web/src/screens/SettingsScreen.tsx` (upsertWords) и `apps/web/src/screens/HomeScreen.tsx` (handleDownloadOffline)** — заменить сырые `db.words.upsert` на merge через `cacheWordListItems` из `db/wordsCache.ts`, чтобы сохранялись `audioUrl`, `mnemonic`, `examples`, `tags`.

## Волна 2 — UX-баги

4. **`apps/web/src/components/practice/PinyinInputCard.tsx`** — в `onKeyDown` добавить ранний выход при `e.nativeEvent.isComposing` (как в StudyScreen.tsx:403).

5. **`apps/web/src/hooks/useStudySession.ts`** — устранить расхождение локального/серверного прогресса при ошибке: перенести локальный RxDB-апсерт в `onSuccess` answerMutation (вариант Б: сохранить пре-значения и откатывать в `onError`).

6. **`apps/web/src/db/database.ts` (deleteIndexedDb)** — `onblocked` → reject с понятной ошибкой; на верхнем уровне показать пользователю сообщение «закройте другие вкладки» вместо тихого degraded-режима.

7. **Таймзоны:** `achievements.service.ts` (early_bird/night_owl) и `lib/cron.ts` — использовать `timezone` пользователя (getTodayUtcRange/getLocalDayKey) вместо серверных `setHours`/`getHours`.

8. **`users.service.ts`** — валидация `timezone` (try `new Intl.DateTimeFormat('en-US', { timeZone })`) перед сохранением.

9. **Периодическая синхронизация (веб)** — интервальный flush в `SyncEngine.start()` (раз в 5 мин) + включить `refetchOnWindowFocus` в queryClient.

## Волна 3 — производительность сервера

10. **Лидерборд** (`stats.service.ts:95-101`) — заменить выгрузку всех SessionAnswer на агрегацию в БД (`prisma.groupBy` + `_sum` или raw SQL с SUM по rating).
11. **`reading.service.ts`** — `select: { wordId: true }` в запросах прогресса; ограничить include в списках текстов.
12. **`audio.service.ts`** — `writeFileSync`/`readFileSync` → `fs/promises`.
13. **`sync.service.ts`** — `select` только полей протокола sync при первом full-sync.
14. **`cron.ts`** — заменить N+1 COUNT на один `groupBy` по пользователям.
15. **Миграция Prisma** — добавить `@@index([userId, state])` (UserWordProgress), `@@index([userId, startedAt])` (Session), `@@index([answeredAt])` (SessionAnswer); создать миграцию через `pnpm --filter @hanzi/server db:migrate`.

## Волна 4 — мобильная часть (можно отдельным коммитом)

16. `WatermelonQueueStorage.markSynced` — удалять синхронизированные строки вместо пометки.
17. `localSession.ts` — ограничить выборки (`Q.take`) вместо выгрузки всего словаря.
18. `useWordAudio` — принимать `audioUrl` параметром (данные уже в карточке сессии).
19. `StudyScreen.tsx` — не делать live POST для `session.local === true`.
20. SDK `SyncEngine.ts` — не продвигать курсор (или как минимум логировать), если `onServerChange` упал.

## Верификация

- `pnpm typecheck` и `pnpm lint` после каждой волны.
- Тесты: `pnpm --filter @hanzi/mobile-sdk test`, серверные vitest-тесты затронутых модулей (sync, stats, achievements, rate-limit).
- Новые тесты: web-sync trailing-flush (п.1), merge кэша слов (п.3), timezone-границы достижений (п.7).
- Коммиты по волнам в стиле репозитория.