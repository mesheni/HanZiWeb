import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Heart } from 'lucide-react';

export default function DonationScreen() {
  const navigate = useNavigate();

  return (
    <div className="donation-screen">
      <header className="donation-header">
        <button className="donation-back-btn" onClick={() => navigate(-1)} aria-label="Назад">
          <ArrowLeft size={20} />
        </button>
        <h2 className="donation-title">Поддержать проект</h2>
      </header>

      <div className="donation-content">
        <div className="donation-icon">
          <Heart size={48} />
        </div>
        <h3>Добровольное пожертвование</h3>
        <p>
          HanZiWeb — бесплатный проект с открытым исходным кодом.
          Все функции доступны каждому без ограничений.
        </p>
        <p>
          Если приложение оказалось для вас полезным, вы можете поддержать
          его развитие добровольным пожертвованием. Это поможет оплачивать
          серверы, аудиогенерацию и дальнейшую разработку.
        </p>
        <p>
          Спасибо, что вы с нами!
        </p>
      </div>
    </div>
  );
}
