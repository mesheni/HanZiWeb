import { useNavigate } from 'react-router-dom';

/** Демо-данные для главной */
const RECENT_WORDS = [
  { char: '爱', pinyin: 'ài', pinyinRaw: 'ài', translation: 'любить, любовь', status: 'review' as const, tone: 4 },
  { char: '朋友', pinyin: 'péng yǒu', pinyinRaw: 'péng yǒu', translation: 'друг', status: 'new' as const, tone: 2 },
  { char: '很', pinyin: 'hěn', pinyinRaw: 'hěn', translation: 'очень', status: 'hard' as const, tone: 3 },
];

const STATUS_MAP = {
  new: { className: 'badge-new', label: 'новое' },
  review: { className: 'badge-review', label: 'повтор' },
  hard: { className: 'badge-hard', label: 'сложное' },
};

export default function HomeScreen() {
  const navigate = useNavigate();

  return (
    <div style={styles.screen}>
      <div style={styles.greeting}>Добрый вечер</div>
      <div style={styles.sub}>28 июня · Пора повторить слова</div>
      <div style={styles.streak}>🔥 14 дней подряд</div>

      <div style={styles.actionGrid}>
        <div
          style={{ ...styles.actionCard, background: 'var(--accent)' }}
          onClick={() => navigate('/study')}
          role="button"
          tabIndex={0}
        >
          <div style={styles.acLabel}>Повторить</div>
          <div style={styles.acNumber}>24</div>
          <div style={styles.acUnit}>слова ждут</div>
          <div style={styles.acCta}>Начать →</div>
        </div>
        <div
          style={{ ...styles.actionCard, background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}
          onClick={() => navigate('/study')}
          role="button"
          tabIndex={0}
        >
          <div style={styles.acLabel}>Новые слова</div>
          <div style={styles.acNumber}>5</div>
          <div style={styles.acUnit}>HSK 2</div>
          <div style={styles.acCta}>Учить →</div>
        </div>
      </div>

      <div className="section-label">Последние слова</div>

      <div style={styles.wordRows}>
        {RECENT_WORDS.map((w) => (
          <div key={w.char} style={styles.wordRow}>
            <div style={{ ...styles.wrChar, color: w.tone === 2 ? 'var(--tone-2)' : w.tone === 3 ? 'var(--tone-3)' : w.tone === 4 ? 'var(--tone-4)' : 'var(--tone-1)' }}>
              {w.char}
            </div>
            <div style={{ flex: 1 }}>
              <div style={styles.wrPinyin}>{w.pinyinRaw}</div>
              <div style={styles.wrTranslation}>{w.translation}</div>
            </div>
            <span className={`badge ${STATUS_MAP[w.status].className}`}>
              {STATUS_MAP[w.status].label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  screen: {
    position: 'absolute',
    inset: 0,
    overflowY: 'auto',
    padding: '26px 26px 20px',
  },
  greeting: {
    fontSize: 20,
    fontWeight: 500,
    marginBottom: 3,
  },
  sub: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    marginBottom: 14,
  },
  streak: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    background: 'var(--tone-3-bg)',
    border: '1px solid rgba(251,191,36,0.2)',
    borderRadius: 20,
    padding: '5px 13px',
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--tone-3)',
    marginBottom: 18,
  },
  actionGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 9,
    marginBottom: 20,
  },
  actionCard: {
    borderRadius: 12,
    padding: 17,
    cursor: 'pointer',
    border: '1px solid transparent',
  },
  acLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    opacity: 0.55,
    marginBottom: 5,
  },
  acNumber: {
    fontSize: 33,
    fontWeight: 600,
    lineHeight: 1,
  },
  acUnit: {
    fontSize: 11,
    opacity: 0.55,
    marginTop: 2,
  },
  acCta: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: 500,
  },
  wordRows: {
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
  },
  wordRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    background: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 10,
    padding: '10px 14px',
  },
  wrChar: {
    fontSize: 23,
    width: 32,
    textAlign: 'center',
    lineHeight: 1,
  },
  wrPinyin: {
    fontSize: 11,
    color: '#55576B',
    marginBottom: 2,
  },
  wrTranslation: {
    fontSize: 13,
  },
};
