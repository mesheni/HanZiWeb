# HanZiWeb — REST API Specification

> Сгенерировано из Zod-схем (`packages/shared/src/schemas/`) и route-файлов (`apps/server/src/modules/`).
> Все схемы запросов/ответов реализованы через Zod и доступны в `@hanzi/shared`.

---

## Аутентификация (Auth)

Все эндпоинты: `POST /api/auth/*`

### POST /api/auth/register

Регистрация нового пользователя.

| | |
|---|---|
| **Auth** | Нет |
| **Request** | `RegisterSchema` |
| **Response 201** | `{ success: true, data: AuthResponseSchema }` |
| **Response 409** | `{ success: false, error: { code: "EMAIL_EXISTS", message: "Email already registered" } }` |

```json
// Request
{ "email": "user@example.com", "password": "min-8-chars" }

// Response 201
{
  "success": true,
  "data": {
    "user": { "id": "uuid", "email": "user@example.com", "xp": 0, "currentStreak": 0 },
    "accessToken": "eyJ...",
    "expiresIn": 900
  }
}
```

### POST /api/auth/login

Вход в аккаунт. Устанавливает HttpOnly cookie `refreshToken` (30 дней).

| | |
|---|---|
| **Auth** | Нет |
| **Request** | `LoginSchema` |
| **Response 200** | `{ success: true, data: AuthResponseSchema }` |
| **Response 401** | `{ success: false, error: { code: "INVALID_CREDENTIALS" } }` |

### POST /api/auth/refresh

Обновление access-токена. Читает `refreshToken` из cookie.

| | |
|---|---|
| **Auth** | Cookie (`refreshToken`) |
| **Request** | `RefreshSchema` (body опционален) |
| **Response 200** | `{ success: true, data: AuthResponseSchema }` |
| **Response 401** | `{ success: false, error: { code: "NO_TOKEN" | "INVALID_TOKEN" } }` |

### POST /api/auth/logout

Выход. Очищает cookie `refreshToken`.

| | |
|---|---|
| **Auth** | Cookie |
| **Response 200** | `{ success: true }` |

### PUT /api/auth/change-password

Смена пароля авторизованным пользователем (PLAN_Features_v0.3 §1).
Принимает текущий и новый пароль, проверяет текущий через
`bcrypt.compare` и обновляет `User.passwordHash`. После успешной
смены инкрементит `User.tokenVersion` — все ранее выданные
refresh-токены инвалидируются, остальные устройства должны будут
войти заново.

OAuth-only пользователи (`passwordHash === null`) получают
`400 PASSWORD_NOT_SET` с подсказкой установить пароль через
восстановление (см. PLAN_Features_v0.3 §2).

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Request** | `ChangePasswordSchema` |
| **Response 200** | `{ success: true }` |
| **Response 400** | `{ success: false, error: { code: "PASSWORD_NOT_SET" } }` — OAuth-only аккаунт |
| **Response 400** | `{ success: false, error: { code: "WEAK_PASSWORD" } }` — новый пароль совпадает с текущим или не прошёл валидацию |
| **Response 401** | `{ success: false, error: { code: "INVALID_PASSWORD" } }` — `currentPassword` не совпал |
| **Response 401** | `{ success: false, error: { code: "UNAUTHORIZED" \| "TOKEN_EXPIRED" } }` — нет валидного access-токена |

```json
// Request
{ "currentPassword": "oldSecret123", "newPassword": "newSecret456" }

// Response 200
{ "success": true }
```

---

## Социальный вход (OAuth, PLAN_Features_v0.2 §13)

Все эндпоинты: `GET /api/auth/oauth/*`, `GET /api/auth/accounts`,
`DELETE /api/auth/accounts/:provider`.

Поддерживаются три провайдера: **Google**, **Apple** (Sign in with Apple),
**Яндекс**. Каждый провайдер можно включить/выключить через env:
`GOOGLE_OAUTH_CLIENT_ID/SECRET`, `APPLE_OAUTH_CLIENT_ID/SECRET`,
`YANDEX_OAUTH_CLIENT_ID/SECRET`. Если client_id/secret не заданы,
соответствующий маршрут возвращает 503 `PROVIDER_NOT_CONFIGURED`.

### GET /api/auth/oauth/providers

Список провайдеров и их статус (используется web-клиентом, чтобы
показать или скрыть кнопки).

| | |
|---|---|
| **Auth** | Нет |
| **Response 200** | `{ success: true, data: { providers: [{ provider, enabled }] } }` |

```json
// Response
{
  "success": true,
  "data": {
    "providers": [
      { "provider": "google", "enabled": true },
      { "provider": "apple", "enabled": false },
      { "provider": "yandex", "enabled": true }
    ]
  }
}
```

### GET /api/auth/oauth/:provider

Старт OAuth-flow. Сервер генерирует `state`, кладёт его в Redis
на 10 минут и делает 302-редирект на authorize-endpoint
провайдера.

| | |
|---|---|
| **Auth** | Нет |
| **Response 302** | Redirect → `https://accounts.google.com/o/oauth2/v2/auth?…` (или аналог Apple / Яндекс) |
| **Response 404** | `{ success: false, error: { code: "UNKNOWN_PROVIDER" } }` |
| **Response 503** | `{ success: false, error: { code: "PROVIDER_NOT_CONFIGURED" } }` |

`:provider` — `google` \| `apple` \| `yandex`.

### GET/POST /api/auth/oauth/:provider/callback

Callback от провайдера. Сервер проверяет `state`, обменивает
authorization `code` на `access_token` (POST на token-endpoint
провайдера), забирает userinfo (или парсит `id_token` для Apple),
создаёт/обновляет `User` + `UserAccount`, выдаёт одноразовый код
и редиректит клиента на:

```
<WEB_PUBLIC_URL>/auth/callback?provider=<p>&code=<one-time>
```

| | |
|---|---|
| **Auth** | Нет |
| **Response 302** | Redirect → `<WEB_PUBLIC_URL>/auth/callback?provider=…&code=…` (или `?error=…` при ошибке) |

Apple использует `response_mode=form_post`, поэтому callback
для Apple принимает и GET, и POST.

### POST /api/auth/oauth/exchange

Обмен одноразового кода на пару access + refresh. Защита от
CSRF и replay-атак: код живёт в Redis ровно 60 секунд и может
быть использован только один раз.

| | |
|---|---|
| **Auth** | Нет (одноразовый код) |
| **Request** | `OAuthExchangeSchema` (`{ code: string }`) |
| **Response 200** | `{ success: true, data: AuthResponseSchema }` (refresh в HttpOnly cookie) |
| **Response 400** | `{ success: false, error: { code: "INVALID_CODE" } }` |

### GET /api/auth/accounts

Список привязанных OAuth-аккаунтов текущего пользователя.

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Response 200** | `{ success: true, data: UserAccountsResponseSchema }` |

```json
// Response
{
  "success": true,
  "data": {
    "accounts": [
      {
        "id": "uuid",
        "provider": "google",
        "providerEmail": "alice@gmail.com",
        "createdAt": "2026-07-04T12:00:00.000Z"
      }
    ],
    "canUnlink": true
  }
}
```

`canUnlink = false` означает, что у пользователя нет пароля
и этот аккаунт — единственный способ входа. UI должен
отключить кнопку «Отвязать».

### DELETE /api/auth/accounts/:provider

Отвязать OAuth-аккаунт. Защита от «замка»: 409, если
`canUnlink = false`.

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Response 200** | `{ success: true }` |
| **Response 400** | `{ success: false, error: { code: "UNKNOWN_PROVIDER" } }` |
| **Response 404** | `{ success: false, error: { code: "NOT_FOUND" } }` (аккаунт не привязан) |
| **Response 409** | `{ success: false, error: { code: "CANNOT_UNLINK" } }` |

### Поведение auto-link

При первом входе через Google / Яндекс с verified email,
который уже зарегистрирован в HanZi (через `register` или
другой провайдер), привязка автоматически добавляется к
существующему `User`. Для Apple auto-link срабатывает, если
`id_token.email` подтверждён (Apple всегда verified).

Если провайдер не отдаёт verified email — создаётся
новый `User` с placeholder email `<provider>+<providerUserId>@oauth.local`.

---

## Слова (Words)

Все эндпоинты: `GET/POST/PUT/DELETE /api/words/*`

### GET /api/words

Список слов с фильтрацией и пагинацией.

| | |
|---|---|
| **Auth** | Нет |
| **Query** | `WordFiltersSchema` |
| **Response 200** | `{ success: true, data: Word[], pagination: PaginationSchema }` |

```json
// Query params
{ "search": "爱", "hskLevel": 1, "deckId": "uuid", "status": "learning", "limit": 50, "offset": 0 }
```

### GET /api/words/:id

Одно слово с примерами.

| | |
|---|---|
| **Auth** | Нет |
| **Response 200** | `{ success: true, data: WordSchema }` |
| **Response 404** | `{ success: false, error: { code: "NOT_FOUND" } }` |

### POST /api/words

Создание слова (только авторизованные).

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Request** | `CreateWordSchema` |
| **Response 201** | `{ success: true, data: WordSchema }` |

### PUT /api/words/:id

Обновление слова (только авторизованные).

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Request** | `UpdateWordSchema` |
| **Response 200** | `{ success: true, data: WordSchema }` |

### DELETE /api/words/:id

Удаление слова (только авторизованные).

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Response 200** | `{ success: true }` |

---

## Учебные Сессии (Study/SRS)

Все эндпоинты: `POST/GET /api/sessions/*`

### POST /api/sessions/start

Начать новую учебную сессию. Сервер выбирает слова для повторения (dueDate ≤ now) + новые слова.

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Request** | `StartSessionSchema` |
| **Response 201** | `{ success: true, data: FullSessionSchema }` |

```json
// Request (PLAN_Features_v0.2 §12 — фильтры сессии)
{
  "deckId": "uuid (optional)",
  "cardLimit": 20,
  "includeNew": true,
  "mode": "mixed | review | learn",
  "practiceType": "flip-card | multiple-choice | ...",
  "filters": {
    "minStability": 0,
    "maxStability": 7,
    "tags": ["uuid", "uuid"],
    "onlyWithAudio": true,
    "onlyWithMnemonic": false
  }
}

// Response: FullSession (сессия + массив SessionCard + appliedFilters)
```

### POST /api/sessions/:id/answer

Записать ответ на карточку. Сервер пересчитывает FSRS (stability, difficulty, dueDate), начисляет XP, проверяет условия достижений (см. §8).

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Request** | `RecordAnswerSchema` |
| **Response 200** | `{ success: true, data: SrsRecalcResultSchema & { unlockedAchievements: UserAchievement[] } }` |

```json
// Request
{ "sessionId": "uuid", "wordId": "uuid", "rating": 3, "responseTimeMs": 2500 }

// Response: новый dueDate, stability, difficulty, state, intervalDays, xpGain,
// unlockedAchievements — массив только что разблокированных достижений
// (типы: streak_7 | words_100 | hsk1_complete | reviews_10k | perfect_session).
```

### GET /api/sessions/:id

Детали сессии (с ответами).

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Response 200** | `{ success: true, data: Session (с answers[]) }` |
| **Response 404** | `{ success: false, error: { code: "NOT_FOUND" } }` |

---

## Статистика (Stats)

Все эндпоинты: `GET /api/stats/*`

### GET /api/stats/overview

Общая статистика пользователя: XP, streak, количество слов по состояниям, точность.

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Response 200** | `{ success: true, data: { xp, currentStreak, totalWords, learnedWords, accuracy, byState } }` |

```json
// Response
{
  "success": true,
  "data": {
    "xp": 250,
    "currentStreak": 5,
    "totalWords": 42,
    "learnedWords": 15,
    "accuracy": 75,
    "byState": { "new": 20, "learning": 7, "review": 10, "graduated": 5 }
  }
}
```

### GET /api/stats/activity

Календарь активности за месяц (для heatmap).

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Query** | `year` (int), `month` (int, 1-12) |
| **Response 200** | `{ success: true, data: [{ day: int, count: int }] }` |

```json
// Response
{ "success": true, "data": [{ "day": 1, "count": 12 }, { "day": 2, "count": 8 }] }
```

### GET /api/stats/leaderboard

Таблица лидеров (PLAN_Features_v0.2 §7).

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Query** | `period` (`week` \| `all`, default `week`), `limit` (int, 1-100, default 100) |
| **Response 200** | см. `LeaderboardResponseSchema` (`packages/shared/src/schemas/leaderboard.ts`) |

```json
// Response (period=week)
{
  "success": true,
  "data": {
    "period": "week",
    "total": 17,
    "entries": [
      { "rank": 1, "userId": "…", "displayName": "al***@gmail.com", "xp": 220, "currentStreak": 9, "isCurrentUser": false },
      …
    ],
    "currentUser": { "rank": 42, "userId": "…", "displayName": "ma***@yandex.ru", "xp": 30, "currentStreak": 1, "isCurrentUser": true },
    "windowStart": "2026-07-06T00:00:00.000Z",
    "windowEnd": "2026-07-13T00:00:00.000Z"
  }
}
```

---

## Настройки пользователя (User Settings)

Все эндпоинты: `GET/PUT /api/users/*` (см. PLAN_Features_v0.2 §9).

### GET /api/users/settings

Текущие пользовательские настройки (ежедневная цель и т.п.).

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Response 200** | `{ success: true, data: UserSettingsSchema }` |

```json
// Response
{ "success": true, "data": { "dailyGoal": 20 } }
```

### PUT /api/users/settings

Обновление пользовательских настроек. Сейчас поддерживается `dailyGoal` (1–200).

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Request** | `UpdateUserSettingsSchema` (все поля optional) |
| **Response 200** | `{ success: true, data: UserSettingsSchema }` |

```json
// Request
{ "dailyGoal": 30 }

// Response
{ "success": true, "data": { "dailyGoal": 30 } }
```

---

## Экспорт и импорт прогресса (PLAN_Features_v0.2 §10)

Все эндпоинты: `GET /api/stats/export`, `POST /api/stats/import`.

### GET /api/stats/export

Экспорт всего `UserWordProgress` пользователя — бэкап или аналитика.

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Query** | `format` (`json` \| `csv`, default `json`) |
| **Response 200 (json)** | Тело соответствует `ProgressExportSchema` (`packages/shared/src/schemas/progressExport.ts`), `Content-Disposition: attachment; filename="hanzi-progress-<date>.json"`. |
| **Response 200 (csv)**  | Текстовый CSV с заголовком `wordId,state,stability,difficulty,reps,dueDate,lastReviewDate`, `Content-Disposition: attachment; filename="hanzi-progress-<date>.csv"`. |

```json
// Response (format=json)
{
  "version": 1,
  "exportedAt": "2026-07-04T12:00:00.000Z",
  "userId": "uuid",
  "progress": [
    {
      "wordId": "uuid",
      "state": "learning",
      "stability": 1.5,
      "difficulty": 4.2,
      "reps": 2,
      "dueDate": "2026-07-04T12:00:00.000Z",
      "lastReviewDate": "2026-07-03T12:00:00.000Z"
    }
  ]
}
```

```
// Response (format=csv)
wordId,state,stability,difficulty,reps,dueDate,lastReviewDate
<uuid>,learning,1.5,4.2,2,2026-07-04T12:00:00.000Z,2026-07-03T12:00:00.000Z
...
```

### POST /api/stats/import

Восстановление прогресса из JSON-бэкапа (см. `ProgressImportRequestSchema`).

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Request** | `{ mode: "merge" \| "replace", progress: ProgressRecord[] }` |
| **Response 200** | `{ success: true, data: ProgressImportResponseSchema }` |
| **Response 400** | `{ success: false, error: { code: "VALIDATION_ERROR", ... } }` |

- `merge`   — добавляет новые записи, обновляет поля существующих.
- `replace` — сначала удаляет весь текущий прогресс пользователя, затем вставляет.

Записи с `wordId`, которых нет в таблице `Word`, молча пропускаются (считаются в `skipped`).

```json
// Request
{
  "mode": "merge",
  "progress": [
    {
      "wordId": "uuid",
      "state": "learning",
      "stability": 1.5,
      "difficulty": 4.2,
      "reps": 2,
      "dueDate": "2026-07-04T12:00:00.000Z",
      "lastReviewDate": "2026-07-03T12:00:00.000Z"
    }
  ]
}

// Response
{
  "success": true,
  "data": {
    "mode": "merge",
    "total": 1,
    "imported": 1,
    "updated": 0,
    "skipped": 0,
    "importedAt": "2026-07-04T12:00:01.000Z"
  }
}
```

---

## Достижения (Achievements)

Все эндпоинты: `GET /api/achievements/*` (см. PLAN_Features_v0.2 §8).

### GET /api/achievements

Список разблокированных достижений пользователя. Типы и метаданные — в `ACHIEVEMENT_CATALOG` (`packages/shared/src/schemas/achievement.ts`).

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Response 200** | `{ success: true, data: { achievements: UserAchievement[] } }` |

```json
// Response
{
  "success": true,
  "data": {
    "achievements": [
      { "id": "uuid", "type": "streak_7", "unlockedAt": "2026-07-03T19:30:00.000Z" },
      { "id": "uuid", "type": "perfect_session", "unlockedAt": "2026-07-03T20:12:45.000Z" }
    ]
  }
}
```

---

## Health Check

### GET /api/health

Проверка работоспособности сервера.

| | |
|---|---|
| **Auth** | Нет |
| **Response 200** | `{ status: "ok", timestamp: "ISO8601" }` |

---

## Feature Flags / A/B-тесты (PLAN_Features_v0.2 §15)

Внутренняя альтернатива LaunchDarkly / Stytch: статический реестр
флагов с детерминированной оценкой для пользователя. Используется
для гейтинга новых режимов тренировки (`practice:cloze`,
`practice:multiple-choice`, …) и будущих экспериментов.

Оценка флага:
1. Если `key` не зарегистрирован → `enabled: false, reason: unknown`.
2. Если `enabled: false` → `enabled: false, reason: disabled`.
3. Если `userId ∈ whitelist` → `enabled: true, reason: whitelist`.
4. Если `hash(key:userId) % 100 < rolloutPercent` →
   `enabled: true, reason: rollout`.
5. Иначе → `enabled: false, reason: disabled`.

Override через ENV (без перезапуска кода):
`FEATURE_FLAG_PRACTICE_CLOZE_ENABLED=false`,
`FEATURE_FLAG_PRACTICE_CLOZE_ROLLOUT=25` и т.п. (`:`/`-` → `_`).

### GET /api/flags

Снимок всех известных флагов для текущего пользователя.

| | |
|---|---|
| **Auth** | Опционально (Bearer JWT) — если задан, `userId` из JWT используется для whitelist/rollout |
| **Response 200** | `{ success: true, data: FlagsResponseSchema }` |

```json
// Response
{
  "success": true,
  "data": {
    "flags": {
      "practice:cloze": { "key": "practice:cloze", "enabled": true, "reason": "rollout" },
      "practice:multiple-choice": { "key": "practice:multiple-choice", "enabled": true, "reason": "rollout" },
      "practice:flip-card": { "key": "practice:flip-card", "enabled": true, "reason": "rollout" }
    }
  }
}
```

### GET /api/flags/:key

Оценка одного флага. 404, если флаг с таким `key` не зарегистрирован.

| | |
|---|---|
| **Auth** | Опционально (Bearer JWT) |
| **Response 200** | `{ success: true, data: FlagEvaluationSchema }` |
| **Response 404** | `{ success: false, error: { code: "FLAG_NOT_FOUND" } }` |

```json
// Response
{ "success": true, "data": { "key": "practice:cloze", "enabled": true, "reason": "rollout" } }
```

Когда `useFeatureFlag` / `usePracticeTypes` показывают флаг пользователю,
в PostHog отправляется событие `experiment_exposed` с
`{ flag_key, enabled, reason }` (см. `POST /api/ingest`).

---

## Теги (Tags) — PLAN_Features_v0.2 §12

Теги используются для фильтрации сессий (`tags[]` в `StartSession.filters`).

### GET /api/tags

Список всех тегов с подсчётом слов.

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Response 200** | `{ success: true, data: (Tag & { wordCount: int })[] }` |

```json
// Response
{ "success": true, "data": [{ "id": "uuid", "name": "С трудным тоном", "slug": "hard-tones", "color": "FFB74D", "createdAt": "ISO8601", "wordCount": 24 }] }
```

### POST /api/tags

Создать новый тег.

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Request** | `CreateTagSchema` |
| **Response 201** | `{ success: true, data: Tag }` |

```json
// Request
{ "name": "С трудным тоном", "slug": "hard-tones", "color": "FFB74D" }
```

### DELETE /api/tags/:id

Удалить тег (каскадно удаляет WordTag).

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Response 200** | `{ success: true, data: { deleted: "uuid" } }` |
| **Response 404** | `{ success: false, error: { code: "NOT_FOUND" } }` |

### GET /api/tags/words/:wordId/tags

Получить теги конкретного слова.

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Response 200** | `{ success: true, data: Tag[] }` |

### PUT /api/tags/words/:wordId/tags

Заменить набор тегов слова (replace).

| | |
|---|---|
| **Auth** | Bearer JWT |
| **Request** | `SetWordTagsSchema` |
| **Response 200** | `{ success: true, data: Tag[] }` |

```json
// Request
{ "tagIds": ["uuid", "uuid"] }
```

---

## Аналитика (PLAN_Features_v0.2 §14, PostHog)

Эндпоинт: `POST /api/ingest`.

Web/app **никогда** не ходит в PostHog напрямую — иначе утекает
Project API key и cookie. Вместо этого клиент шлёт события в
наш backend, а сервер уже сам проксирует их в PostHog `/batch/`
со своим `POSTHOG_API_KEY` (env).

События:
- `session_started` — старт учебной сессии.
- `answer_rated` — пользователь оценил карточку.
- `audio_generated` — пользователь прослушал аудио слова (клиент
  шлёт `source: mp3 | fallback`); или сервер сгенерировал mp3
  через Google TTS (источник `source: cache | generated`).
- `experiment_exposed` — пользователь увидел UI, зависящий от
  фичевого флага (см. §15). Properties: `{ flag_key, enabled, reason }`.

### POST /api/ingest

| | |
|---|---|
| **Auth** | Опционально (Bearer JWT) — если задан, сервер проставит `userId` как `distinct_id` |
| **Request** | `AnalyticsIngestSchema` (`{ events: AnalyticsEventInput[] }`) |
| **Response 200** | `{ success: true, data: { forwarded, skipped } }` |
| **Response 204** | `No Content` — PostHog не сконфигурирован на сервере (`POSTHOG_API_KEY` пуст), события тихо отбрасываются |

```json
// Request
{
  "events": [
    {
      "name": "session_started",
      "distinctId": "anon-uuid-1234",
      "timestamp": "2026-07-04T10:00:00.000Z",
      "properties": {
        "session_id": "uuid",
        "mode": "mixed",
        "practice_type": "flip-card",
        "card_count": 20
      }
    },
    {
      "name": "answer_rated",
      "distinctId": "anon-uuid-1234",
      "properties": {
        "session_id": "uuid",
        "word_id": "uuid",
        "rating": 3,
        "is_correct": true,
        "response_time_ms": 1234,
        "practice_type": "flip-card"
      }
    }
  ]
}
```

Если `POSTHOG_API_KEY` не задан, эндпоинт возвращает `204` и не
выполняет сетевой запрос. Это позволяет dev-окружению работать
без внешних сервисов. Web-клиент также уважает `navigator.doNotTrack`
и флаг `hanzi:analytics-disabled` в localStorage — в этих случаях
запросы не отправляются вовсе.

---

## Стандартные форматы ответов

### Успех (единичный объект)
```json
{ "success": true, "data": { ... } }
```

### Успех (список с пагинацией)
```json
{ "success": true, "data": [ ... ], "pagination": { "total": 100, "limit": 50, "offset": 0 } }
```

### Ошибка
```json
{ "success": false, "error": { "code": "ERROR_CODE", "message": "Human-readable description" } }
```

## Аутентификация

- **Access token**: короткоживущий JWT (15 минут), передаётся в заголовке `Authorization: Bearer <token>`
- **Refresh token**: долгоживущий JWT (30 дней), передаётся в HttpOnly cookie `refreshToken`
- **Схемы**: `RegisterSchema`, `LoginSchema`, `AuthResponseSchema`, `RefreshSchema` → `packages/shared/src/schemas/auth.ts`
- **OAuth**: 3 провайдера (Google, Apple, Яндекс); обмен через
  одноразовый `code` (TTL 60 сек в Redis). Схемы
  `OAuthProviderSchema`, `OAuthProfileSchema`, `UserAccountSchema`,
  `UserAccountsResponseSchema`, `OAuthExchangeSchema` →
  `packages/shared/src/schemas/oauth.ts`.
- **Смена пароля**: `PUT /api/auth/change-password` —
  `ChangePasswordSchema`, `ChangePasswordResponseSchema` →
  `packages/shared/src/schemas/auth.ts`.

## Сводка эндпоинтов

| # | Method | Path | Auth | Module |
|---|--------|------|------|--------|
| 1 | POST | /api/auth/register | No | Auth |
| 2 | POST | /api/auth/login | No | Auth |
| 3 | POST | /api/auth/refresh | Cookie | Auth |
| 4 | POST | /api/auth/logout | Cookie | Auth |
| 4a | PUT | /api/auth/change-password | JWT | Auth |
| 5 | GET | /api/auth/oauth/providers | No | Auth (OAuth) |
| 6 | GET | /api/auth/oauth/:provider | No | Auth (OAuth) |
| 7 | GET/POST | /api/auth/oauth/:provider/callback | No | Auth (OAuth) |
| 8 | POST | /api/auth/oauth/exchange | Code | Auth (OAuth) |
| 9 | GET | /api/auth/accounts | JWT | Auth (OAuth) |
| 10 | DELETE | /api/auth/accounts/:provider | JWT | Auth (OAuth) |
| 11 | GET | /api/words | No | Words |
| 12 | GET | /api/words/:id | No | Words |
| 13 | POST | /api/words | JWT | Words |
| 14 | PUT | /api/words/:id | JWT | Words |
| 15 | DELETE | /api/words/:id | JWT | Words |
| 16 | POST | /api/sessions/start | JWT | Sessions |
| 17 | POST | /api/sessions/:id/answer | JWT | Sessions |
| 18 | GET | /api/sessions/:id | JWT | Sessions |
| 19 | GET | /api/stats/overview | JWT | Stats |
| 20 | GET | /api/stats/activity | JWT | Stats |
| 21 | GET | /api/stats/leaderboard | JWT | Stats |
| 22 | GET | /api/stats/export | JWT | Stats |
| 23 | POST | /api/stats/import | JWT | Stats |
| 24 | GET | /api/achievements | JWT | Achievements |
| 25 | GET | /api/users/settings | JWT | Users |
| 26 | PUT | /api/users/settings | JWT | Users |
| 27 | GET | /api/tags | JWT | Tags |
| 28 | POST | /api/tags | JWT | Tags |
| 29 | DELETE | /api/tags/:id | JWT | Tags |
| 30 | GET | /api/tags/words/:wordId/tags | JWT | Tags |
| 31 | PUT | /api/tags/words/:wordId/tags | JWT | Tags |
| 32 | POST | /api/ingest | Optional | Analytics |
| 33 | GET | /api/flags | Optional | Feature Flags |
| 34 | GET | /api/flags/:key | Optional | Feature Flags |

Всего: **35 эндпоинтов** в 10 модулях.
