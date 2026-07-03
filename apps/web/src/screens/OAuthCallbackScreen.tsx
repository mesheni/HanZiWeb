import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Card } from '@/components/ui';
import { apiPost } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/stores/toastStore';
import type { AuthResponse } from '@hanzi/shared';

/**
 * Страница-обработчик редиректа после OAuth-flow.
 *
 * Сервер редиректит сюда с `?code=&provider=` (успех) или
 * `?error=&provider=` (ошибка). Обмениваем одноразовый код
 * на пару access+refresh через `POST /api/auth/oauth/exchange`.
 *
 * См. PLAN_Features_v0.2 §13.
 */
export default function OAuthCallbackScreen() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [error, setError] = useState<string | null>(null);
  const consumed = useRef(false);

  useEffect(() => {
    const code = params.get('code');
    const errorParam = params.get('error');
    const provider = params.get('provider') ?? 'провайдер';

    if (errorParam) {
      setError(`Вход через ${provider} отменён: ${errorParam}`);
      return;
    }
    if (!code) {
      setError('Не получен код авторизации');
      return;
    }
    if (consumed.current) return;
    consumed.current = true;

    (async () => {
      try {
        const data = await apiPost<AuthResponse>('/auth/oauth/exchange', { code });
        login(data.user, data.accessToken);
        toast('Вход выполнен успешно', 'success');
        navigate('/', { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка входа');
      }
    })();
  }, [params, login, navigate]);

  if (error) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
        <Card padding="lg" className="w-full max-w-sm">
          <div className="text-center mb-4">
            <div className="text-4xl text-tone-4 font-bold mb-2">!</div>
            <h1 className="text-lg font-semibold text-text-primary">Не удалось войти</h1>
          </div>
          <div className="text-xs text-tone-4 bg-tone-4-bg px-3 py-2 rounded-lg">{error}</div>
          <div className="flex gap-2 mt-4">
            <Link
              to="/login"
              className="flex-1 text-center px-4 py-2.5 text-sm rounded-lg bg-accent text-white hover:bg-accent-hover"
            >
              Назад
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
      <Card padding="lg" className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3">
          <span className="spinner" aria-label="Завершаем вход" />
          <div className="text-sm text-text-secondary">Завершаем вход…</div>
        </div>
      </Card>
    </div>
  );
}
