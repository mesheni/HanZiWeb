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
 * При клике делает `window.location.href = /api/auth/oauth/:provider`,
 * что приводит к редиректу на провайдера. После успешного flow
 * провайдер редиректит на `/auth/callback?code=…&provider=…`,
 * а `OAuthCallbackScreen` обменивает код на access+refresh.
 *
 * Кнопки для провайдеров, не настроенных на сервере, скрываются
 * (но рендерятся при `enabled=false` со tooltip'ом — решает
 * продакшен-окружение).
 */
export default function SocialLoginButtons({}: SocialLoginButtonsProps) {
  const [providers, setProviders] = useState<ProviderStatus[] | null>(null);

  useEffect(() => {
    let mounted = true;
    apiGet<ProvidersResponse>('/auth/oauth/providers')
      .then((data) => {
        if (mounted) setProviders(data.providers);
      })
      .catch(() => {
        // Сервер не ответил / нет auth-routes — просто ничего не показываем.
        if (mounted) setProviders([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (!providers || providers.length === 0) return null;

  const visible = PROVIDER_ORDER.filter((p) =>
    providers.some((ps) => ps.provider === p && ps.enabled),
  );
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {visible.map((p) => (
        <SocialButton key={p} provider={p} />
      ))}
    </div>
  );
}

function SocialButton({ provider }: { provider: OAuthProvider }) {
  const handleClick = () => {
    window.location.href = `/api/auth/oauth/${provider}`;
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm rounded-lg bg-bg-card border border-border-default text-text-primary hover:bg-bg-hover transition-colors cursor-pointer"
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
