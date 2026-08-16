import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Home,
  BookOpen,
  Glasses,
  Library,
  PenLine,
  ClipboardList,
  BarChart3,
  Settings,
  Search,
} from 'lucide-react';
import { normalizePinyin } from '@hanzi/shared';
import type { Word } from '@hanzi/shared';
import { getDb } from '../db/database';
import { useUiStore } from '../stores/uiStore';
import WordDetailModal from './WordDetailModal';

interface NavEntry {
  id: string;
  label: string;
  route: string;
  icon: typeof Home;
}

const NAV_ENTRIES: NavEntry[] = [
  { id: 'home', label: 'Главная', route: '/', icon: Home },
  { id: 'study', label: 'Учить', route: '/study', icon: BookOpen },
  { id: 'reading', label: 'Чтение', route: '/reading', icon: Glasses },
  { id: 'library', label: 'Слова', route: '/library', icon: Library },
  { id: 'handwriting', label: 'Письмо', route: '/handwriting', icon: PenLine },
  { id: 'test', label: 'Тест', route: '/test', icon: ClipboardList },
  { id: 'stats', label: 'Итоги', route: '/stats', icon: BarChart3 },
  { id: 'settings', label: 'Настройки', route: '/settings', icon: Settings },
];

interface WordEntry {
  id: string;
  character: string;
  pinyin: string;
  translation: string;
  normPinyin: string;
  word: Word;
}

const WORD_RESULTS_LIMIT = 8;

function toWordEntry(doc: {
  id: string;
  character: string;
  pinyin: string;
  translation: string;
  hskLevel?: number | null;
  audioUrl?: string | null;
  mnemonic?: string | null;
  createdAt?: string;
}): WordEntry {
  const now = new Date().toISOString();
  const word: Word = {
    id: doc.id,
    character: doc.character,
    pinyin: doc.pinyin,
    translation: doc.translation,
    hskLevel: doc.hskLevel ?? null,
    audioUrl: doc.audioUrl ?? null,
    mnemonic: doc.mnemonic ?? null,
    createdAt: doc.createdAt ?? now,
    examples: [],
    tags: [],
  };
  return {
    id: doc.id,
    character: doc.character,
    pinyin: doc.pinyin,
    translation: doc.translation,
    normPinyin: normalizePinyin(doc.pinyin).replace(/\s+/g, ''),
    word,
  };
}

function matchWord(entry: WordEntry, query: string, normQuery: string): boolean {
  return (
    entry.character.includes(query) ||
    entry.normPinyin.includes(normQuery) ||
    entry.translation.toLowerCase().includes(query)
  );
}

/**
 * Command palette (Ctrl+K): быстрый переход по разделам + мгновенный
 * поиск слова по локальному словарю RxDB (иероглиф / пиньинь без тонов /
 * перевод). Слова без установленного офлайн-пака не ищутся — словарь
 * качается кнопкой «Скачать слова» на главной.
 */
export default function CommandPalette() {
  const navigate = useNavigate();
  const open = useUiStore((s) => s.commandPaletteOpen);
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen);

  const [query, setQuery] = useState('');
  const [words, setWords] = useState<WordEntry[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Глобальный Ctrl+K / Cmd+K — слушатель живёт всегда, палитра или нет.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!useUiStore.getState().commandPaletteOpen);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setOpen]);

  // Загружаем локальный словарь один раз при открытии палитры.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    const db = getDb();
    if (!db) {
      setWords([]);
      return;
    }
    let cancelled = false;
    db.words
      .find()
      .exec()
      .then((docs) => {
        if (cancelled) return;
        setWords(docs.map((d) => toWordEntry(d.toJSON() as never)));
      })
      .catch(() => {
        if (!cancelled) setWords([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [open]);

  const queryLower = query.trim().toLowerCase();
  const normQuery = normalizePinyin(queryLower).replace(/\s+/g, '');

  const navResults = useMemo(() => {
    if (!queryLower) return NAV_ENTRIES;
    return NAV_ENTRIES.filter((n) => n.label.toLowerCase().includes(queryLower));
  }, [queryLower]);

  const wordResults = useMemo(() => {
    if (!queryLower || words.length === 0) return [];
    return words.filter((w) => matchWord(w, queryLower, normQuery)).slice(0, WORD_RESULTS_LIMIT);
  }, [words, queryLower, normQuery]);

  const total = navResults.length + wordResults.length;

  useEffect(() => {
    setActiveIndex(0);
  }, [queryLower]);

  if (!open) {
    return <WordDetailModal word={selectedWord} onClose={() => setSelectedWord(null)} />;
  }

  const selectNav = (entry: NavEntry) => {
    setOpen(false);
    navigate(entry.route);
  };

  const selectWord = (entry: WordEntry) => {
    setOpen(false);
    setSelectedWord(entry.word);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (total === 0 ? 0 : (i + 1) % total));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (total === 0 ? 0 : (i - 1 + total) % total));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (total === 0) return;
      if (activeIndex < navResults.length) {
        selectNav(navResults[activeIndex]!);
      } else {
        selectWord(wordResults[activeIndex - navResults.length]!);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]">
        <div
          className="absolute inset-0 bg-black/60 animate-fade-in"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
        <div className="relative z-10 w-full max-w-lg mx-4 bg-bg-card border border-border-default rounded-2xl shadow-2xl animate-scale-in overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border-default">
            <Search size={16} className="text-text-muted shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Раздел или слово: иероглиф, пиньинь, перевод…"
              className="w-full bg-transparent border-none outline-none text-sm text-text-primary placeholder:text-text-muted"
              aria-label="Поиск по приложению"
            />
            <kbd className="hidden sm:inline-flex items-center px-1.5 h-5 rounded border border-border-default bg-bg-hover text-[10px] font-mono text-text-muted shrink-0">
              Esc
            </kbd>
          </div>

          <div className="max-h-[50vh] overflow-auto py-2">
            {navResults.length > 0 && (
              <div className="px-2 pb-1">
                <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-text-muted">
                  Разделы
                </div>
                {navResults.map((entry, i) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                      activeIndex === i
                        ? 'bg-bg-hover text-text-primary'
                        : 'text-text-secondary hover:bg-bg-hover'
                    }`}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => selectNav(entry)}
                  >
                    <entry.icon size={15} className="shrink-0" />
                    {entry.label}
                  </button>
                ))}
              </div>
            )}

            {wordResults.length > 0 && (
              <div className="px-2 pt-1">
                <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-text-muted">
                  Слова
                </div>
                {wordResults.map((entry, i) => {
                  const index = navResults.length + i;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                        activeIndex === index
                          ? 'bg-bg-hover text-text-primary'
                          : 'text-text-secondary hover:bg-bg-hover'
                      }`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectWord(entry)}
                    >
                      <span className="text-base font-medium w-14 shrink-0 text-text-primary">
                        {entry.character}
                      </span>
                      <span className="flex flex-col min-w-0">
                        <span className="truncate">{entry.pinyin}</span>
                        <span className="truncate text-xs text-text-muted">
                          {entry.translation}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {queryLower && wordResults.length === 0 && words.length === 0 && (
              <div className="px-4 py-3 text-xs text-text-muted">
                Локальный словарь пуст — скачайте офлайн-пакет слов на главной, чтобы искать слова
                отсюда.
              </div>
            )}
            {queryLower && wordResults.length === 0 && words.length > 0 && (
              <div className="px-4 py-3 text-xs text-text-muted">Слов не найдено</div>
            )}
          </div>
        </div>
      </div>

      <WordDetailModal word={selectedWord} onClose={() => setSelectedWord(null)} />
    </>
  );
}
