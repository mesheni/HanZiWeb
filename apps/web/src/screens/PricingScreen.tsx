import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { useAuthStore, isPro } from '@/stores/authStore';
import { apiPost } from '@/api/client';
import { useState } from 'react';

const PRO_FEATURES = [
  'Безлимитные колоды',
  'Расширенная статистика',
  'Практика письма (Handwriting)',
  'Приоритетная поддержка',
];

const FREE_FEATURES = [
  'До 5 колод',
  'Базовая статистика',
  'Стандартные карточки',
  'Аудиопроизношение',
];

export default function PricingScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const success = searchParams.get('success');
  const canceled = searchParams.get('canceled');

  const handleUpgrade = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiPost<{ url: string }>('/billing/checkout');
      window.location.href = result.url;
    } catch (err: any) {
      setError(err.message || 'Ошибка при оформлении подписки');
    } finally {
      setLoading(false);
    }
  };

  if (success === 'true') {
    return (
      <div className="pricing-screen">
        <div className="pricing-success">
          <div className="pricing-success-icon">
            <Check size={48} />
          </div>
          <h2>Оплата прошла успешно!</h2>
          <p>Ваш Pro-тариф активирован. Добро пожаловать!</p>
          <button className="pricing-btn pricing-btn-primary" onClick={() => navigate('/')}>
            На главную
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pricing-screen">
      <header className="pricing-header">
        <button className="pricing-back-btn" onClick={() => navigate(-1)} aria-label="Назад">
          <ArrowLeft size={20} />
        </button>
        <h2 className="pricing-title">Выберите тариф</h2>
      </header>

      {canceled === 'true' && (
        <div className="pricing-notice">Оплата была отменена. Вы можете попробовать снова.</div>
      )}

      <div className="pricing-cards">
        <div className="pricing-card pricing-card-free">
          <h3 className="pricing-card-title">Free</h3>
          <div className="pricing-card-price">$0</div>
          <p className="pricing-card-period">навсегда</p>
          <ul className="pricing-card-features">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="pricing-feature">
                <Check size={14} className="pricing-feature-icon" />
                {f}
              </li>
            ))}
          </ul>
          {user && !isPro(user) && (
            <div className="pricing-card-badge">Текущий тариф</div>
          )}
        </div>

        <div className="pricing-card pricing-card-pro">
          <div className="pricing-card-popular">Популярное</div>
          <h3 className="pricing-card-title">Pro</h3>
          <div className="pricing-card-price">$4.99</div>
          <p className="pricing-card-period">в месяц</p>
          <ul className="pricing-card-features">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="pricing-feature">
                <Check size={14} className="pricing-feature-icon" />
                {f}
              </li>
            ))}
          </ul>
          {user && isPro(user) ? (
            <div className="pricing-card-badge">Активен</div>
          ) : (
            <button
              className="pricing-btn pricing-btn-primary"
              onClick={handleUpgrade}
              disabled={loading}
            >
              {loading ? <span className="spinner" /> : 'Upgrade to Pro'}
            </button>
          )}
          {error && <p className="pricing-error">{error}</p>}
        </div>
      </div>
    </div>
  );
}
