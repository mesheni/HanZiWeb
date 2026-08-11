// F30: единый setup для web-тестов. fake-indexeddb глобально — RxDB
// (database.ts, wordsCache.ts) работает в node/jsdom без реального
// IndexedDB.
import 'fake-indexeddb/auto';
