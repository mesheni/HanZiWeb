import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Trash2, Save, Loader2, X, Search, Share2, Copy, Check } from 'lucide-react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Input from './ui/Input';
import { useToastStore } from '../stores/toastStore';
import {
  useCreateDeck,
  useUpdateDeck,
  useDeleteDeck,
  useShareDeck,
} from '../queries/decks';
import { useInfiniteWords } from '../queries/words';
import type { DeckWithWords } from '@hanzi/shared';

interface DeckBuilderModalProps {
  open: boolean;
  /** null = создание новой, непустой id = редактирование существующей. */
  deck: DeckWithWords | null;
  onClose: () => void;
  onShared?: (deckId: string, shareCode: string) => void;
}

type ViewMode = 'edit' | 'preview';

/**
 * Конструктор кастомной колоды.
 * - ввод имени и описания
 * - выбор слов из словаря (с debounced-поиском)
 * - создание / обновление / удаление
 * - генерация share-кода
 */
export default function DeckBuilderModal({
  open,
  deck,
  onClose,
  onShared,
}: DeckBuilderModalProps) {
  const isEditing = !!deck;
  const addToast = useToastStore((s) => s.addToast);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [wordIds, setWordIds] = useState<string[]>([]);
  const [view, setView] = useState<ViewMode>('edit');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createMut = useCreateDeck();
  const updateMut = useUpdateDeck();
  const deleteMut = useDeleteDeck();
  const shareMut = useShareDeck();

  // Инициализация состояния при открытии/смене колоды.
  useEffect(() => {
    if (!open) return;
    if (deck) {
      setName(deck.name);
      setDescription(deck.description ?? '');
      setWordIds(deck.wordIds);
      setShareCode(deck.shareCode);
    } else {
      setName('');
      setDescription('');
      setWordIds([]);
      setShareCode(null);
    }
    setView('edit');
    setSearch('');
    setDebouncedSearch('');
    setCopied(false);
  }, [open, deck]);

  // Debounce поиска.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading: wordsLoading } = useInfiniteWords(
    debouncedSearch ? { search: debouncedSearch } : undefined,
  );
  const words = useMemo(
    () => data?.pages.flatMap((p) => p.data ?? []) ?? [],
    [data],
  );

  const selectedSet = useMemo(() => new Set(wordIds), [wordIds]);

  const toggleWord = useCallback(
    (id: string) => {
      setWordIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      );
    },
    [],
  );

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      addToast('Введите название колоды', 'error');
      return;
    }
    try {
      if (deck) {
        const updated = await updateMut.mutateAsync({
          id: deck.id,
          body: {
            name: trimmedName,
            description: description.trim() || null,
            wordIds,
          },
        });
        addToast('Колода обновлена', 'success');
        setShareCode(updated.shareCode);
      } else {
        const created = await createMut.mutateAsync({
          name: trimmedName,
          description: description.trim() || undefined,
          wordIds,
        });
        addToast('Колода создана', 'success');
        setShareCode(created.shareCode);
        onShared?.(created.id, created.shareCode ?? '');
        onClose();
      }
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : 'Не удалось сохранить колоду',
        'error',
      );
    }
  }, [deck, name, description, wordIds, createMut, updateMut, addToast, onShared, onClose]);

  const handleDelete = useCallback(async () => {
    if (!deck) return;
    if (!window.confirm(`Удалить колоду «${deck.name}»?`)) return;
    try {
      await deleteMut.mutateAsync(deck.id);
      addToast('Колода удалена', 'success');
      onClose();
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : 'Не удалось удалить колоду',
        'error',
      );
    }
  }, [deck, deleteMut, addToast, onClose]);

  const handleShare = useCallback(async () => {
    if (!deck) return;
    try {
      const res = await shareMut.mutateAsync(deck.id);
      setShareCode(res.shareCode);
      onShared?.(deck.id, res.shareCode);
      addToast('Код для шеринга готов', 'success');
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : 'Не удалось создать код',
        'error',
      );
    }
  }, [deck, shareMut, addToast, onShared]);

  const handleCopy = useCallback(async () => {
    if (!shareCode) return;
    try {
      await navigator.clipboard.writeText(shareCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      addToast('Не удалось скопировать', 'error');
    }
  }, [shareCode, addToast]);

  if (!open) return null;

  const isSaving = createMut.isPending || updateMut.isPending;
  const headerTitle = isEditing
    ? `Редактирование: ${deck?.name ?? ''}`
    : 'Новая колода';

  return (
    <Modal open={open} onClose={onClose} title={headerTitle}>
      <div className="deck-builder">
        {/* View tabs */}
        <div className="deck-builder-tabs">
          <button
            type="button"
            className={cn('deck-builder-tab', view === 'edit' && 'deck-builder-tab-active')}
            onClick={() => setView('edit')}
          >
            Слова
          </button>
          <button
            type="button"
            className={cn('deck-builder-tab', view === 'preview' && 'deck-builder-tab-active')}
            onClick={() => setView('preview')}
          >
            Состав ({wordIds.length})
          </button>
        </div>

        {view === 'edit' && (
          <>
            <div className="deck-builder-fields">
              <Input
                label="Название"
                placeholder="Например: Еда и напитки"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
              />
              <label className="deck-builder-textarea-wrap">
                <span className="deck-builder-textarea-label">Описание</span>
                <textarea
                  className="deck-builder-textarea"
                  placeholder="О чём эта колода (необязательно)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  maxLength={500}
                />
              </label>
            </div>

            <div className="deck-builder-search">
              <Search size={14} className="deck-builder-search-icon" />
              <input
                type="text"
                className="deck-builder-search-input"
                placeholder="Поиск слова по иероглифу / пиньиню / переводу"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="deck-builder-words">
              {wordsLoading ? (
                <div className="deck-builder-empty">
                  <Loader2 size={14} className="spinner-inline" />
                </div>
              ) : words.length === 0 ? (
                <div className="deck-builder-empty">Ничего не найдено</div>
              ) : (
                words.map((w) => {
                  const selected = selectedSet.has(w.id);
                  return (
                    <button
                      key={w.id}
                      type="button"
                      className={cn(
                        'deck-builder-word',
                        selected && 'deck-builder-word-selected',
                      )}
                      onClick={() => toggleWord(w.id)}
                    >
                      <span className="deck-builder-word-char">{w.character}</span>
                      <span className="deck-builder-word-text">
                        <span className="deck-builder-word-pinyin">{w.pinyin}</span>
                        <span className="deck-builder-word-translation">{w.translation}</span>
                      </span>
                      {selected ? (
                        <Check size={14} className="deck-builder-word-check" />
                      ) : (
                        <Plus size={14} className="deck-builder-word-add" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}

        {view === 'preview' && (
          <div className="deck-builder-preview">
            {wordIds.length === 0 ? (
              <div className="deck-builder-empty">
                Пока ни одного слова. Перейдите на вкладку «Слова».
              </div>
            ) : (
              wordIds.map((id) => (
                <PreviewRow
                  key={id}
                  wordId={id}
                  onRemove={() => toggleWord(id)}
                />
              ))
            )}
          </div>
        )}

        {/* Share section (только для редактируемой кастомной колоды) */}
        {isEditing && (
          <div className="deck-builder-share">
            <div className="deck-builder-share-title">
              <Share2 size={13} />
              Шеринг
            </div>
            {shareCode ? (
              <div className="deck-builder-share-row">
                <code className="deck-builder-share-code">{shareCode}</code>
                <button
                  type="button"
                  className="deck-builder-share-copy"
                  onClick={() => void handleCopy()}
                  title="Скопировать код"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="deck-builder-share-btn"
                onClick={() => void handleShare()}
                disabled={shareMut.isPending}
              >
                {shareMut.isPending ? <Loader2 size={13} className="spinner-inline" /> : <Share2 size={13} />}
                Создать код
              </button>
            )}
            <p className="deck-builder-share-hint">
              Другие пользователи смогут подписаться на колоду через этот код.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="deck-builder-actions">
          {isEditing && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => void handleDelete()}
              disabled={isSaving || deleteMut.isPending}
            >
              {deleteMut.isPending ? <Loader2 size={13} className="spinner-inline" /> : <Trash2 size={13} />}
              Удалить
            </Button>
          )}
          <div className="deck-builder-actions-right">
            <Button variant="secondary" size="md" onClick={onClose}>
              Отмена
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => void handleSave()}
              loading={isSaving}
            >
              <Save size={13} />
              {isEditing ? 'Сохранить' : 'Создать'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function PreviewRow({ wordId, onRemove }: { wordId: string; onRemove: () => void }) {
  const { data: words } = useInfiniteWords();
  const allWords = useMemo(
    () => (words?.pages ? words.pages.flatMap((p) => p.data ?? []) : []),
    [words],
  );
  const word = allWords.find((w: { id: string }) => w.id === wordId);

  return (
    <div className="deck-builder-preview-row">
      <span className="deck-builder-preview-char">
        {word?.character ?? '…'}
      </span>
      <span className="deck-builder-preview-text">
        {word ? (
          <>
            <span className="deck-builder-preview-pinyin">{word.pinyin}</span>
            <span className="deck-builder-preview-translation">{word.translation}</span>
          </>
        ) : (
          <span className="deck-builder-preview-loading">загрузка…</span>
        )}
      </span>
      <button
        type="button"
        className="deck-builder-preview-remove"
        onClick={onRemove}
        aria-label="Удалить из колоды"
        title="Удалить"
      >
        <X size={14} />
      </button>
    </div>
  );
}

function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
