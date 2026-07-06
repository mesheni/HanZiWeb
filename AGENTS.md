# HanZiWeb — Agent Notes

Monorepo (pnpm workspaces + Turborepo) for the HanZi Chinese vocabulary SRS app:
web client (Vite/React), Fastify API server (Prisma/Postgres + Redis), React Native
mobile (Expo + WatermelonDB), and shared TypeScript packages.

## Layout

```
apps/
  web/         @hanzi/web    Vite + React 18, PWA, RxDB local store
  server/      @hanzi/server Fastify 5 + Prisma 5 + Postgres + Redis
  mobile/      @hanzi/mobile Expo SDK 51, RN 0.74, WatermelonDB
packages/
  shared/      @hanzi/shared  Zod schemas + TS types (zero deps except zod)
  mobile-sdk/  @hanzi/mobile-sdk  cross-platform ApiClient, SyncEngine, FSRS
```

Workspace roots: `pnpm-workspace.yaml` lists `packages/*` and `apps/*`.
Node ≥ 20, pnpm ≥ 9 (pinned `pnpm@9.12.0` via `packageManager`).

## Commands (run from repo root unless noted)

| Task                         | Command                                         |
| ---------------------------- | ----------------------------------------------- |
| Install everything           | `pnpm install`                                  |
| Dev all (web+server+mobile)  | `pnpm dev` (turbo, persistent)                  |
| Dev web only                 | `pnpm --filter @hanzi/web dev`                  |
| Dev server only              | `pnpm --filter @hanzi/server dev` (tsx watch)   |
| Dev mobile only              | `pnpm --filter @hanzi/mobile start`             |
| Typecheck whole repo         | `pnpm typecheck`                                |
| Lint whole repo              | `pnpm lint` (root eslint.config.mjs)            |
| Build all                    | `pnpm build` (turbo, `dependsOn: ["^build"]`)  |
| Tests                        | `pnpm --filter @hanzi/mobile-sdk test` (vitest) |
| Format                       | `pnpm format` (prettier --write)                |
| Run one server test          | `pnpm --filter @hanzi/server exec vitest run path/to/file.test.ts` |
| Local stack (pg+redis+api+web) | `docker compose up --build` from root          |

`lint` and `typecheck` in every workspace are both wired to `tsc --noEmit`
(see `apps/web/package.json`, `apps/server/package.json`, etc.). The
per-app `eslint.config.mjs` files re-export the root config — no
app-specific rules.

## Web (`apps/web`)

- Vite dev server on `:5173`; `/api/*` is proxied to `http://localhost:3001`
  (`apps/web/vite.config.ts`). Set `VITE_API_URL` in `.env` for the
  built-in `fetch` client (`src/api/client.ts`).
- Entry: `src/main.tsx` → `App.tsx` (react-router). Bootstrap order is
  `bootstrapTheme() → initAnalytics() → initDb() → initSyncEngine()`.
  Don't reorder — `initSyncEngine()` depends on the RxDB instance.
- Local DB is **RxDB 15 + Dexie** (`src/db/database.ts`). On schema
  mismatch the init retries once after `indexedDB.deleteDatabase('hanzi')`.
  Call `resetLocalDatabase()` to wipe.
- PWA via `vite-plugin-pwa` (`injectManifest`, custom `src/sw.ts`).
- Build pipeline (`pnpm --filter @hanzi/web build`) runs
  `copy-hw-data && tsc && vite build`. The `copy-hw-data` step copies
  `hanzi-writer-data` JSON files from `node_modules` into
  `public/hanzi-writer-data/` (gitignored) — required before the
  handwriting screen can load strokes offline.
- Path alias `@/*` → `src/*` (vite + tsconfig both).
- Auth state: zustand store `src/stores/authStore.ts`. Tokens stored in
  zustand only; refresh token rides an httpOnly cookie. The client
  (`src/api/client.ts`) does a transparent `/auth/refresh` on 401.

## Server (`apps/server`)

- Fastify 5. Routes are mounted under `/api` (general) and `/api/auth`
  (rate-limited to 20/min); the global error handler maps
  `ZodError → 400`, Prisma `P2025 → 404`, `P2002 → 409`, anything with
  `statusCode ≥ 400` is forwarded as-is (`src/index.ts`).
- Health check at `GET /api/health` actively pings Postgres + Redis and
  reports `{ status: 'ok' | 'degraded', db, redis }`.
- Prisma schema: `prisma/schema.prisma`. Migrations live in
  `prisma/migrations/` — **do not edit by hand**, use
  `pnpm --filter @hanzi/server db:migrate`. `db:push` is the dev shortcut
  when you don't need a migration file.
- Required env (see `apps/server/.env.example`):
  - `DATABASE_URL` (Postgres), `REDIS_URL` — defaults match `docker-compose.yml`
  - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — min 32 chars (Zod-enforced)
  - `CORS_ORIGIN` (default `http://localhost:5173`)
  - Optional: `GOOGLE_APPLICATION_CREDENTIALS` / `GCS_BUCKET_NAME` (audio),
    `VAPID_*` (push), `*_OAUTH_CLIENT_ID/SECRET` (Google/Apple/Yandex),
    `POSTHOG_API_KEY` (analytics; server becomes no-op if missing).
- Dev uses `tsx watch src/index.ts`. Test setup (`vitest.setup.ts`)
  pre-fills the same env vars so `loadConfig()` won't exit on import.
- Seeds: `prisma/seed.ts` loads `prisma/seeds/hsk{1..6}.json` (Hanzi
  word lists). Run via `pnpm --filter @hanzi/server db:seed`.
- Scripts: `audio:generate` (Google TTS), `examples:seed` for example
  sentences.

## Mobile (`apps/mobile`)

- Expo SDK 51, RN 0.74, new arch on. Bundle id / package `com.hanzi.mobile`.
- `index.js` is the entry registered with Expo; `app.json` configures
  `scheme: "hanzimobile"`.
- Bootstrap order in `src/App.tsx`:
  1. `getDatabase()` (WatermelonDB on SQLite)
  2. `setQueueStorage(createWatermelonQueueStorage(db))`
  3. `useAuthStore.getState().hydrateAuth(...)`
  4. `getSync()` (returns the SDK `SyncEngine` singleton)
  Skipping step 2 leaves the sync queue un-persisted.
- API base URL comes from `EXPO_PUBLIC_API_URL` (see
  `packages/mobile-sdk/README.md`); defaults to `app.json#extra.apiUrl`
  for production builds.
- `src/screens/StudyScreen.tsx` only implements flip-card practice. The
  other 6 practice types live in `apps/web/src/components/practice/` and
  are not yet ported (see `apps/mobile/README.md`).

## Shared packages

- `@hanzi/shared` exports Zod schemas + inferred types from
  `src/schemas/*.ts`. **The schema set is the public contract** —
  breaking changes must update every consumer in the same PR. Within the
  monorepo it resolves to `src/index.ts` (no build needed); the
  `publishConfig` block switches `main`/`types` to `dist/` for external
  consumers (`pnpm --filter @hanzi/shared build`).
- `@hanzi/mobile-sdk` is the cross-platform runtime (api/sync/auth/fsrs/
  network/storage). It never imports `window` or React Native modules
  directly — the host must inject adapters at startup
  (`setNetworkAdapter`, `setSecureStorage`, `setTokenStore`,
  `setQueueStorage`). See `packages/mobile-sdk/README.md` for the
  web vs RN wiring. Tests run in Node (`vitest.config.ts` →
  `environment: 'node'`).

## Conventions

- TypeScript: `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`,
  `noUnusedParameters` (see `tsconfig.base.json`). Expect TS errors for
  unused imports — run `pnpm typecheck` after edits.
- Prettier: 2 spaces, single quotes, trailing commas, 100 col
  (`.prettierrc`). EditorConfig: LF line endings, UTF-8.
- ESLint root config (`eslint.config.mjs`) ignores `dist/`, `node_modules/`,
  `.turbo/`, `.codegraph/`, `.omo/`, `prisma/migrations/`. Per-app
  configs just re-export the root.
- No comments in source unless asked.

## Plan / reference docs

The `plan/` directory has the project blueprint:
`Manifest.md`, `PLAN.md`, `decisions.md`, plus a static HTML prototype.
`PLAN_Features_v0.2` and `PLANCorrection` in the repo root are working
notes for the v0.2 feature set. The full HTTP contract is documented
in `packages/shared/api-spec.md`.
