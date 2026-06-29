import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, RotateCcw, RefreshCw, DatabaseZap } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { clearWordsCollection, resetLocalDatabase } from '@/db/database';
import { apiGet, apiPost } from '@/api/client';
import { toast } from '@/stores/toastStore';
import type { PaginatedResponse, WordListItem } from '@hanzi/shared';

async function fetchAllWords() {
  const all: WordListItem[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const page = await apiGet<PaginatedResponse<WordListItem>>(`/words?limit=${limit}&offset=${offset}`);
    all.push(...page.data);

    if (page.data.length < limit || offset + limit >= page.pagination.total) {
      break;
    }

    offset += limit;
  }

  return all;
}

export default function SettingsScreen() {
  const navigate = useNavigate();
  const [resetLoading, setResetLoading] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [reindexLoading, setReindexLoading] = useState(false);

  const upsertWords = async (words: WordListItem[]) => {
    const { getDb } = await import('@/db/database');
    const db = getDb();
    if (!db) throw new Error('Database not initialized');

    for (const w of words) {
      await db.words.upsert({
        id: w.id,
        character: w.character,
        pinyin: w.pinyin,
        translation: w.translation,
        hskLevel: w.hskLevel ?? null,
        audioUrl: null,
        mnemonic: null,
        createdAt: new Date().toISOString(),
        examples: [],
      });
    }
  };

  const handleResetLocalData = async () => {
    setResetLoading(true);
    try {
      await apiPost('/stats/reset-progress');
      await resetLocalDatabase();
      toast('Локальные данные очищены', 'success');
      window.location.reload();
    } catch {
      toast('Не удалось очистить локальные данные', 'error');
      setResetLoading(false);
    }
  };

  const handleRefreshWordsCache = async () => {
    setRefreshLoading(true);
    try {
      const words = await fetchAllWords();
      await upsertWords(words);
      toast('Кэш слов обновлён', 'success');
    } catch {
      toast('Не удалось обновить кэш слов', 'error');
    } finally {
      setRefreshLoading(false);
    }
  };

  const handleReindexDictionary = async () => {
    setReindexLoading(true);
    try {
      await clearWordsCollection();
      const words = await fetchAllWords();
      await upsertWords(words);
      toast('Словарь переиндексирован', 'success');
    } catch {
      toast('Не удалось переиндексировать словарь', 'error');
    } finally {
      setReindexLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 overflow-y-auto p-6">
      <div className="max-w-xl mx-auto flex flex-col gap-4">
        <div>
          <div className="text-2xl font-semibold text-text-primary">Настройки</div>
          <div className="text-sm text-text-muted mt-1">Управление локальными данными приложения.</div>
        </div>

        <Card padding="lg" className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-tone-4-bg text-tone-4 flex items-center justify-center shrink-0">
              <Trash2 size={18} />
            </div>
            <div className="flex-1">
              <div className="font-medium text-text-primary">Сбросить локальную БД</div>
              <div className="text-sm text-text-muted mt-1">
                Сбрасывает прогресс на сервере, удаляет IndexedDB `hanzi` со словами,
                прогрессом и очередью синхронизации. После этого приложение перезагрузится.
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Button variant="secondary" loading={refreshLoading} onClick={handleRefreshWordsCache}>
              <RefreshCw size={16} />
              Обновить кэш слов
            </Button>
            <Button variant="secondary" loading={reindexLoading} onClick={handleReindexDictionary}>
              <DatabaseZap size={16} />
              Переиндексировать словарь
            </Button>
            <Button variant="danger" loading={resetLoading} onClick={handleResetLocalData}>
              <RotateCcw size={16} />
              Сбросить данные
            </Button>
            <Button variant="secondary" onClick={() => navigate(-1)}>
              Назад
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
