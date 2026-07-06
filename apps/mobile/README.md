# HanZi — React Native Client

Native iOS + Android app for HanZiWeb. Built on Expo + React Native 0.74,
using `@hanzi/mobile-sdk` for the cross-platform API client, sync engine,
and FSRS logic. The on-device queue and word library live in WatermelonDB
(SQLite under the hood), so the app is fully usable offline.

## What's inside

| Module              | Purpose                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `src/api/`          | (none — consumed from `@hanzi/mobile-sdk`)                                              |
| `src/bootstrap.ts`  | Wires NetInfo + MMKV + SecureStore into the SDK. Exports `api`, `useAuthStore`, `getSync` |
| `src/db/`           | WatermelonDB schema, models, and `WatermelonQueueStorage` adapter                        |
| `src/screens/`      | `LoginScreen`, `HomeScreen`, `StudyScreen`, `LibraryScreen`, `StatsScreen`              |
| `src/navigation/`   | React Navigation v6 stack + bottom tabs                                                  |
| `src/App.tsx`       | Splash → bootstrap → render navigator                                                    |

## Bootstrap order (`src/App.tsx`)

1. **Open WatermelonDB** on the SQLite adapter (`getDatabase()`).
2. **Wire the queue** — `setQueueStorage(createWatermelonQueueStorage(db))`
   binds the SDK's `SyncEngine` to the on-device `pending_changes` table.
3. **Hydrate auth** — call `/auth/refresh` (the server accepts a refresh
   token in the body when the `withRefreshToken: true` flag is set, which
   is what `apps/mobile/src/bootstrap.ts` does).
4. **Boot the sync engine** — `getSync()` returns a singleton
   `SyncEngine` that flushes the queue on every `online` event from
   NetInfo.

## Running locally

```bash
# Install dependencies (run from the monorepo root)
pnpm install

# Start the Expo dev server
pnpm --filter @hanzi/mobile start

# Build for production
pnpm --filter @hanzi/mobile build:tsc
```

To produce a real `.apk` / `.ipa` for the stores you'll need a
full Expo / EAS Build setup. The `app.json` and `expo` config are
already wired for `bundleIdentifier: com.hanzi.mobile` /
`package: com.hanzi.mobile`.

## Why this app exists

`Manifest.md` declares the mobile path; PLAN_Features_v0.2 §16 was the
last un-started item. This app uses the same TypeScript contracts from
`@hanzi/shared`, the same `SyncEngine` and `ApiClient` as `apps/web`,
and the same FSRS math as the server — so a session started on the
phone and finished on the web is bit-identical.

## Known gaps

- The Study screen ships only the flip-card practice type. The other
  five (`multiple_choice`, `reverse_choice`, `pinyin_input`, `tone_recognition`,
  `syllable_constructor`, `cloze`) live in `apps/web/src/components/practice/`
  and are not yet ported.
- `LibraryScreen` and `StatsScreen` are read-only — creating a deck
  or joining a share code requires the web UI for now.
- There is no push-notification registration (FCM) yet. The server's
  `UserDevice` table is in place but the RN-side registration is
  pending a follow-up.
