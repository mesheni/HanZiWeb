import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, RotateCcw, RefreshCw, DatabaseZap, Bell, BellOff } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { clearWordsCollection, resetLocalDatabase } from '@/db/database';
import { apiGet, apiPost, apiPut } from '@/api/client';
import { subscribeToPush, unsubscribeFromPush, isPushSubscribed } from '@/api/push';
import { toast } from '@/stores/toastStore';
import type { PaginatedResponse, WordListItem } from '@hanzi/shared';

type NotificationTime = 'morning' | 'evening' | 'both';

interface NotificationSettings {
  notificationEnabled: boolean;
  notificationTime: NotificationTime;
  notificationFrequency: number;
}

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
  const [notifLoading, setNotifLoading] = useState(false);
  const [pushSupported] = useState(() => 'serviceWorker' in navigator && 'PushManager' in window);
  const [subscribed, setSubscribed] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings>({
    notificationEnabled: false,
    notificationTime: 'morning',
    notificationFrequency: 1,
  });

  const loadSettings = useCallback(async () => {
    try {
      const data = await apiGet<NotificationSettings>('/devices/notification-settings');
      setSettings(data);
      const isSub = await isPushSubscribed();
      setSubscribed(isSub);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

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

  const handleToggleNotifications = async () => {
    setNotifLoading(true);
    try {
      if (!settings.notificationEnabled) {
        const ok = await subscribeToPush();
        if (!ok) {
          toast('Не удалось подписаться на уведомления', 'error');
          setNotifLoading(false);
          return;
        }
        const newSettings = { ...settings, notificationEnabled: true };
        await apiPut('/devices/notification-settings', newSettings);
        setSettings(newSettings);
        setSubscribed(true);
        toast('Уведомления включены', 'success');
      } else {
        await unsubscribeFromPush();
        const newSettings = { ...settings, notificationEnabled: false };
        await apiPut('/devices/notification-settings', newSettings);
        setSettings(newSettings);
        setSubscribed(false);
        toast('Уведомления выключены', 'success');
      }
    } catch {
      toast('Ошибка при изменении настроек уведомлений', 'error');
    } finally {
      setNotifLoading(false);
    }
  };

  const handleTimeChange = async (time: NotificationTime) => {
    const newSettings = { ...settings, notificationTime: time };
    try {
      await apiPut('/devices/notification-settings', newSettings);
      setSettings(newSettings);
    } catch {
      toast('Не удалось сохранить настройки', 'error');
    }
  };

  const handleFrequencyChange = async (freq: number) => {
    const newSettings = { ...settings, notificationFrequency: freq };
    try {
      await apiPut('/devices/notification-settings', newSettings);
      setSettings(newSettings);
    } catch {
      toast('Не удалось сохранить настройки', 'error');
    }
  };

  const timeLabels: Record<NotificationTime, string> = {
    morning: 'Утро (7:00–12:00)',
    evening: 'Вечер (18:00–23:00)',
    both: 'Утро и вечер',
  };

  return (
    <div className="absolute inset-0 overflow-y-auto p-6">
      <div className="max-w-xl mx-auto flex flex-col gap-4">
        <div>
          <div className="text-2xl font-semibold text-text-primary">Настройки</div>
          <div className="text-sm text-text-muted mt-1">Управление данными и уведомлениями.</div>
        </div>

        {pushSupported && (
          <Card padding="lg" className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-tone-1-bg text-tone-1 flex items-center justify-center shrink-0">
                {settings.notificationEnabled ? <Bell size={18} /> : <BellOff size={18} />}
              </div>
              <div className="flex-1">
                <div className="font-medium text-text-primary">Push-уведомления</div>
                <div className="text-sm text-text-muted mt-1">
                  Напоминания о словах, которые нужно повторить сегодня.
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Button
                variant={settings.notificationEnabled ? 'danger' : 'primary'}
                loading={notifLoading}
                onClick={handleToggleNotifications}
              >
                {settings.notificationEnabled ? 'Выключить уведомления' : 'Включить уведомления'}
              </Button>

              {settings.notificationEnabled && subscribed && (
                <>
                  <div>
                    <div className="text-sm text-text-secondary mb-2">Время уведомлений</div>
                    <div className="flex flex-wrap gap-2">
                      {(['morning', 'evening', 'both'] as NotificationTime[]).map((time) => (
                        <button
                          key={time}
                          onClick={() => handleTimeChange(time)}
                          className={`px-3 py-1.5 text-xs rounded-lg border transition-colors cursor-pointer ${
                            settings.notificationTime === time
                              ? 'bg-accent text-white border-accent'
                              : 'bg-bg-card border-border-default text-text-secondary hover:bg-bg-hover'
                          }`}
                        >
                          {timeLabels[time]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-text-secondary mb-2">
                      Частота: {settings.notificationFrequency} раз/день
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={4}
                      value={settings.notificationFrequency}
                      onChange={(e) => handleFrequencyChange(Number(e.target.value))}
                      className="w-full accent-accent"
                    />
                    <div className="flex justify-between text-xs text-text-muted">
                      <span>1</span>
                      <span>2</span>
                      <span>3</span>
                      <span>4</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </Card>
        )}

        <Card padding="lg" className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-tone-4-bg text-tone-4 flex items-center justify-center shrink-0">
              <Trash2 size={18} />
            </div>
            <div className="flex-1">
              <div className="font-medium text-text-primary">Локальные данные</div>
              <div className="text-sm text-text-muted mt-1">
                Управление кэшем слов и локальной базой данных.
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
