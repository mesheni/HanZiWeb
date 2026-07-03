import { useEffect, useState } from 'react';
import { OAUTH_PROVIDER_LABELS, type OAuthProvider } from '@hanzi/shared';
import { apiGet } from '@/api/client';

interface ProviderStatus {
  provider: OAuthProvider;
  enabled: boolean;
}

interface ProvidersResponse {
  providers: ProviderStatus[];
}

interface SocialLoginButtonsProps {
  /** Куда редиректить при успешной авторизации (default `/`). */
  redirectTo?: string;
}

const PROVIDER_ORDER: OAuthProvider[] = ['google', 'apple', 'yandex'];

/**
 * Кнопки «Войти через Google / Apple / Яндекс» (PLAN_Features_v0.2 §13).
 *
 * Поведение:
 * - При клике делает `window.location.href = /api/auth/oauth/:provider`,
 *   что приводит к редиректу на провайдера. После успешного flow
 *   провайдер редиректит на `/auth/callback?code=…&provider=…`,
 *   а `OAuthCallbackScreen` обменивает код на access+refresh.
 * - Кнопки для **сконфигурированных** провайдеров — активные.
 * - Кнопки для **не сконфигурированных** провайдеров (нет
 *   client_id/secret на сервере) показываются в disabled-состоянии
 *   с подсказкой «Не настроен на сервере». Так пользователь/дев
 *   сразу видит, что фича существует, и может включить её через
 *   env-переменные.
 * - Если запрос к `/auth/oauth/providers` упал, показываем все три
 *   кнопки как disabled (сервер недоступен / нет auth-routes).
 */
export default function SocialLoginButtons({}: SocialLoginButtonsProps) {
  const [providers, setProviders] = useState<ProviderStatus[] | null>(null);
  const [serverReachable, setServerReachable] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    apiGet<ProvidersResponse>('/auth/oauth/providers')
      .then((data) => {
        if (mounted) {
          setProviders(data.providers ?? []);
          setServerReachable(true);
        }
      })
      .catch(() => {
        if (mounted) {
          setProviders([]);
          setServerReachable(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Строим карту provider → enabled; если ответ пустой, помечаем
  // все три как disabled (или "сервер недоступен" — тогда тоже disabled).
  const enabledMap = new Map<OAuthProvider, boolean>();
  for (const p of PROVIDER_ORDER) enabledMap.set(p, false);
  if (providers) {
    for (const ps of providers) enabledMap.set(ps.provider, ps.enabled);
  }

  return (
    <div className="flex flex-col gap-2">
      {PROVIDER_ORDER.map((p) => (
        <SocialButton
          key={p}
          provider={p}
          enabled={enabledMap.get(p) === true && serverReachable}
        />
      ))}
    </div>
  );
}

function SocialButton({
  provider,
  enabled,
}: {
  provider: OAuthProvider;
  enabled: boolean;
}) {
  const handleClick = () => {
    if (!enabled) return;
    window.location.href = `/api/auth/oauth/${provider}`;
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!enabled}
      title={
        enabled
          ? `Войти через ${OAUTH_PROVIDER_LABELS[provider]}`
          : `${OAUTH_PROVIDER_LABELS[provider]} не настроен на сервере`
      }
      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm rounded-lg bg-bg-card border border-border-default text-text-primary hover:bg-bg-hover transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-bg-card"
    >
      <ProviderIcon provider={provider} />
      Войти через {OAUTH_PROVIDER_LABELS[provider]}
    </button>
  );
}

function ProviderIcon({ provider }: { provider: OAuthProvider }) {
  // Простые монохромные «буквенные» иконки — без сторонних пакетов.
  if (provider === 'google') {
    return (
      <span aria-hidden className="font-bold text-[15px] leading-none w-5 text-center">
        G
      </span>
    );
  }
  if (provider === 'apple') {
    return (
      <span aria-hidden className="font-bold text-[15px] leading-none w-5 text-center">

      </span>
    );
  }
  // yandex
  return (
    <span aria-hidden className="font-bold text-[15px] leading-none w-5 text-center text-tone-4">
      Я
    </span>
  );
}
