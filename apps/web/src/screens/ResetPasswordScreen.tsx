import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Button, Input, Card } from '@/components/ui';
import { useResetPassword } from '@/queries/auth';

type FieldErrors = {
  newPassword?: string;
  confirmPassword?: string;
};

/**
 * Простой индикатор сложности (4 уровня).
 * Скопирован из `ChangePasswordCard`, чтобы UX был одинаковым.
 */
function passwordStrength(password: string): { score: 0 | 1 | 2 | 3 | 4; label: string; color: string } {
  if (!password) return { score: 0, label: '—', color: 'bg-border-default' };

  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  const clamped = Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
  const labels = ['Очень слабый', 'Слабый', 'Средний', 'Надёжный', 'Сильный'] as const;
  const colors = ['bg-tone-4', 'bg-tone-4', 'bg-tone-3', 'bg-tone-2', 'bg-tone-2'] as const;
  return { score: clamped, label: labels[clamped], color: colors[clamped] };
}

/**
 * Экран «Новый пароль» (PLAN_Features_v0.3 §2).
 *
 * Открывается по ссылке из письма: `/reset-password?token=…`.
 * Если токена нет — редиректим на `/forgot-password`.
 *
 * На успех — редирект на `/login`.
 */
export default function ResetPasswordScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const reset = useResetPassword();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const strength = useMemo(() => passwordStrength(newPassword), [newPassword]);

  if (!token) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
        <Card padding="lg" className="w-full max-w-sm">
          <div className="text-center mb-4">
            <div className="text-4xl mb-2">⚠️</div>
            <h1 className="text-lg font-semibold text-text-primary">Ссылка неполная</h1>
          </div>
          <p className="text-sm text-text-secondary text-center leading-relaxed">
            Откройте ссылку из письма целиком или запросите новую.
          </p>
          <div className="text-center mt-6">
            <Link to="/forgot-password" className="text-sm text-accent hover:underline">
              Запросить новую ссылку
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (newPassword.length < 8 || newPassword.length > 128) {
      next.newPassword = 'От 8 до 128 символов';
    }
    if (confirmPassword !== newPassword) {
      next.confirmPassword = 'Пароли не совпадают';
    }
    return next;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setError('');
    try {
      await reset.mutateAsync({ token, newPassword });
      setSuccess(true);
      setTimeout(() => navigate('/login', { replace: true }), 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось сбросить пароль';
      if (/INVALID_TOKEN|invalid or expired/i.test(message)) {
        setError('Ссылка недействительна или истёк срок. Запросите новую.');
      } else if (/rate limit|too many/i.test(message)) {
        setError('Слишком много попыток. Повторите через 15 минут.');
      } else if (/VALIDATION_ERROR|min\(|max\(/i.test(message)) {
        setError('Пароль не прошёл проверку. Используйте 8–128 символов.');
      } else {
        setError(message);
      }
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
        <Card padding="lg" className="w-full max-w-sm">
          <div className="text-center mb-4">
            <div className="text-4xl mb-2">✅</div>
            <h1 className="text-lg font-semibold text-text-primary">Пароль изменён</h1>
          </div>
          <p className="text-sm text-text-secondary text-center leading-relaxed">
            Сейчас перенаправим вас на страницу входа.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
      <Card padding="lg" className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-4xl text-accent font-bold mb-2">汉</div>
          <h1 className="text-lg font-semibold text-text-primary">Новый пароль</h1>
          <p className="text-xs text-text-muted mt-2">Придумайте пароль от 8 символов.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div>
            <Input
              variant="password"
              label="Новый пароль"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              autoFocus
              required
              {...(errors.newPassword ? { error: errors.newPassword } : {})}
            />
            {newPassword && (
              <div className="mt-2 space-y-1">
                <div className="flex gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        i < strength.score ? strength.color : 'bg-border-default'
                      }`}
                    />
                  ))}
                </div>
                <div className="text-xs text-text-muted">Сложность: {strength.label}</div>
              </div>
            )}
          </div>

          <Input
            variant="password"
            label="Подтверждение пароля"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            required
            {...(errors.confirmPassword ? { error: errors.confirmPassword } : {})}
          />

          {error && (
            <div className="text-xs text-tone-4 bg-tone-4-bg px-3 py-2 rounded-lg">{error}</div>
          )}

          <Button
            type="submit"
            loading={reset.isPending}
            disabled={reset.isPending || !newPassword || !confirmPassword}
            className="w-full"
          >
            Сохранить новый пароль
          </Button>
        </form>

        <p className="text-center text-xs text-text-muted mt-4">
          <Link to="/forgot-password" className="text-accent hover:underline">
            Запросить ссылку заново
          </Link>
        </p>
      </Card>
    </div>
  );
}
