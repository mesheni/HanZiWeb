# @hanzi/shared

Cross-platform TypeScript contracts for the HanZiWeb monorepo. Ships Zod
schemas and inferred TypeScript types that all clients (web, server, mobile)
agree on.

## What lives here

- `src/schemas/*.ts` — Zod schemas for every API request/response body,
  plus shared types (`Word`, `Deck`, `User`, `Session`, `SyncRequest`,
  `SyncResponse`, etc.).
- `src/index.ts` — re-exports every schema and type from one entry point.

The package has **zero platform-specific code**: no DOM, no Node.js, no
React Native imports. It only depends on [`zod`](https://zod.dev) and is
safe to consume from Vite, Metro (React Native), Node.js, and any TS
toolchain that understands ESM.

## Installation (monorepo)

The package is a workspace member; consumers in the same monorepo install
it via `pnpm` automatically:

```jsonc
// apps/web/package.json
{
  "dependencies": { "@hanzi/shared": "workspace:*" }
}
```

## Installation (external)

The package can also be published to the public npm registry. After
`pnpm --filter @hanzi/shared run build` produces `dist/`, the
`publishConfig` block in `package.json` switches `main`/`types`/`exports`
to the built artifacts. Outside the monorepo you can install it like any
other package:

```bash
pnpm add @hanzi/shared
```

```ts
import { LoginSchema, type Login } from '@hanzi/shared';
import { WordSchema, type Word } from '@hanzi/shared/schemas/word';
```

## Usage

```ts
import { LoginSchema, SyncRequestSchema, type Login } from '@hanzi/shared';

const parsed: Login = LoginSchema.parse({
  email: 'user@example.com',
  password: 'hunter2',
});

const syncBody = SyncRequestSchema.parse({
  changes: [
    { id: '1', type: 'study_answer', payload: { wordId: 'w1', rating: 4, timestamp: new Date().toISOString() } },
  ],
});
```

## Scripts

| Script               | What it does                                       |
| -------------------- | -------------------------------------------------- |
| `pnpm typecheck`     | `tsc --noEmit` — type check the source             |
| `pnpm lint`          | Same as `typecheck` (eslint runs at the root)      |
| `pnpm build`         | `tsc -p tsconfig.build.json` → `dist/` with `.js`  |
|                      | + `.d.ts` (consumable as a published npm package)  |
| `pnpm build:watch`   | `tsc --watch` for incremental builds               |
| `pnpm clean`         | Removes `dist/`                                    |

## Versioning & publishing

This is a private workspace package in development. `version` is
incremented manually before publishing to npm (the workspace alias
`workspace:*` pins to the monorepo version for internal consumers).

## Stability

Schemas are considered the public contract. Breaking changes require
updating every consumer in the same PR.
