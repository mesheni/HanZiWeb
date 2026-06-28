import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button, Input, Card } from '@/components/ui';
import { apiPost } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/stores/toastStore';
import type { AuthResponse } from '@hanzi/shared';

export default function LoginScreen() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await apiPost<AuthResponse>('/auth/login', { email, password });
      login(data.user, data.accessToken);
      toast('Вход выполнен успешно', 'success');
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
      <Card padding="lg" className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-4xl text-accent font-bold mb-2">汉</div>
          <h1 className="text-lg font-semibold text-text-primary">Вход в HanZi</h1>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            variant="email"
            label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            required
          />
          <Input
            variant="password"
            label="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />

          {error && (
            <div className="text-xs text-tone-4 bg-tone-4-bg px-3 py-2 rounded-lg">{error}</div>
          )}

          <Button type="submit" loading={loading} className="w-full">
            Войти
          </Button>
        </form>

        <p className="text-center text-xs text-text-muted mt-4">
          Нет аккаунта?{' '}
          <Link to="/register" className="text-accent hover:underline">
            Зарегистрироваться
          </Link>
        </p>
      </Card>
    </div>
  );
}
