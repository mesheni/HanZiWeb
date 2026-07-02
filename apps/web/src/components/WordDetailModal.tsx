import { useState, useEffect, useRef, useCallback } from 'react';
import { Volume2, Plus, Trash2, Sparkles, Loader2, WholeWord, X } from 'lucide-react';
import Modal from './ui/Modal';
import EtymologyCard from './EtymologyCard';
import { PinyinDisplay } from '../utils/toneColors';
import { useAudio } from '../hooks/useAudio';
import { useToastStore } from '../stores/toastStore';
import {
  useWordExamples,
  useCreateExample,
  useDeleteExample,
  useFetchTatoebaExamples,
} from '../queries/examples';
import { buildClozeQuestion } from '../utils/cloze';
import { cn } from '../utils/cn';
import type { Word, Example } from '@hanzi/shared';

interface WordDetailModalProps {
  word: Word | null;
  onClose: () => void;
  /** Опционально: при наличии запускает cloze-сессию с этим словом. */
  onStartCloze?: (word: Word) => void;
}

/**
 * Расширенный модал слова:
 *  - пиньинь, перевод, HSK-уровень, мнемоника
 *  - TTS для самого слова + TTS для каждого примера-предложения
 *  - список примеров с TTS и удалением
 *  - ручное добавление примера
 *  - «Подтянуть из Tatoeba» (POST /words/:id/examples/fetch)
 *  - кнопка «Тренировать в режиме подстановки»
 */
export default function WordDetailModal({ word, onClose, onStartCloze }: WordDetailModalProps) {
  const { data: examples = [], isLoading: examplesLoading } = useWordExamples(word?.id);
  const createMut = useCreateExample();
  const deleteMut = useDeleteExample();
  const fetchMut = useFetchTatoebaExamples();
  const addToast = useToastStore((s) => s.addToast);
  const audio = useAudio(word?.id);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newZh, setNewZh] = useState('');
  const [newRu, setNewRu] = useState('');

  // Сброс формы при смене слова/закрытии.
  useEffect(() => {
    if (!word) {
      setShowAddForm(false);
      setNewZh('');
      setNewRu('');
    }
  }, [word]);

  const handleFetchTatoeba = useCallback(async () => {
    if (!word) return;
    try {
      const res = await fetchMut.mutateAsync({ wordId: word.id, limit: 3 });
      if (res.added === 0) {
        addToast('Tatoeba не нашёл новых предложений', 'info');
      } else {
        addToast(`Добавлено примеров: ${res.added}`, 'success');
      }
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : 'Не удалось получить примеры из Tatoeba',
        'error',
      );
    }
  }, [word, fetchMut, addToast]);

  const handleAddManual = useCallback(async () => {
    if (!word) return;
    if (!newZh.trim() || !newRu.trim()) {
      addToast('Заполните оба поля', 'error');
      return;
    }
    try {
      await createMut.mutateAsync({
        wordId: word.id,
        body: { chinese: newZh, russian: newRu },
      });
      addToast('Пример добавлен', 'success');
      setNewZh('');
      setNewRu('');
      setShowAddForm(false);
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : 'Не удалось добавить пример',
        'error',
      );
    }
  }, [word, newZh, newRu, createMut, addToast]);

  const handleDelete = useCallback(
    async (exampleId: string) => {
      if (!word) return;
      try {
        await deleteMut.mutateAsync({ wordId: word.id, exampleId });
        addToast('Пример удалён', 'success');
      } catch (err) {
        addToast(
          err instanceof Error ? err.message : 'Не удалось удалить пример',
          'error',
        );
      }
    },
    [word, deleteMut, addToast],
  );

  if (!word) return null;

  // Проверяем, есть ли хоть один cloze-кандидат.
  const hasCloze = examples.some((e) => buildClozeQuestion(e, word) !== null);

  return (
    <Modal open={!!word} onClose={onClose} title={word.character}>
      <div className="word-detail">
        <div className="word-detail-head">
          <PinyinDisplay pinyin={word.pinyin} className="word-detail-pinyin" />
          <div className="word-detail-translation">{word.translation}</div>
          <div className="word-detail-meta">
            {word.hskLevel && (
              <span className="word-detail-hsk-badge">HSK {word.hskLevel}</span>
            )}
            {audio.isAvailable && (
              <button
                type="button"
                className="word-detail-audio-btn"
                onClick={() => audio.play()}
                disabled={audio.isLoading}
                aria-label="Прослушать слово"
                title={word.audioUrl ? 'Прослушать слово' : 'Браузерный TTS (fallback)'}
              >
                {audio.isLoading ? <Loader2 size={14} /> : <Volume2 size={14} />}
              </button>
            )}
          </div>
          {word.mnemonic && (
            <div className="word-detail-mnemonic">
              <span className="word-detail-mnemonic-label">Мнемоника</span>
              <span className="word-detail-mnemonic-text">{word.mnemonic}</span>
            </div>
          )}
        </div>

        <EtymologyCard wordId={word.id} fallbackCharacter={word.character} />

        <div className="word-detail-section">
          <div className="word-detail-section-head">
            <span className="word-detail-section-title">Примеры предложений</span>
            {onStartCloze && hasCloze && (
              <button
                type="button"
                className="word-detail-cloze-btn"
                onClick={() => onStartCloze(word)}
                title="Тренировать слово в режиме подстановки"
              >
                <WholeWord size={13} />
                Тренировать
              </button>
            )}
          </div>

          {examplesLoading ? (
            <div className="word-detail-loading">
              <Loader2 size={14} />
            </div>
          ) : examples.length === 0 ? (
            <div className="word-detail-empty">
              Пока нет примеров. Подтяните из Tatoeba или добавьте вручную.
            </div>
          ) : (
            <ul className="word-detail-examples">
              {examples.map((ex) => (
                <ExampleRow
                  key={ex.id}
                  example={ex}
                  onDelete={() => void handleDelete(ex.id)}
                />
              ))}
            </ul>
          )}

          <div className="word-detail-actions">
            <button
              type="button"
              className="word-detail-action"
              onClick={() => void handleFetchTatoeba()}
              disabled={fetchMut.isPending}
            >
              {fetchMut.isPending ? (
                <Loader2 size={13} className="spinner-inline" />
              ) : (
                <Sparkles size={13} />
              )}
              Из Tatoeba
            </button>
            <button
              type="button"
              className={cn('word-detail-action', showAddForm && 'word-detail-action-active')}
              onClick={() => setShowAddForm((s) => !s)}
            >
              {showAddForm ? <X size={13} /> : <Plus size={13} />}
              {showAddForm ? 'Отмена' : 'Свой пример'}
            </button>
          </div>

          {showAddForm && (
            <div className="word-detail-add">
              <textarea
                className="word-detail-add-input"
                placeholder="中文 предложение"
                value={newZh}
                onChange={(e) => setNewZh(e.target.value)}
                rows={2}
              />
              <textarea
                className="word-detail-add-input"
                placeholder="Русский перевод"
                value={newRu}
                onChange={(e) => setNewRu(e.target.value)}
                rows={2}
              />
              <button
                type="button"
                className="word-detail-add-submit"
                onClick={() => void handleAddManual()}
                disabled={createMut.isPending}
              >
                {createMut.isPending ? 'Сохранение…' : 'Сохранить пример'}
              </button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ExampleRow({ example, onDelete }: { example: Example; onDelete: () => void }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playSentence = () => {
    // Приоритет — серверное аудио через /audio/generate.
    // Если credentials нет (501), fallback на браузерный TTS.
    if (typeof window === 'undefined') return;
    window.speechSynthesis?.cancel();
    const utter = new SpeechSynthesisUtterance(example.chinese);
    utter.lang = 'zh-CN';
    utter.rate = 0.9;
    utter.onstart = () => setIsPlaying(true);
    utter.onend = () => setIsPlaying(false);
    utter.onerror = () => setIsPlaying(false);
    window.speechSynthesis.speak(utter);
  };

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  return (
    <li className="word-detail-example">
      <div className="word-detail-example-text">
        <div className="word-detail-example-zh">{example.chinese}</div>
        <div className="word-detail-example-ru">{example.russian}</div>
      </div>
      <div className="word-detail-example-actions">
        <button
          type="button"
          className="word-detail-example-tts"
          onClick={playSentence}
          disabled={isPlaying}
          aria-label="Прослушать предложение"
          title="Прослушать предложение"
        >
          <Volume2 size={14} />
        </button>
        <button
          type="button"
          className="word-detail-example-del"
          onClick={onDelete}
          aria-label="Удалить пример"
          title="Удалить пример"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  );
}
