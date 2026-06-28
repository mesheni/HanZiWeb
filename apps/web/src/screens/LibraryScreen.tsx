import { useState } from 'react';
import { PinyinDisplay } from '../utils/toneColors';

/** Демо-слова для библиотеки */
const DEMO_WORDS = [
  { ch: '你好', py: 'nǐ hǎo', tr: 'привет', hsk: 'HSK 1', status: 'graduated' as const },
  { ch: '喜欢', py: 'xǐ huān', tr: 'нравиться', hsk: 'HSK 1', status: 'learning' as const },
  { ch: '朋友', py: 'péng yǒu', tr: 'друг', hsk: 'HSK 1', status: 'new' as const },
  { ch: '谢谢', py: 'xiè xiè', tr: 'спасибо', hsk: 'HSK 1', status: 'graduated' as const },
  { ch: '学习', py: 'xué xí', tr: 'учиться', hsk: 'HSK 2', status: 'new' as const },
  { ch: '漂亮', py: 'piào liàng', tr: 'красивый', hsk: 'HSK 2', status: 'learning' as const },
  { ch: '高兴', py: 'gāo xìng', tr: 'радостный', hsk: 'HSK 2', status: 'graduated' as const },
  { ch: '工作', py: 'gōng zuò', tr: 'работа', hsk: 'HSK 2', status: 'new' as const },
];

const STATUS_BAR: Record<string, string> = {
  graduated: 'var(--tone-2)', // green
  learning: 'var(--tone-3)',   // yellow
  new: 'var(--tone-1)',        // blue
};

const STATUS_LABEL: Record<string, string> = {
  graduated: 'Выучено',
  learning: 'В процессе',
  new: 'Новое',
};

const CHIPS = ['Все', 'HSK 1', 'HSK 2', 'HSK 3', 'Еда', 'Семья', 'Числа'];

export default function LibraryScreen() {
  const [activeChip, setActiveChip] = useState('Все');
  const [search, setSearch] = useState('');

  const filtered = DEMO_WORDS.filter(
    (w) =>
      w.ch.includes(search) ||
      w.py.includes(search) ||
      w.tr.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div style={styles.screen}>
      {/* Search */}
      <div style={styles.searchWrap}>
        <span style={styles.searchIcon}>🔍</span>
        <input
          style={styles.searchInput}
          type="text"
          placeholder="Иероглиф, пиньинь или перевод..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Chips */}
      <div style={styles.chips}>
        {CHIPS.map((chip) => (
          <button
            key={chip}
            style={{
              ...styles.chip,
              background: activeChip === chip ? 'var(--accent-bg-lite)' : 'var(--bg-card)',
              borderColor: activeChip === chip ? 'var(--border-accent)' : 'rgba(255,255,255,0.07)',
              color: activeChip === chip ? 'var(--accent)' : '#55576B',
            }}
            onClick={() => setActiveChip(chip)}
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div style={styles.grid}>
        {filtered.map((w) => (
          <div key={w.ch} style={styles.card}>
            <div style={{ ...styles.statusBar, background: STATUS_BAR[w.status] }} />
            <div style={styles.cardChar}>{w.ch}</div>
            <PinyinDisplay pinyin={w.py} />
            <div style={styles.cardTranslation}>{w.tr}</div>
            <div style={styles.cardStatus}>{w.hsk} · {STATUS_LABEL[w.status]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  screen: {
    position: 'absolute', inset: 0, overflowY: 'auto',
    padding: '26px 26px 20px',
  },
  searchWrap: { marginBottom: 13, position: 'relative' },
  searchIcon: {
    position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
    color: 'var(--text-dim)', fontSize: 15, pointerEvents: 'none',
  },
  searchInput: {
    width: '100%', background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 10, padding: '9px 12px 9px 35px', color: 'var(--text-primary)',
    fontSize: 13, outline: 'none',
  },
  chips: { display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 16 },
  chip: {
    padding: '4px 11px', borderRadius: 20, border: '1px solid',
    fontSize: 11, fontWeight: 500, cursor: 'pointer', transition: 'all 0.12s',
  },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(138px, 1fr))', gap: 8,
  },
  card: {
    background: 'var(--bg-card)', border: '1px solid var(--border-default)',
    borderRadius: 12, padding: 13, cursor: 'pointer', position: 'relative', overflow: 'hidden',
  },
  statusBar: {
    position: 'absolute', top: 0, left: 12, right: 12, height: '1.5px',
  },
  cardChar: { fontSize: 34, lineHeight: 1, marginBottom: 6 },
  cardTranslation: { fontSize: 11, color: '#9899A8' },
  cardStatus: { fontSize: 10, color: 'var(--text-dim)', marginTop: 7 },
};
