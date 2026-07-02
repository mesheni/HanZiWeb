import { useState, useCallback, useRef, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { Search, Filter } from 'lucide-react';
import { useInfiniteWords } from '../queries/words';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import { PinyinDisplay } from '../utils/toneColors';

const HSK_CHIPS = [0, 1, 2, 3, 4, 5, 6] as const;
const STATUS_CHIPS = ['all', 'new', 'learning', 'review', 'graduated'] as const;

const STATUS_LABELS: Record<string, string> = {
  all: 'Все статусы',
  new: 'Новые',
  learning: 'В процессе',
  review: 'На повторе',
  graduated: 'Выучено',
};

export default function LibraryScreen() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [hskLevel, setHskLevel] = useState<number | null>(null);
  const [statusChip, setStatusChip] = useState<string>('all');
  const [selectedWord, setSelectedWord] = useState<any>(null);

  // Debounce 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const statusFilter = statusChip !== 'all' ? statusChip as 'new' | 'learning' | 'review' | 'graduated' : undefined;
  const filters = {
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(hskLevel !== null && hskLevel > 0 ? { hskLevel } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
  };

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteWords(filters);

  const words = data?.pages.flatMap((p) => p.data ?? []) ?? [];

  // Infinite scroll observer
  const observerRef = useRef<IntersectionObserver | null>(null);
  const lastWordRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (isFetchingNextPage) return;
      if (observerRef.current) observerRef.current.disconnect();
      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0]?.isIntersecting && hasNextPage) {
          void fetchNextPage();
        }
      });
      if (node) observerRef.current.observe(node);
    },
    [isFetchingNextPage, hasNextPage, fetchNextPage],
  );

  return (
    <div style={styles.screen}>
      {/* Search */}
      <div style={styles.searchWrap}>
        <Search size={15} style={styles.searchIcon} />
        <input
          style={styles.searchInput}
          type="text"
          placeholder="Иероглиф, пиньинь или перевод..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Filters */}
      <div style={styles.filterSection}>
        <div style={styles.filterRow}>
          <Filter size={12} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
          <span style={styles.filterLabel}>HSK:</span>
          {HSK_CHIPS.map((level) => (
            <button
              key={level}
              style={{
                ...styles.chip,
                background: hskLevel === level ? 'var(--accent-bg-lite)' : 'var(--bg-card)',
                borderColor: hskLevel === level ? 'var(--border-accent)' : 'rgba(255,255,255,0.07)',
                color: hskLevel === level ? 'var(--accent)' : 'var(--text-secondary)',
              }}
              onClick={() => setHskLevel(hskLevel === level ? null : level)}
            >
              {level === 0 ? 'Все' : `${level}`}
            </button>
          ))}
        </div>
        <div style={styles.filterRow}>
          <span style={styles.filterLabel}>Статус:</span>
          {STATUS_CHIPS.map((s) => (
            <button
              key={s}
              style={{
                ...styles.chip,
                background: statusChip === s ? 'var(--accent-bg-lite)' : 'var(--bg-card)',
                borderColor: statusChip === s ? 'var(--border-accent)' : 'rgba(255,255,255,0.07)',
                color: statusChip === s ? 'var(--accent)' : 'var(--text-secondary)',
              }}
              onClick={() => setStatusChip(s)}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div style={styles.loading}><span className="spinner" /></div>
      ) : (
        <div style={styles.grid}>
          {words.map((w: any, idx: number) => {
            const isLast = idx === words.length - 1;
            return (
              <div
                key={w.id}
                ref={isLast ? lastWordRef : null}
                style={styles.card}
                onClick={() => setSelectedWord(w)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedWord(w);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div style={{ ...styles.statusBar, background: STATUS_BAR_COLOR[w.status ?? 'new'] ?? 'var(--tone-0)' }} />
                <div style={styles.cardChar}>{w.character}</div>
                <PinyinDisplay pinyin={w.pinyin} />
                <div style={styles.cardTranslation}>{w.translation}</div>
                <div style={styles.cardStatus}>
                  <Badge status={w.status ?? 'new'} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isFetchingNextPage && (
        <div style={styles.loading}><span className="spinner" /></div>
      )}

      {/* Detail Modal */}
      <Modal open={!!selectedWord} onClose={() => setSelectedWord(null)} title={selectedWord?.character ?? ''}>
        {selectedWord && (
          <div style={styles.modalContent}>
            <div style={styles.modalChar}>{selectedWord.character}</div>
            <PinyinDisplay pinyin={selectedWord.pinyin} />
            <div style={styles.modalTranslation}>{selectedWord.translation}</div>
            {selectedWord.hskLevel && (
              <div style={styles.modalMeta}>HSK {selectedWord.hskLevel}</div>
            )}
            {selectedWord.mnemonic && (
              <div style={styles.modalSection}>
                <div style={styles.modalSectionTitle}>Мнемоника</div>
                <div style={styles.modalText}>{selectedWord.mnemonic}</div>
              </div>
            )}
            {selectedWord.examples && selectedWord.examples.length > 0 && (
              <div style={styles.modalSection}>
                <div style={styles.modalSectionTitle}>Примеры</div>
                {selectedWord.examples.map((ex: any, i: number) => (
                  <div key={ex.id || i} style={styles.modalExample}>
                    <div style={styles.modalExampleZh}>{ex.chinese}</div>
                    <div style={styles.modalExampleRu}>{ex.russian}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 10 }}>
              <Badge status={selectedWord.status ?? 'new'} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

const STATUS_BAR_COLOR: Record<string, string> = {
  graduated: 'var(--tone-2)',
  review: 'var(--tone-3)',
  learning: 'var(--tone-1)',
  new: 'var(--tone-0)',
};

const styles: Record<string, CSSProperties> = {
  screen: {
    position: 'absolute', inset: 0, overflowY: 'auto',
    padding: '26px 26px 20px',
  },
  searchWrap: {
    marginBottom: 12,
    position: 'relative',
  },
  searchIcon: {
    position: 'absolute', left: 12, top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--text-dim)',
    pointerEvents: 'none',
  },
  searchInput: {
    width: '100%', background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 10, padding: '9px 12px 9px 36px', color: 'var(--text-primary)',
    fontSize: 13, outline: 'none',
  },
  filterSection: {
    display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14,
  },
  filterRow: {
    display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center',
  },
  filterLabel: {
    fontSize: 10, color: 'var(--text-dim)', fontWeight: 500, marginRight: 2,
  },
  chip: {
    padding: '3px 9px', borderRadius: 20, border: '1px solid',
    fontSize: 10, fontWeight: 500, cursor: 'pointer', transition: 'all 0.12s',
  },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(138px, 1fr))', gap: 8,
  },
  card: {
    background: 'var(--bg-card)', border: '1px solid var(--border-default)',
    borderRadius: 12, padding: 13, cursor: 'pointer', position: 'relative', overflow: 'hidden',
    transition: 'border-color 0.15s',
  },
  statusBar: {
    position: 'absolute', top: 0, left: 12, right: 12, height: '1.5px',
  },
  cardChar: {
    fontSize: 34, fontFamily: 'var(--font-cjk)', lineHeight: 1, marginBottom: 6,
  },
  cardTranslation: {
    fontSize: 11, color: '#9899A8', marginTop: 3,
  },
  cardStatus: {
    marginTop: 8,
  },
  loading: {
    display: 'flex', justifyContent: 'center', padding: 20,
  },
  modalContent: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
  },
  modalChar: {
    fontSize: 56, fontFamily: 'var(--font-cjk)', lineHeight: 1, marginBottom: 4,
  },
  modalTranslation: {
    fontSize: 15, color: 'var(--text-secondary)', marginTop: 2,
  },
  modalMeta: {
    fontSize: 11, color: 'var(--text-muted)', marginTop: 4,
  },
  modalSection: {
    width: '100%', marginTop: 14,
  },
  modalSectionTitle: {
    fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em',
    color: 'var(--text-dim)', marginBottom: 6,
  },
  modalText: {
    fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic',
  },
  modalExample: {
    marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--border-default)',
  },
  modalExampleZh: {
    fontSize: 15, fontFamily: 'var(--font-cjk)', marginBottom: 2,
  },
  modalExampleRu: {
    fontSize: 12, color: 'var(--text-muted)',
  },
};
