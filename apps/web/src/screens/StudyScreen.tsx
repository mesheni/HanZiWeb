import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PinyinDisplay } from '../utils/toneColors';

/** Демо-карточки */
const DEMO_CARDS = [
  { ch: '喜欢', py: 'xǐ huān', tr: 'нравиться, любить', zh: '我喜欢学中文。', ru: 'Мне нравится учить китайский.' },
  { ch: '朋友', py: 'péng yǒu', tr: 'друг', zh: '他是我的好朋友。', ru: 'Он мой хороший друг.' },
  { ch: '漂亮', py: 'piào liàng', tr: 'красивый, красивая', zh: '她很漂亮！', ru: 'Она очень красивая!' },
  { ch: '学习', py: 'xué xí', tr: 'учиться, учёба', zh: '我喜欢学习。', ru: 'Я люблю учиться.' },
  { ch: '高兴', py: 'gāo xìng', tr: 'радостный, рад', zh: '我很高兴见到你。', ru: 'Рад с тобой познакомиться.' },
];

export default function StudyScreen() {
  const navigate = useNavigate();
  const [cardIndex, setCardIndex] = useState(0);
  const [cardsCompleted, setCardsCompleted] = useState(6);
  const [flipped, setFlipped] = useState(false);
  const totalCards = 20;

  const card = DEMO_CARDS[cardIndex % DEMO_CARDS.length]!;
  const progress = Math.round((cardsCompleted / totalCards) * 100);

  const flip = useCallback(() => setFlipped((f) => !f), []);

  const nextCard = useCallback(() => {
    setFlipped(false);
    setCardIndex((i) => i + 1);
    setCardsCompleted((c) => Math.min(c + 1, totalCards));
  }, []);

  const handleRate = useCallback(
    (_rating: number) => {
      // TODO: send rating to API
      nextCard();
    },
    [nextCard],
  );

  return (
    <div style={styles.screen}>
      {/* Progress bar */}
      <div style={styles.progressBar}>
        <div style={{ ...styles.progressFill, width: `${progress}%` }} />
      </div>

      {/* Header */}
      <div style={styles.header}>
        <span style={styles.counter}>{cardsCompleted} / {totalCards}</span>
        <span style={styles.deckName}>HSK 1 · Базовые слова</span>
        <button style={styles.closeBtn} onClick={() => navigate('/')} aria-label="Выйти">✕</button>
      </div>

      {/* Card area */}
      <div style={styles.body}>
        <div
          style={{ ...styles.cardScene, perspective: 900 }}
          onClick={flip}
          role="button"
          tabIndex={0}
          aria-label="Показать ответ"
        >
          <div
            style={{
              ...styles.cardFlipper,
              transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            }}
          >
            {/* Front */}
            <div style={styles.cardFace}>
              <div style={styles.cardChar}>{card.ch}</div>
              <div style={styles.cardHint}>нажмите, чтобы открыть</div>
            </div>

            {/* Back */}
            <div style={{ ...styles.cardFace, transform: 'rotateY(180deg)' }}>
              <div style={styles.backChar}>{card.ch}</div>
              <PinyinDisplay pinyin={card.py} />
              <div style={styles.backTranslation}>{card.tr}</div>
              <div style={styles.backExample}>
                <div style={styles.exZh}>{card.zh}</div>
                <div style={styles.exRu}>{card.ru}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        {!flipped ? (
          <button style={styles.showBtn} onClick={flip}>
            Показать ответ
          </button>
        ) : (
          <div style={styles.ratingButtons}>
            <button style={{ ...styles.rateBtn }} className="rate-again" onClick={() => handleRate(1)}>
              Не помню
              <small>через 1 мин</small>
            </button>
            <button style={{ ...styles.rateBtn }} className="rate-good" onClick={() => handleRate(3)}>
              Помню
              <small>через 1 день</small>
            </button>
            <button style={{ ...styles.rateBtn }} className="rate-easy" onClick={() => handleRate(4)}>
              Легко
              <small>через 4 дня</small>
            </button>
          </div>
        )}
      </div>

      <style>{`
        .card-scene { perspective: 900px; }
        .rate-again:hover { background: var(--tone-4-bg) !important; border-color: var(--tone-4) !important; color: var(--tone-4) !important; }
        .rate-good:hover { background: var(--tone-2-bg) !important; border-color: var(--tone-2) !important; color: var(--tone-2) !important; }
        .rate-easy:hover { background: var(--tone-1-bg) !important; border-color: var(--tone-1) !important; color: var(--tone-1) !important; }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  screen: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  progressBar: {
    height: 2,
    background: 'rgba(255,255,255,0.05)',
    flexShrink: 0,
  },
  progressFill: {
    height: '100%',
    background: 'var(--accent)',
    transition: 'width 0.4s ease',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 22px',
    borderBottom: '1px solid var(--border-default)',
    flexShrink: 0,
  },
  counter: { fontSize: 13, color: '#55576B' },
  deckName: { fontSize: 13, fontWeight: 500 },
  closeBtn: { background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: 0 },
  body: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '14px 28px',
  },
  cardScene: {
    width: '100%',
    maxWidth: 360,
    height: 248,
    cursor: 'pointer',
  },
  cardFlipper: {
    width: '100%',
    height: '100%',
    transition: 'transform 0.5s cubic-bezier(0.4,0,0.2,1)',
    transformStyle: 'preserve-3d',
    position: 'relative',
  },
  cardFace: {
    position: 'absolute',
    inset: 0,
    background: 'var(--bg-card)',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 18,
    backfaceVisibility: 'hidden',
    WebkitBackfaceVisibility: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  cardChar: { fontSize: 96, lineHeight: 1, fontWeight: 300, marginBottom: 6 },
  cardHint: { fontSize: 11, color: '#2E3045', display: 'flex', alignItems: 'center', gap: 5, marginTop: 14 },
  backChar: { fontSize: 54, fontWeight: 300, lineHeight: 1, marginBottom: 7 },
  backTranslation: { fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 11, marginTop: 4 },
  backExample: { borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 10, textAlign: 'center', width: '100%' },
  exZh: { fontSize: 13, color: '#8889A0', marginBottom: 3 },
  exRu: { fontSize: 11, color: 'var(--text-dim)' },
  footer: { padding: '10px 22px 20px', flexShrink: 0 },
  showBtn: {
    display: 'block', width: '100%', maxWidth: 210, margin: '0 auto',
    padding: '12px', background: 'var(--accent)', border: 'none', borderRadius: 10,
    color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer',
  },
  ratingButtons: { display: 'flex', gap: 8 },
  rateBtn: {
    flex: 1, padding: '10px 4px', border: '1px solid rgba(255,255,255,0.09)', background: 'var(--bg-card)',
    borderRadius: 9, color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12, fontWeight: 500,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, transition: 'all 0.13s',
  },
};
