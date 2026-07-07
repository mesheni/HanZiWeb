import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, X, RefreshCw, Volume2, VolumeX } from 'lucide-react';
import { cn } from '../utils/cn';
import { useStudySession } from '../hooks/useStudySession';
import { useAudio } from '../hooks/useAudio';
import { useDistractorPool, getCharacterDistractors } from '../hooks/useDistractorPool';
import { useStudyStore } from '../stores/studyStore';
import { useUiStore } from '../stores/uiStore';
import Flashcard from '../components/Flashcard';
import SessionComplete from '../components/SessionComplete';
import SessionFiltersPanel, {
  type SessionFiltersValue,
  toSessionFilters,
} from '../components/SessionFiltersPanel';
import { ProgressBar } from '../components/ui';
import PracticeTypeSelector from '../components/practice/PracticeTypeSelector';
import MultipleChoiceCard from '../components/practice/MultipleChoiceCard';
import ReverseChoiceCard from '../components/practice/ReverseChoiceCard';
import PinyinInputCard from '../components/practice/PinyinInputCard';
import ToneRecognitionCard from '../components/practice/ToneRecognitionCard';
import SyllableConstructorCard from '../components/practice/SyllableConstructorCard';
import CharacterAssemblyCard from '../components/practice/CharacterAssemblyCard';
import ClozeCard from '../components/practice/ClozeCard';
import { useWordExamples } from '../queries/examples';
import { STUDY_MODE_LABELS, getPracticeTypeInfo } from '../utils/practiceTypes';
import type { SrsRating, StudyMode, PracticeType, Word, SessionFilters } from '@hanzi/shared';

function precacheAudioUrls(cards: Array<{ word: { audioUrl?: string | null } }>) {
  if ('caches' in window) {
    cards.forEach((card) => {
      if (card.word.audioUrl) {
        caches.open('audio-cache').then((cache) => {
          cache.add(card.word.audioUrl!).catch(() => {});
        });
      }
    });
  }
}

interface RatingOption {
  rating: SrsRating;
  label: string;
  hint: string;
  className: string;
}

const RATING_OPTIONS: RatingOption[] = [
  { rating: 1, label: 'Не помню', hint: 'через 1 мин', className: 'rate-again' },
  { rating: 2, label: 'Трудно', hint: 'через 10 мин', className: 'rate-hard' },
  { rating: 3, label: 'Помню', hint: 'через 1 день', className: 'rate-good' },
  { rating: 4, label: 'Легко', hint: 'через 4 дня', className: 'rate-easy' },
];

const STATE_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: 'Новое', color: '#6EE7B7' },
  learning: { label: 'Учу', color: '#FBBF24' },
  review: { label: 'Повтор', color: '#A78BFA' },
  graduated: { label: 'Усвоено', color: '#34D399' },
};

const DEFAULT_PRACTICE: PracticeType = 'flip-card';

function parsePracticeParam(value: string | null): PracticeType {
  const valid: PracticeType[] = [
    'flip-card',
    'multiple-choice',
    'reverse-choice',
    'pinyin-input',
    'tone-recognition',
    'syllable-constructor',
    'cloze',
    'character_assembly',
  ];
  if (value && (valid as string[]).includes(value)) {
    return value as PracticeType;
  }
  return DEFAULT_PRACTICE;
}

export default function StudyScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = (searchParams.get('mode') ?? 'mixed') as StudyMode;
  const practiceFromUrl = parsePracticeParam(searchParams.get('practice'));

  // Храним выбранный тип практики в сторе, чтобы экран выбора и сам
  // экран сессии синхронизировались.
  const storePracticeType = useStudyStore((s) => s.practiceType);
  const setPracticeType = useStudyStore((s) => s.setPracticeType);
  const [hasStarted, setHasStarted] = useState(false);

  // Тип практики, по которому реально стартовала сессия. Меняется только
  // по нажатию "Начать" — иначе перебор типов в селекторе не плодил бы
  // серверные сессии.
  const [activePracticeType, setActivePracticeType] = useState<PracticeType>(practiceFromUrl);

  // Синхронизируем URL → стор при первом монтировании.
  useEffect(() => {
    if (storePracticeType !== practiceFromUrl) {
      setPracticeType(practiceFromUrl);
    }
  }, [practiceFromUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Фильтры сессии (PLAN_Features_v0.2 §12). Хранятся в локальном стейте
  // и передаются в /sessions/start при нажатии "Начать". Если фильтры
  // не заданы (`enabled: false`) — отправляется `filters: undefined`.
  const [filtersValue, setFiltersValue] = useState<SessionFiltersValue>({ enabled: false });
  const activeFilters: SessionFilters | undefined = toSessionFilters(filtersValue);

  // Запускаем сессию только после явного "Начать" — иначе показываем
  // экран выбора практики. Хук не делает побочных эффектов, пока
  // enabled = false, поэтому на экране выбора мы не дёргаем /sessions/start.
  const {
    isLoading,
    isError,
    isSessionComplete,
    rateCard,
    retrySession,
    startNow,
    showFeedback,
    lastAnswerCorrect,
    submitAnswer,
    continueSession,
  } = useStudySession({
      mode,
      practiceType: activePracticeType,
      filters: activeFilters,
      enabled: hasStarted,
    });

  const cards = useStudyStore((s) => s.cards);
  const currentIndex = useStudyStore((s) => s.currentIndex);
  const isFlipped = useStudyStore((s) => s.isFlipped);
  const isFlipping = useStudyStore((s) => s.isFlipping);
  const progress = useStudyStore((s) => s.progress);
  const flipCard = useStudyStore((s) => s.flipCard);
  const resetSession = useStudyStore((s) => s.resetSession);

  const currentCard = cards[currentIndex];
  const wordId = currentCard?.word.id ?? null;
  const audio = useAudio(wordId);

  const autoPlayAudio = useUiStore((s) => s.autoPlayAudio);
  const setAutoPlayAudio = useUiStore((s) => s.setAutoPlayAudio);

  const modeCfg = STUDY_MODE_LABELS[mode];
  const practiceCfg = getPracticeTypeInfo(storePracticeType);

  // Пул дистракторов (multiple-choice / reverse-choice / syllable-constructor).
  // Загружается ОДИН раз за сессию (не на каждое слово) — компоненты
  // карточек сами фильтруют лишние id.
  const needsDistractors =
    storePracticeType === 'multiple-choice' ||
    storePracticeType === 'reverse-choice' ||
    storePracticeType === 'syllable-constructor' ||
    storePracticeType === 'character_assembly';
  const { data: distractorPool = [] } = useDistractorPool({
    count: 24,
    enabled: hasStarted && needsDistractors,
  });

  // Объединённый пул слов для дистракторов: карточки сессии + случайные.
  const combinedPool: Word[] = useMemo(() => {
    const sessionWords = cards.map((c) => c.word);
    const seen = new Set(sessionWords.map((w) => w.id));
    const extras = distractorPool.filter((w) => !seen.has(w.id));
    return [...sessionWords, ...extras];
  }, [cards, distractorPool]);

  // Иероглифы-дистракторы для режима `character_assembly`.
  const characterDistractors = useMemo(() => {
    if (!currentCard) return [];
    return getCharacterDistractors(currentCard.word, combinedPool, 6);
  }, [currentCard, combinedPool]);

  // Мемоизированный poolPinyin для `syllable-constructor`. Без useMemo
  // `combinedPool.map(...)` создаёт новый массив на каждом re-render
  // StudyScreen (в т.ч. при обновлении состояния `useAudio` после
  // нажатия кнопки озвучки), что приводит к пересборке пула слогов
  // в SyllableConstructorCard и их перемешиванию — баг «Собери пиньинь»
  // (PLAN_Features_v0.3 §14).
  const syllablePoolPinyin = useMemo(
    () => combinedPool.map((w) => w.pinyin),
    [combinedPool],
  );

  // Примеры для текущего слова — нужны cloze-карточке.
  // Берём встроенные примеры из слова, а если их нет — подгружаем
  // /words/:id/examples (там могут быть доп. Tatoeba-примеры).
  const clozeExamples = currentCard?.word.examples ?? [];
  const { data: extraExamples } = useWordExamples(
    storePracticeType === 'cloze' ? currentCard?.word.id : null,
  );
  const allExamples = useMemo(() => {
    if (!extraExamples) return clozeExamples;
    const seen = new Set(clozeExamples.map((e) => e.id));
    return [...clozeExamples, ...extraExamples.filter((e) => !seen.has(e.id))];
  }, [clozeExamples, extraExamples]);

  // Статистика для SessionComplete
  const stats = useMemo(() => {
    let correct = 0;
    let incorrect = 0;
    for (const card of cards) {
      if (!card.answered) continue;
      if (card.rating && card.rating >= 3) correct++;
      else incorrect++;
    }
    return { correct, incorrect, total: cards.length };
  }, [cards]);

  // Подсчёт XP
  const xpEarned = useMemo(() => {
    let xp = 0;
    for (const card of cards) {
      if (card.answered && card.rating) {
        xp += { 1: 0, 2: 1, 3: 3, 4: 5 }[card.rating] ?? 0;
      }
    }
    return xp;
  }, [cards]);

  // Precache audio when cards load
  useEffect(() => {
    if (cards.length > 0) {
      precacheAudioUrls(cards);
    }
  }, [cards]);

  // При размонтировании сбрасываем стор
  useEffect(() => {
    return () => {
      resetSession();
    };
  }, [resetSession]);

  // Авто-проигрывание TTS для каждой новой карточки (для всех 7 типов практик).
  // Управляется переключателем `autoPlayAudio` в шапке (persist: localStorage).
  // Для flip-card дополнительно играет на перевороте — но только если
  // авто-проигрывание включено (иначе тишина после флипа).
  useEffect(() => {
    if (!autoPlayAudio || !audio.isAvailable || !currentCard) return;
    const t = window.setTimeout(() => audio.play(), 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCard?.word.id, audio.isAvailable, autoPlayAudio]);

  // Дополнительно для flip-card: проиграть ещё раз после переворота —
  // чтобы пользователь услышал слово и на «лицевой» стороне, и на «тыльной».
  useEffect(() => {
    if (!autoPlayAudio) return;
    if (isFlipped && audio.isAvailable && storePracticeType === 'flip-card') {
      audio.play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFlipped, storePracticeType, autoPlayAudio]);

  // Клавиатурные сокращения (только для flip-card).
  useEffect(() => {
    if (storePracticeType !== 'flip-card') return;
    const handler = (e: KeyboardEvent) => {
      if (isSessionComplete) return;
      if (!currentCard) return;
      // Пока идёт анимация переворота — игнорируем ввод (PLAN_Features_v0.3 #12).
      if (isFlipping) return;

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        flipCard();
        return;
      }

      if (!isFlipped) return;

      const map: Record<string, SrsRating> = { '1': 1, '2': 2, '3': 3, '4': 4 };
      const rating = map[e.key];
      if (rating !== undefined) {
        e.preventDefault();
        rateCard(rating);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isSessionComplete, currentCard, isFlipped, isFlipping, flipCard, rateCard, storePracticeType]);

  // Экран выбора типа практики — показываем до старта сессии.
  if (!hasStarted) {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
          padding: '18px 22px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <span
            style={{
              display: 'inline-block',
              padding: '3px 10px',
              borderRadius: 12,
              fontSize: 11,
              fontWeight: 500,
              color: modeCfg.color,
              background: modeCfg.bg,
            }}
          >
            {modeCfg.label}
          </span>
          <button
            onClick={() => navigate('/')}
            aria-label="Выйти"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: 18,
              cursor: 'pointer',
              lineHeight: 1,
              padding: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>
        {/* Панель фильтров сессии (PLAN_Features_v0.2 §12). Показываем
            только для режимов, где фильтры осмыслены: в `learn` (новые
            слова) stability=0, поэтому min/max стабильности не действует. */}
        <div style={{ marginBottom: 12 }}>
          <SessionFiltersPanel value={filtersValue} onChange={setFiltersValue} mode={mode} />
        </div>
        <PracticeTypeSelector
          mode={mode}
          onStart={(t) => {
            setPracticeType(t);
            setActivePracticeType(t);
            // Отражение в URL для шеринга/закладок.
            const params = new URLSearchParams(searchParams);
            params.set('practice', t);
            navigate(`/study?${params.toString()}`, { replace: true });
            setHasStarted(true);
            startNow(activeFilters);
          }}
          onCancel={() => navigate('/')}
        />
      </div>
    );
  }

  // Состояние ошибки
  if (isError && !cards.length) {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          gap: 16,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <p
            style={{
              color: 'var(--text-secondary)',
              marginBottom: 4,
              fontSize: 16,
              fontWeight: 500,
            }}
          >
            Не удалось загрузить сессию
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
            Проверьте подключение и попробуйте снова
          </p>
        </div>
        <button
          onClick={() => retrySession()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 24px',
            background: 'var(--accent)',
            border: 'none',
            borderRadius: 10,
            color: '#fff',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={16} />
          Попробовать снова
        </button>
        <button
          onClick={() => navigate('/')}
          style={{
            color: 'var(--text-muted)',
            fontSize: 13,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          На главную
        </button>
      </div>
    );
  }

  // Состояния загрузки
  if (isLoading) {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
        }}
      >
        <span className="spinner" style={{ width: 28, height: 28 }} />
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Загрузка сессии...</span>
        <span
          style={{
            display: 'inline-block',
            padding: '3px 10px',
            borderRadius: 12,
            fontSize: 11,
            fontWeight: 500,
            color: practiceCfg.color,
            background: practiceCfg.bg,
          }}
        >
          {practiceCfg.label}
        </span>
      </div>
    );
  }

  if (isSessionComplete) {
    return (
      <SessionComplete
        total={stats.total}
        correct={stats.correct}
        incorrect={stats.incorrect}
        xpEarned={xpEarned}
        mode={mode}
      />
    );
  }

  if (!currentCard) {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          gap: 16,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <p
            style={{
              color: 'var(--text-secondary)',
              marginBottom: 4,
              fontSize: 16,
              fontWeight: 500,
            }}
          >
            Нет карточек для изучения
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
            {mode === 'review'
              ? 'Все слова повторены. Возвращайтесь позже.'
              : 'Попробуйте другой режим.'}
          </p>
        </div>
        <button
          onClick={() => retrySession()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            background: 'var(--accent)',
            border: 'none',
            borderRadius: 10,
            color: '#fff',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={16} />
          Обновить
        </button>
        <button
          onClick={() => navigate('/')}
          style={{
            color: 'var(--text-muted)',
            fontSize: 13,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          На главную
        </button>
      </div>
    );
  }

  const progressPct = Math.round((progress.current / progress.total) * 100);
  const stateCfg: { label: string; color: string } = STATE_LABELS[currentCard.state] ?? {
    label: 'Новое',
    color: '#6EE7B7',
  };
  const isBinaryMode = storePracticeType !== 'flip-card';

  // В бинарных режимах (multiple-choice, pinyin-input, …) сами знаем
  // верно/неверно → маппим в FSRS rating: 1=Again, 3=Good.
  const handleBinaryAnswer = (correct: boolean) => {
    rateCard(correct ? 3 : 1);
  };

  const isChoiceMode =
    storePracticeType === 'multiple-choice' ||
    storePracticeType === 'reverse-choice' ||
    storePracticeType === 'tone-recognition';

  // Для choice-based режимов ответ сохраняется в feedback и не
  // вызывает rateCard до нажатия "Продолжить".
  const handleChoiceAnswer = (correct: boolean) => {
    submitAnswer(correct);
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Progress bar */}
      <div style={{ padding: '8px 22px 0' }}>
        <ProgressBar value={progressPct} />
      </div>

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 22px',
          borderBottom: '1px solid var(--border-default)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {progress.current + 1} / {progress.total}
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '3px 10px',
            borderRadius: 12,
            fontSize: 11,
            fontWeight: 500,
            color: practiceCfg.color,
            background: practiceCfg.bg,
          }}
        >
          {practiceCfg.label}
        </span>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <button
            type="button"
            onClick={() => setAutoPlayAudio(!autoPlayAudio)}
            className={autoPlayAudio ? 'study-header-tts-on' : 'study-header-tts-off'}
            aria-label={autoPlayAudio ? 'Выключить авто-озвучку' : 'Включить авто-озвучку'}
            title={autoPlayAudio ? 'Авто-озвучка включена' : 'Авто-озвучка выключена'}
          >
            {autoPlayAudio ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <button
            onClick={() => navigate('/')}
            aria-label="Выйти"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: 18,
              cursor: 'pointer',
              lineHeight: 1,
              padding: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Card state badge */}
      {currentCard.state && (
        <div style={{ padding: '6px 22px 0', textAlign: 'center' }}>
          <span
            style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 500,
              color: stateCfg.color,
              background: `${stateCfg.color}15`,
            }}
          >
            {stateCfg.label}
          </span>
        </div>
      )}

      {/* Card area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '14px 22px',
          minHeight: 0,
          overflow: 'auto',
        }}
      >
        {storePracticeType === 'flip-card' && (
          <Flashcard
            word={currentCard.word}
            isFlipped={isFlipped}
            onFlip={flipCard}
            onReplayAudio={() => audio.play()}
            audioLoading={audio.isLoading}
            hasAudio={audio.isAvailable}
          />
        )}

        {storePracticeType === 'multiple-choice' && (
          <MultipleChoiceCard
            word={currentCard.word}
            pool={combinedPool}
            onAnswer={handleChoiceAnswer}
            onPlayAudio={() => audio.play()}
            audioAvailable={audio.isAvailable}
          />
        )}

        {storePracticeType === 'reverse-choice' && (
          <ReverseChoiceCard
            word={currentCard.word}
            pool={combinedPool}
            onAnswer={handleChoiceAnswer}
            onPlayAudio={() => audio.play()}
            audioAvailable={audio.isAvailable}
          />
        )}

        {storePracticeType === 'pinyin-input' && (
          <PinyinInputCard
            word={currentCard.word}
            onAnswer={handleBinaryAnswer}
            onPlayAudio={() => audio.play()}
            audioAvailable={audio.isAvailable}
          />
        )}

        {storePracticeType === 'tone-recognition' && (
          <ToneRecognitionCard word={currentCard.word} onAnswer={handleChoiceAnswer} />
        )}

        {storePracticeType === 'syllable-constructor' && (
          <SyllableConstructorCard
            word={currentCard.word}
            poolPinyin={syllablePoolPinyin}
            onAnswer={handleBinaryAnswer}
            onPlayAudio={() => audio.play()}
            audioAvailable={audio.isAvailable}
          />
        )}

        {storePracticeType === 'character_assembly' && (
          <CharacterAssemblyCard
            word={currentCard.word}
            distractors={characterDistractors}
            onAnswer={handleBinaryAnswer}
            onPlayAudio={() => audio.play()}
            audioAvailable={audio.isAvailable}
          />
        )}

        {storePracticeType === 'cloze' && (
          <ClozeCard word={currentCard.word} examples={allExamples} onAnswer={handleBinaryAnswer} />
        )}
      </div>

      {/* Feedback panel для choice-based режимов: показываем результат и ждём "Продолжить". */}
      {isChoiceMode && showFeedback && (
        <div style={{ padding: '10px 22px 20px', flexShrink: 0 }}>
          <div className="feedback-panel">
            <div
              className={cn(
                'feedback-banner',
                lastAnswerCorrect ? 'feedback-correct' : 'feedback-wrong',
              )}
            >
              {lastAnswerCorrect ? <Check size={16} /> : <X size={16} />}
              {lastAnswerCorrect ? 'Верно' : 'Неверно'}
            </div>
            <div className="feedback-word">
              <div className="feedback-character">{currentCard.word.character}</div>
              <div className="feedback-pinyin">{currentCard.word.pinyin}</div>
              <div className="feedback-translation">{currentCard.word.translation}</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                className="feedback-audio-btn"
                onClick={() => audio.play()}
                disabled={!audio.isAvailable}
                aria-label="Прослушать слово"
              >
                <Volume2 size={15} />
              </button>
            </div>
            <button
              type="button"
              className="feedback-continue"
              onClick={continueSession}
            >
              Продолжить
            </button>
          </div>
        </div>
      )}

      {/* Footer — для flip-card рейтинг-кнопки, иначе ничего (компонент сам решает). */}
      {!isBinaryMode && (
        <div style={{ padding: '10px 22px 20px', flexShrink: 0 }}>
          {!isFlipped ? (
            <button
              onClick={flipCard}
              disabled={isFlipping}
              style={{
                display: 'block',
                width: '100%',
                maxWidth: 210,
                margin: '0 auto',
                padding: '12px',
                background: 'var(--accent)',
                border: 'none',
                borderRadius: 10,
                color: '#fff',
                fontSize: 14,
                fontWeight: 500,
                cursor: isFlipping ? 'not-allowed' : 'pointer',
                opacity: isFlipping ? 0.6 : 1,
              }}
            >
              Показать ответ
            </button>
          ) : (
            <div className="rating-row">
              {RATING_OPTIONS.map((opt) => (
                <button
                  key={opt.rating}
                  className={`rate-btn ${opt.className}`}
                  onClick={() => rateCard(opt.rating)}
                  disabled={isFlipping}
                >
                  {opt.label}
                  <small>{opt.hint}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
