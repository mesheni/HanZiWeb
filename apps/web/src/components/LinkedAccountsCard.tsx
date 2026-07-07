import { useEffect, useState, useCallback } from 'react';
import { Link2, Unlink } from 'lucide-react';
import { OAUTH_PROVIDER_LABELS, type OAuthProvider, type UserAccountsResponse } from '@hanzi/shared';
import { apiGet, apiDelete } from '@/api/client';
import { toast } from '@/stores/toastStore';

/**
 * Карточка «Привязанные аккаунты» (Google / Apple / Яндекс) для
 * `SettingsScreen` (PLAN_Features_v0.2 §13).
 *
 * - Показывает список OAuth-привязок.
 * - Позволяет отвязать провайдера (если у пользователя остаётся
 *   хотя бы один способ входа — сервер всё равно проверит).
 * - Кнопки привязки нового провайдера отсутствуют — `SocialLoginButtons`
 *   на экране логина умеет «создать новый» или «войти в существующий»
 *   с auto-link по verified email.
 */
export default function LinkedAccountsCard() {
  const [data, setData] = useState<UserAccountsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [unlinking, setUnlinking] = useState<OAuthProvider | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet<UserAccountsResponse>('/auth/accounts');
      setData(res);
    } catch {
      // Игнорируем — карточка просто остаётся пустой.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUnlink = async (provider: OAuthProvider) => {
    if (unlinking) return;
    setUnlinking(provider);
    try {
      await apiDelete(`/auth/accounts/${provider}`);
      toast(`Аккаунт ${OAUTH_PROVIDER_LABELS[provider]} отвязан`, 'success');
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Не удалось отвязать аккаунт', 'error');
    } finally {
      setUnlinking(null);
    }
  };

  return (
    <section className="settings-card">
      <header className="settings-card-header">
        <div className="settings-card-header-meta">
          <div className="settings-card-icon bg-tone-1-bg text-tone-1">
            <Link2 size={18} />
          </div>
          <div className="settings-card-titles">
            <div className="settings-card-title">Привязанные аккаунты</div>
            <div className="settings-card-description">
              Войти также можно через Яндекс.
            </div>
          </div>
        </div>
      </header>

      <div className="settings-card-body">
        {loading ? (
          <div className="text-sm text-text-muted">Загрузка…</div>
        ) : data && data.accounts.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {data.accounts.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-bg-primary border border-border-default"
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-sm text-text-primary">
                    {OAUTH_PROVIDER_LABELS[a.provider]}
                  </span>
                  {a.providerEmail && (
                    <span className="text-xs text-text-muted truncate">{a.providerEmail}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleUnlink(a.provider)}
                  disabled={!data.canUnlink || unlinking === a.provider}
                  title={data.canUnlink ? 'Отвязать' : 'Невозможно удалить единственный способ входа'}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-border-default text-text-secondary hover:bg-bg-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Unlink size={14} />
                  {unlinking === a.provider ? 'Отвязка…' : 'Отвязать'}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-text-muted">
            Социальные аккаунты не привязаны. Войдите через Яндекс на экране «Вход» — это
            автоматически создаст привязку.
          </div>
        )}
      </div>
    </section>
  );
}
