# @hanzi/mobile-sdk

Cross-platform runtime for the HanZiWeb monorepo. Encapsulates the
infrastructure that the **web** (`apps/web`, Vite + React 18) and the
**React Native** (`apps/mobile`, Expo) clients both need:

| Module       | What it does                                                                   |
| ------------ | ------------------------------------------------------------------------------ |
| `api`        | `ApiClient` — `fetch` wrapper with auto-refresh + tagged-union error responses |
| `auth`       | `createAuthStore` (zustand), `TokenStore` interface, helpers                   |
| `fsrs`       | `recalcFsrs()` — same FSRS v5 implementation as the server                     |
| `network`    | `NetworkAdapter` — pluggable `navigator.onLine` (web) / NetInfo (RN)           |
| `storage`    | `SecureStorage` — pluggable `localStorage` (web) / MMKV (RN)                  |
| `sync`       | `SyncEngine` + `QueueStorage` — offline-first delta sync                       |

## Install (workspace)

The package is a workspace member; consumers in the monorepo install
it automatically via `workspace:*`:

```jsonc
// apps/web/package.json
{ "dependencies": { "@hanzi/mobile-sdk": "workspace:*" } }

// apps/mobile/package.json
{ "dependencies": { "@hanzi/mobile-sdk": "workspace:*" } }
```

## Wiring it up

The SDK never reaches for `window`, `navigator`, or any React-Native
module directly. The host has to inject the right adapter at startup:

```ts
// apps/web/src/main.tsx
import {
  setNetworkAdapter, setSecureStorage, setTokenStore,
  createDefaultTokenStore, createAuthStore, ApiClient, SyncEngine,
  createMemoryQueueStorage,
} from '@hanzi/mobile-sdk';

setNetworkAdapter(makeWebNetworkAdapter());   // navigator.onLine + window events
setSecureStorage(makeWebSecureStorage());     // localStorage wrapper
setTokenStore(createDefaultTokenStore());

export const useAuthStore = createAuthStore();
export const api = new ApiClient({ baseUrl: '/api', refresh: doRefresh });
export const sync = new SyncEngine({ api, storage: createMemoryQueueStorage() });
```

```ts
// apps/mobile/src/bootstrap.ts
import NetInfo from '@react-native-community/netinfo';
import { MMKV } from 'react-native-mmkv';
import {
  setNetworkAdapter, setSecureStorage, setTokenStore, createDefaultTokenStore,
  ApiClient, SyncEngine,
} from '@hanzi/mobile-sdk';
import { WatermelonQueueStorage } from './db/sync/WatermelonQueueStorage';

const mmkv = new MMKV();
setNetworkAdapter(makeNetInfoAdapter(NetInfo));
setSecureStorage(makeMmkvStorage(mmkv));
setTokenStore(createDefaultTokenStore());

export const api = new ApiClient({ baseUrl: process.env.EXPO_PUBLIC_API_URL!, refresh: doRefresh });
export const sync = new SyncEngine({ api, storage: new WatermelonQueueStorage(database) });
```

## Scripts

| Script              | What it does                                  |
| ------------------- | --------------------------------------------- |
| `pnpm typecheck`    | `tsc --noEmit`                                |
| `pnpm test`         | vitest run (Node environment)                 |
| `pnpm test:watch`   | vitest in watch mode                          |
| `pnpm build`        | `tsc -p tsconfig.build.json` → `dist/`        |
| `pnpm clean`        | Removes `dist/`                               |

## License

UNLICENSED — internal use only.
