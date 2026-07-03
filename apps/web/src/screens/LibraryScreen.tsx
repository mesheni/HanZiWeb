import { useState, useCallback, useRef, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, Plus, KeyRound, Pencil, Play } from 'lucide-react';
import { useInfiniteWords } from '../queries/words';
import { useDecks, useDeck } from '../queries/decks';
import { useAuthStore } from '../stores/authStore';
import Badge from '../components/ui/Badge';
import WordDetailModal from '../components/WordDetailModal';
import DeckBuilderModal from '../components/DeckBuilderModal';
import JoinDeckModal from '../components/JoinDeckModal';
import { PinyinDisplay } from '../utils/toneColors';
import type { Word, DeckWithWords } from '@hanzi/shared';

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
  const navigate = useNavigate();
  const userId = useAuthStore((s) => s.user?.id);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [hskLevel, setHskLevel] = useState<number | null>(null);
  const [statusChip, setStatusChip] = useState<string>('all');
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [editingDeckId, setEditingDeckId] = useState<string | null>(null);

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
    ...(activeDeckId ? { deckId: activeDeckId } : {}),
  };

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteWords(filters);

  const words = data?.pages.flatMap((p) => p.data ?? []) ?? [];

  const { data: decks = [] } = useDecks();
  const customDecks = decks.filter((d) => !d.isSystemDeck);

  // Загружаем детальную инфо о редактируемой колоде.
  const { data: editingDeck } = useDeck(editingDeckId);

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

  const handleStartStudy = (deckId: string) => {
    navigate(`/study?deckId=${encodeURIComponent(deckId)}`);
  };

  const handleEditDeck = (deckId: string) => {
    setEditingDeckId(deckId);
    setBuilderOpen(true);
  };

  const handleCreateDeck = () => {
    setEditingDeckId(null);
    setBuilderOpen(true);
  };

  const handleBuilderClose = () => {
    setBuilderOpen(false);
    setEditingDeckId(null);
  };

  return (
    <div style={styles.screen}>
      {/* Decks section */}
      {customDecks.length > 0 && (
        <div style={styles.decksSection}>
          <div style={styles.decksSectionHead}>
            <span style={styles.decksSectionTitle}>Мои колоды</span>
            <div style={styles.decksSectionActions}>
              <button
                type="button"
                style={styles.decksActionBtn}
                onClick={() => setJoinOpen(true)}
                title="Подписаться на колоду по коду"
              >
                <KeyRound size={11} />
                По коду
              </button>
              <button
                type="button"
                style={styles.decksActionBtn}
                onClick={handleCreateDeck}
                title="Создать новую колоду"
              >
                <Plus size={11} />
                Новая
              </button>
            </div>
          </div>
          {customDecks.map((deck) => {
            const isActive = activeDeckId === deck.id;
            const isOwner = !!userId && deck.ownerId === userId;
            return (
              <div
                key={deck.id}
                style={{
                  ...styles.deckPill,
                  borderColor: isActive ? 'var(--border-accent)' : 'var(--border-default)',
                  background: isActive ? 'var(--accent-bg-lite)' : 'var(--bg-card)',
                }}
                onClick={() => setActiveDeckId(isActive ? null : deck.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveDeckId(isActive ? null : deck.id);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div style={styles.deckPillInfo}>
                  <div style={styles.deckPillName}>{deck.name}</div>
                  <div style={styles.deckPillMeta}>
                    <span style={styles.deckPillTagCustom}>{deck.wordCount} слов</span>
                    {isOwner && deck.shareCode && (
                      <span style={{ ...styles.deckPillTag, ...styles.deckPillTagShared }}>
                        код: {deck.shareCode}
                      </span>
                    )}
                    {!isOwner && (
                      <span style={styles.deckPillTagCustom}>из подписки</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  style={styles.deckPillEdit}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isOwner) {
                      handleEditDeck(deck.id);
                    } else {
                      handleStartStudy(deck.id);
                    }
                  }}
                  title={isOwner ? 'Редактировать' : 'Тренировать'}
                  aria-label={isOwner ? 'Редактировать колоду' : 'Тренировать колоду'}
                >
                  {isOwner ? <Pencil size={13} /> : <Play size={13} />}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Decks empty state */}
      {customDecks.length === 0 && (
        <div style={styles.decksSection}>
          <div style={styles.decksSectionHead}>
            <span style={styles.decksSectionTitle}>Мои колоды</span>
            <div style={styles.decksSectionActions}>
              <button
                type="button"
                style={styles.decksActionBtn}
                onClick={() => setJoinOpen(true)}
                title="Подписаться на колоду по коду"
              >
                <KeyRound size={11} />
                По коду
              </button>
              <button
                type="button"
                style={styles.decksActionBtn}
                onClick={handleCreateDeck}
                title="Создать новую колоду"
              >
                <Plus size={11} />
                Новая
              </button>
            </div>
          </div>
          <div style={styles.deckEmptyHint}>
            Создайте свою колоду слов или подпишитесь на чужую по коду.
          </div>
        </div>
      )}

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
                borderColor: hskLevel === level ? 'var(--border-accent)' : 'var(--border-default)',
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
                borderColor: statusChip === s ? 'var(--border-accent)' : 'var(--border-default)',
                color: statusChip === s ? 'var(--accent)' : 'var(--text-secondary)',
              }}
              onClick={() => setStatusChip(s)}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        {activeDeckId && (
          <div style={styles.filterRow}>
            <span style={styles.filterLabel}>Колода:</span>
            <span style={styles.activeDeckChip}>
              {decks.find((d) => d.id === activeDeckId)?.name ?? '...'}
              <button
                type="button"
                onClick={() => setActiveDeckId(null)}
                style={styles.activeDeckClear}
                aria-label="Сбросить фильтр колоды"
              >
                ×
              </button>
            </span>
          </div>
        )}
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

      {/* Detail Modal — examples, TTS, cloze */}
      <WordDetailModal
        word={selectedWord}
        onClose={() => setSelectedWord(null)}
        onStartCloze={(w) => {
          setSelectedWord(null);
          navigate(`/study?mode=mixed&practice=cloze&wordId=${encodeURIComponent(w.id)}`);
        }}
      />

      {/* Deck Builder (create + edit) */}
      <DeckBuilderModal
        open={builderOpen}
        deck={editingDeck as DeckWithWords | null}
        onClose={handleBuilderClose}
      />

      {/* Join deck by share code */}
      <JoinDeckModal
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        onJoined={() => {
          // фильтры пересоберутся через invalidateQueries
        }}
      />
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
  decksSection: {
    marginBottom: 16,
  },
  decksSectionHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  decksSectionTitle: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: 'var(--text-muted)',
    fontWeight: 500,
  },
  decksSectionActions: {
    display: 'flex',
    gap: 6,
  },
  decksActionBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 9px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 18,
    color: 'var(--text-secondary)',
    fontSize: 10,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.12s',
  },
  deckEmptyHint: {
    fontSize: 11,
    color: 'var(--text-muted)',
    padding: '10px 12px',
    background: 'var(--bg-card)',
    border: '1px dashed var(--border-default)',
    borderRadius: 10,
  },
  deckPill: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '9px 12px',
    border: '1px solid var(--border-default)',
    borderRadius: 10,
    marginBottom: 5,
    cursor: 'pointer',
    transition: 'all 0.12s',
  },
  deckPillInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    flex: 1,
    minWidth: 0,
  },
  deckPillName: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  deckPillMeta: {
    fontSize: 10,
    color: 'var(--text-muted)',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  deckPillTagCustom: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '1px 6px',
    borderRadius: 6,
    fontSize: 9,
    fontWeight: 500,
    background: 'var(--accent-bg-lite)',
    color: 'var(--accent)',
  },
  deckPillTagShared: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '1px 6px',
    borderRadius: 6,
    fontSize: 9,
    fontWeight: 500,
    background: 'var(--tone-1-bg)',
    color: 'var(--tone-1)',
  },
  deckPillEdit: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 26,
    borderRadius: 6,
    background: 'var(--bg-hover)',
    color: 'var(--text-muted)',
    border: 'none',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'all 0.12s',
  },
  activeDeckChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 6px 3px 9px',
    background: 'var(--accent-bg-lite)',
    border: '1px solid var(--border-accent)',
    borderRadius: 14,
    color: 'var(--accent)',
    fontSize: 10,
    fontWeight: 500,
  },
  activeDeckClear: {
    background: 'transparent',
    border: 'none',
    color: 'var(--accent)',
    fontSize: 14,
    lineHeight: 1,
    cursor: 'pointer',
    padding: 0,
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
    width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border-default)',
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
    fontSize: 11, color: 'var(--text-secondary)', marginTop: 3,
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
