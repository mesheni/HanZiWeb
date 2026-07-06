import { useState, useMemo, type FormEvent } from 'react';
import { Lock } from 'lucide-react';
import { Button, Card, Input } from '@/components/ui';
import { useChangePassword } from '@/queries/auth';
import { toast } from '@/stores/toastStore';

type FieldErrors = {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
};

/**
 * Простой индикатор сложности пароля (0–4 «балла»).
 * - ≥8 символов — базовый уровень;
 * - длина ≥12 / буквы разных регистров / цифры / спецсимволы
 *   добавляют по баллу.
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
 * Карточка «Смена пароля» (PLAN_Features_v0.3 §1).
 *
 * Доступна только тем, у кого есть пароль (email+password регистрация).
 * OAuth-only пользователи получают `400 PASSWORD_NOT_SET` от сервера —
 * показываем человеко-понятное сообщение с подсказкой про восстановление.
 */
export default function ChangePasswordCard() {
  const changePassword = useChangePassword();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  const strength = useMemo(() => passwordStrength(newPassword), [newPassword]);

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (currentPassword.length < 8) {
      next.currentPassword = 'Минимум 8 символов';
    }
    if (newPassword.length < 8 || newPassword.length > 128) {
      next.newPassword = 'От 8 до 128 символов';
    }
    if (newPassword && newPassword === currentPassword) {
      next.newPassword = 'Новый пароль должен отличаться от текущего';
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

    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      toast('Пароль изменён', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setErrors({});
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось изменить пароль';
      // Спец-кейс для OAuth-only: подсказка про восстановление.
      if (/social|password recovery/i.test(message)) {
        toast('Этот аккаунт создан через соцсеть. Установите пароль через восстановление.', 'info');
      } else if (/current password/i.test(message)) {
        setErrors({ currentPassword: 'Неверный текущий пароль' });
      } else {
        toast(message, 'error');
      }
    }
  };

  const isBusy = changePassword.isPending;

  return (
    <Card padding="lg" className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-tone-1-bg text-tone-1 flex items-center justify-center shrink-0">
          <Lock size={18} />
        </div>
        <div className="flex-1">
          <div className="font-medium text-text-primary">Смена пароля</div>
          <div className="text-sm text-text-muted mt-1">
            Измените пароль аккаунта. После смены другие устройства должны будут войти заново.
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        <Input
          variant="password"
          label="Текущий пароль"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          disabled={isBusy}
          autoComplete="current-password"
          {...(errors.currentPassword ? { error: errors.currentPassword } : {})}
        />

        <div>
          <Input
            variant="password"
            label="Новый пароль"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={isBusy}
            autoComplete="new-password"
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
          label="Подтверждение нового пароля"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={isBusy}
          autoComplete="new-password"
          {...(errors.confirmPassword ? { error: errors.confirmPassword } : {})}
        />

        <Button
          type="submit"
          variant="primary"
          loading={isBusy}
          disabled={isBusy || !currentPassword || !newPassword || !confirmPassword}
        >
          Изменить пароль
        </Button>
      </form>
    </Card>
  );
}
