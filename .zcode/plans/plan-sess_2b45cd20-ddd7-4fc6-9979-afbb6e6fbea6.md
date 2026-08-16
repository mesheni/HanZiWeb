# План: улучшение UX и новые возможности HanZiWeb

8 выбранных направлений, сгруппированных в волны — от быстрых UX-побед к фичам с серверными изменениями. Каждая волна независима и заканчивается проверкой (`pnpm typecheck` + профильные тесты). Мобильный клиент не трогаем (его паритет — уже запланированная v0.6 Wave 4); все изменения shared-схем аддитивные.

## Волна 1. Реальные интервалы на кнопках оценки

Сейчас в `apps/web/src/screens/StudyScreen.tsx:53-58` подсказки захардкожены («через 1 мин», «через 4 дня»). Но `SessionCardSchema` уже содержит `stability`/`difficulty`/`state` (v0.4 §50), а `recalcFsrsLocally` в `apps/web/src/db/fsrs.ts` возвращает `intervalDays`.

- В StudyScreen вычислять `useMemo`-массив прогнозов: для каждого рейтинга 1–4 вызвать `recalcFsrsLocally(rating, currentCard.stability, currentCard.difficulty, currentCard.state, elapsedDays)`; `elapsedDays` — из локального прогресса (RxDB `progress.lastReviewDate`, асинхронный lookup по wordId), fallback — дефолт функции.
- Новый форматтер `utils/formatInterval.ts`: 0 → «сейчас», 1 → «завтра», <31 → «N дней» (с правильными склонениями), ≥31 → «~N мес». Юнит-тест (vitest в web уже настроен).
- Заменить `RATING_OPTIONS` static hint на вычисляемые, подпись «прогноз».

## Волна 2. Горячие клавиши во всех типах практики

- Новый хук `hooks/useOptionHotkeys.ts`: цифры 1–4 выбирают вариант; используется внутри `MultipleChoiceCard`, `ReverseChoiceCard`, `ToneRecognitionCard` (компоненты сами владеют списком вариантов). Игнорировать события из `input/textarea` и во время `isComposing`.
- В StudyScreen общий keydown при `showFeedback`: Enter → `continueSession()`, Space/R → повтор аудио.
- Оверлей-шпаргалка: кнопка «?» в шапке сессии + `components/ShortcutsOverlay.tsx` (модалка со списком клавиш текущего типа практики).

## Волна 3. Аудирование — 9-й тип практики

- `packages/shared/src/schemas/session.ts`: добавить `'listening'` в `PracticeTypeSchema`; `packages/shared/src/utils/practiceTypes.ts`: добавить в training-список (не влияет на FSRS — как остальные тренировочные).
- Web `utils/practiceTypes.ts`: запись в `PRACTICE_TYPES` («Аудирование», иконка 'Headphones' — расширить union типа), в `TRAINING_PRACTICE_TYPES`, в `parsePracticeParam` valid-список; в StudyScreen добавить 'listening' в `isChoiceMode` и `needsDistractors`.
- Новый `components/practice/ListeningCard.tsx`: крупная кнопка «Прослушать» (автоплей уже работает через существующий эффект), 4 варианта перевода из пула дистракторов, иероглиф скрыт до ответа; после ответа стандартная feedback-панель показывает иероглиф/пиньинь/перевод. Слова без `audioUrl` озвучиваются через speechSynthesis-fallback (как tone-recognition).
- Фича-флаг `practice_listening` — выводится из enum автоматически (`practiceFlagKey`); проверить, что серверный модуль flags отдаёт ключи из `PracticeTypeSchema` (если захардкожено — добавить ключ, default enabled, чтобы можно было выключить).

## Волна 4. Command palette (Ctrl+K)

- `components/CommandPalette.tsx`, монтирование в `components/Layout.tsx`; открытие по Ctrl+K/Cmd+K и кнопке «Поиск» в Sidebar.
- Два источника: разделы навигации (7 маршрутов) и слова из локальной RxDB-коллекции `words` — поиск по иероглифу / нормализованному пиньиню (`utils/pinyinNormalize` готов) / переводу, лимит ~8 слов.
- Выбор слова открывает `WordDetailModal` (переиспользовать существующий компонент).
- Закрытие по Esc/клику вне; стрелки ↑↓ + Enter для навигации по результатам.

## Волна 5. Персональные мнемоники

Сервер:
- Prisma: новая модель `UserWordMnemonic { id, userId, wordId, text, updatedAt, @@unique([userId, wordId]) }` + relations; миграция через `db:migrate`.
- Новый модуль `modules/mnemonics`: `GET /users/me/mnemonics?wordIds=a,b,c`, `PUT /users/me/mnemonics/:wordId {text}`, `DELETE /users/me/mnemonics/:wordId`. Zod-схемы в `packages/shared/src/schemas/mnemonic.ts`, обновить `packages/shared/api-spec.md`.
- Офлайн-правки: расширить union изменений sync (`shared/schemas/sync.ts`) на `mnemonic_upsert`/`mnemonic_delete`, обработка в `sync.service.ts` (last-write-wins по `updatedAt`). Sync-down в v1 упрощён: загрузка по слову + React Query `refetchOnWindowFocus` (без journal-дельты — мнемоники не в SyncJournal).

Web:
- `queries/mnemonics.ts`; секция «Моя мнемоника» в `WordDetailModal.tsx` (textarea, сохранить/удалить, optimistic update + постановка в pending_changes при офлайне).
- Показ личной мнемоники на обороте `Flashcard.tsx` и в feedback-панели.
- Тесты: серверный модуль по образцу `stats.routes.test.ts`, обновить `shared/schemas/sync.test.ts`.

## Волна 6. FSRS-инсайты в статистике

- Чистые функции `utils/fsrsInsights.ts` (+ vitest): из RxDB `progress` считать прогноз повторений на 14 дней (бакеты по dueDate), распределение stability (<1/1-3/3-7/7-21/21+ дней), распределение difficulty (1–10), распределение по состояниям.
- `components/FsrsInsightsCard.tsx` в `StatsScreen.tsx`: столбчатые CSS/SVG-графики без новой библиотеки (в web нет chart-либ, стиль — как у прогресс-ринга). Подпись «по локальному зеркалу прогресса».

## Волна 7. Страховка стрика

- Prisma: `User.streakFreezeCount Int @default(1)`, `User.lastFreezeGrantAt DateTime?`; миграция.
- `stats.service.ts` (`computeStreak`/`touchStreak`): при пропуске ровно одного дня и `streakFreezeCount > 0` — списать страховку и сохранить стрик; при гэпе 2+ дней — сброс как сейчас. Начисление 1 страховки в месяц, максимум 2 (по `lastFreezeGrantAt`).
- `GET /stats/overview` отдавать `streakFreezeCount`; web — бейдж «❄ N» на карточке стрика (HomeScreen/StatsScreen).
- Тесты: расширить `stats.streak.test.ts` / `sessions.streak.test.ts` (гэп 1 день со страховкой и без, гэп 2+, месячное начисление).

## Волна 8. Расширение библиотеки чтения

- Контент: добавить градуированные тексты в `prisma/seeds/reading/hsk*.json` (цель 8–10 на уровень вместо 2); существующий seed-скрипт сам токенизирует. Помечаю как контентную задачу — тексты нужны на китайском с русским переводом, я подготовлю стартовый набор.
- «Знакомость»: `GET /reading/texts` — сервер считает `familiarPercent` (JOIN `ReadingTextWord` × `UserWordProgress`, доля токенов со state ≠ 'new'); web — бейдж «знакомо N%» на карточках текстов и сортировка «по знакомости». Тест серверного reading-модуля.

## Порядок и проверки

Волны 1–2 (чистый web, минимальный риск) → 3–4 (web + shared) → 5, 7 (server + миграции) → 6, 8. После каждой волны: `pnpm typecheck`, профильные `vitest run`, в конце — `pnpm lint`. Затрагиваемый контракт: api-spec.md (мнемоники, familiarPercent), shared-enum PracticeType (аддитивно — остальные консьюмеры не ломаются).

## Сознательно не входит

Лиги (следующая итерация после страховки стрика), скорость TTS и возобновление сессий (не выбраны), мобильный порт новых типов практики (v0.6 Wave 4), генерация текстов LLM-ом.