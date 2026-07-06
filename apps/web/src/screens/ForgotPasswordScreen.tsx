import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button, Input, Card } from '@/components/ui';
import { useForgotPassword } from '@/queries/auth';

/**
 * Экран «Забыли пароль?» (PLAN_Features_v0.3 §2).
 *
 * Вводим email → отправляем запрос на `/api/auth/forgot-password`.
 * Сервер ВСЕГДА отвечает `success: true` (даже если такого email нет),
 * чтобы не давать enumeration-утечек. На экране показываем общее
 * сообщение «Если аккаунт существует, письмо отправлено».
 *
 * Реальные ошибки (rate limit / 503 / 500) — показываем явно.
 */
export default function ForgotPasswordScreen() {
  const navigate = useNavigate();
  const forgot = useForgotPassword();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);

  const validate = (): string | null => {
    if (!email) return 'Введите email';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Похоже на некорректный email';
    return null;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const validation = validate();
    setClientError(validation);
    if (validation) return;

    setError('');
    try {
      await forgot.mutateAsync({ email });
      setSubmitted(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось отправить запрос';
      if (/rate limit|too many/i.test(message)) {
        setError('Слишком много попыток. Повторите через 15 минут.');
      } else if (/EMAIL_NOT_CONFIGURED|not configured/i.test(message)) {
        setError('Сервис отправки писем временно недоступен. Попробуйте позже.');
      } else if (/EMAIL_SEND_FAILED|send/i.test(message)) {
        setError('Не удалось отправить письмо. Попробуйте позже.');
      } else {
        setError(message);
      }
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
        <Card padding="lg" className="w-full max-w-sm">
          <div className="text-center mb-4">
            <div className="text-4xl mb-2">✉️</div>
            <h1 className="text-lg font-semibold text-text-primary">Проверьте почту</h1>
          </div>
          <p className="text-sm text-text-secondary text-center leading-relaxed">
            Если аккаунт с адресом <span className="font-medium text-text-primary">{email}</span>{' '}
            существует, мы отправили на него письмо со ссылкой для сброса пароля.
            Ссылка активна 15 минут.
          </p>
          <p className="text-xs text-text-muted text-center mt-4">
            Не пришло письмо? Проверьте папку «Спам» или вернитесь на{' '}
            <button
              type="button"
              onClick={() => setSubmitted(false)}
              className="text-accent hover:underline"
            >
              форму запроса
            </button>
            .
          </p>
          <div className="text-center mt-6">
            <Link to="/login" className="text-sm text-accent hover:underline">
              Вернуться ко входу
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
      <Card padding="lg" className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-4xl text-accent font-bold mb-2">汉</div>
          <h1 className="text-lg font-semibold text-text-primary">Забыли пароль?</h1>
          <p className="text-xs text-text-muted mt-2">
            Введите email — мы отправим ссылку для сброса.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <Input
            variant="email"
            label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            autoComplete="email"
            autoFocus
            required
            {...(clientError ? { error: clientError } : {})}
          />

          {error && (
            <div className="text-xs text-tone-4 bg-tone-4-bg px-3 py-2 rounded-lg">{error}</div>
          )}

          <Button
            type="submit"
            loading={forgot.isPending}
            disabled={forgot.isPending || !email}
            className="w-full"
          >
            Отправить ссылку
          </Button>
        </form>

        <p className="text-center text-xs text-text-muted mt-4">
          Вспомнили пароль?{' '}
          <Link to="/login" className="text-accent hover:underline">
            Войти
          </Link>
          {' · '}
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-accent hover:underline"
          >
            Назад
          </button>
        </p>
      </Card>
    </div>
  );
}
