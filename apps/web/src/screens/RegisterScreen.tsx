import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button, Input, Card } from '@/components/ui';
import SocialLoginButtons from '@/components/SocialLoginButtons';
import { apiPost } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/stores/toastStore';
import {
  isAllowedEmailTld,
  type AuthResponse,
} from '@hanzi/shared';

/**
 * Текст подсказки про ограничение `.ru` (PLAN_Features_v0.3 §3).
 * Показывается под полем email, как только пользователь ввёл валидный
 * по формату email, чей TLD не входит в белый список.
 */
const EMAIL_DOMAIN_HINT = (
  <>
    Регистрация доступна только с почтой в домене{' '}
    <span className="font-semibold">.ru</span>. Это связано с требованием
    Федерального закона №152-ФЗ «О персональных данных» о локализации
    персональных данных на территории РФ.{' '}
    <a
      href="https://base.garant.ru/12148542/"
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent hover:underline"
    >
      Подробнее о законодательстве
    </a>
    .
  </>
);

export default function RegisterScreen() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const submitLock = useRef(false);

  // Клиентская проверка домена (PLAN_Features_v0.3 §3). Источник
  // истины — сервер, но ранняя блокировка UX-а на submit экономит
  // round-trip и сразу подсказывает, какой домен принимается.
  const emailDomainValid = useMemo(() => {
    if (!email || !email.includes('@')) return true;
    return isAllowedEmailTld(email);
  }, [email]);
  const showDomainHint = email.includes('@') && !emailDomainValid;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading || submitLock.current) return;
    submitLock.current = true;
    setError('');

    if (!emailDomainValid) {
      setError(
        'Регистрация доступна только с почтой в домене .ru. См. подсказку под полем email.',
      );
      submitLock.current = false;
      return;
    }
    if (password !== confirmPassword) {
      setError('Пароли не совпадают');
      submitLock.current = false;
      return;
    }
    if (password.length < 8) {
      setError('Пароль должен быть не менее 8 символов');
      submitLock.current = false;
      return;
    }

    setLoading(true);

    try {
      const data = await apiPost<AuthResponse>('/auth/register', { email, password });
      login(data.user, data.accessToken);
      toast('Регистрация успешна', 'success');
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка регистрации');
    } finally {
      setLoading(false);
      submitLock.current = false;
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
      <Card padding="lg" className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-4xl text-accent font-bold mb-2">汉</div>
          <h1 className="text-lg font-semibold text-text-primary">Регистрация</h1>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            variant="email"
            label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.ru"
            required
            aria-invalid={showDomainHint ? true : undefined}
          />
          {showDomainHint && (
            <div
              role="alert"
              className="text-xs text-tone-4 bg-tone-4-bg px-3 py-2 rounded-lg leading-relaxed"
            >
              {EMAIL_DOMAIN_HINT}
            </div>
          )}

          <Input
            variant="password"
            label="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Минимум 8 символов"
            required
          />
          <Input
            variant="password"
            label="Подтвердите пароль"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            required
          />

          {error && (
            <div className="text-xs text-tone-4 bg-tone-4-bg px-3 py-2 rounded-lg">{error}</div>
          )}

          <Button
            type="submit"
            loading={loading}
            disabled={!emailDomainValid}
            className="w-full"
          >
            Зарегистрироваться
          </Button>
        </form>

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-border-default" />
          <span className="text-xs text-text-muted">или</span>
          <div className="flex-1 h-px bg-border-default" />
        </div>

        <SocialLoginButtons />

        <p className="text-center text-xs text-text-muted mt-4">
          Уже есть аккаунт?{' '}
          <Link to="/login" className="text-accent hover:underline">
            Войти
          </Link>
        </p>
      </Card>
    </div>
  );
}
