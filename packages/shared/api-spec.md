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
// Request
{ "deckId": "uuid (optional)", "cardLimit": 20, "includeNew": true }

// Response: FullSession (сессия + массив SessionCard)
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

## Сводка эндпоинтов

| # | Method | Path | Auth | Module |
|---|--------|------|------|--------|
| 1 | POST | /api/auth/register | No | Auth |
| 2 | POST | /api/auth/login | No | Auth |
| 3 | POST | /api/auth/refresh | Cookie | Auth |
| 4 | POST | /api/auth/logout | Cookie | Auth |
| 5 | GET | /api/words | No | Words |
| 6 | GET | /api/words/:id | No | Words |
| 7 | POST | /api/words | JWT | Words |
| 8 | PUT | /api/words/:id | JWT | Words |
| 9 | DELETE | /api/words/:id | JWT | Words |
| 10 | POST | /api/sessions/start | JWT | Sessions |
| 11 | POST | /api/sessions/:id/answer | JWT | Sessions |
| 12 | GET | /api/sessions/:id | JWT | Sessions |
| 13 | GET | /api/stats/overview | JWT | Stats |
| 14 | GET | /api/stats/activity | JWT | Stats |
| 15 | GET | /api/stats/leaderboard | JWT | Stats |
| 16 | GET | /api/stats/export | JWT | Stats |
| 17 | POST | /api/stats/import | JWT | Stats |
| 18 | GET | /api/achievements | JWT | Achievements |
| 19 | GET | /api/users/settings | JWT | Users |
| 20 | PUT | /api/users/settings | JWT | Users |

Всего: **20 эндпоинтов** в 6 модулях.
