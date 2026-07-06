import { Model } from '@nozbe/watermelondb';
import { field, text, date, json, readonly } from '@nozbe/watermelondb/decorators';

/**
 * A Hanzi word cached locally on the device. The mobile app downloads
 * the user's library once on first launch and keeps it in sync with
 * the server via `GET /api/words?cursor=...` (full sync) plus
 * `POST /api/sync` (delta sync).
 */
export class WordModel extends Model {
  static table = 'words';

  @text('character') character!: string;
  @text('pinyin') pinyin!: string;
  @text('translation') translation!: string;
  @field('hsk_level') hskLevel!: number | null;
  @text('audio_url') audioUrl!: string | null;
  @text('mnemonic') mnemonic!: string | null;
  @date('created_at') createdAt!: Date;
  @json('examples', sanitizeExamples) examples!: ExampleData[];
  @json('tags', sanitizeTags) tags!: TagData[];
}

export interface ExampleData {
  id: string;
  chinese: string;
  russian: string;
}

export interface TagData {
  id: string;
  name: string;
  slug: string;
  color: string | null;
}

function sanitizeExamples(raw: unknown): ExampleData[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is ExampleData =>
      typeof e === 'object' &&
      e !== null &&
      typeof (e as ExampleData).id === 'string' &&
      typeof (e as ExampleData).chinese === 'string' &&
      typeof (e as ExampleData).russian === 'string',
  );
}

function sanitizeTags(raw: unknown): TagData[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (t): t is TagData =>
      typeof t === 'object' &&
      t !== null &&
      typeof (t as TagData).id === 'string' &&
      typeof (t as TagData).name === 'string',
  );
}

/**
 * Per-user/per-word SRS progress. Mirrors `UserWordProgress` on the
 * server; the same FSRS math is applied both on the client (for
 * instant feedback) and on the server (for source of truth).
 */
export class ProgressModel extends Model {
  static table = 'progress';

  @text('user_id') userId!: string;
  @text('word_id') wordId!: string;
  @text('state') state!: string;
  @field('stability') stability!: number;
  @field('difficulty') difficulty!: number;
  @field('reps') reps!: number;
  @text('due_date') dueDate!: string;
  @text('last_review_date') lastReviewDate!: string | null;
}

/**
 * Outbound queue of pending changes waiting to be flushed to the
 * server. Mirrors the `pending_changes` RxDB collection on web.
 */
export class PendingChangeModel extends Model {
  static table = 'pending_changes';

  @text('change_id') changeId!: string;
  @text('type') type!: string;
  @json('payload', sanitizePayload) payload!: Record<string, unknown>;
  @field('is_synced') isSynced!: boolean;
  @readonly @date('created_at') createdAt!: Date;
}

function sanitizePayload(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}
