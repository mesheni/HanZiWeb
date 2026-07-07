import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Loader2 } from 'lucide-react';
import type { Word, TestAnswer, TestLevel, TestResult, TestSession } from '@hanzi/shared';
import TestQuestionCard from '../components/test/TestQuestionCard';
import TestResultCard from '../components/test/TestResultCard';
import WordDetailModal from '../components/WordDetailModal';
import { useStartTest, useSubmitTest, useTestHistory } from '../queries/tests';
import { useToastStore } from '../stores/toastStore';
import { useWord } from '../queries/words';
import { cn } from '../utils/cn';

type Phase = 'level-select' | 'in-progress' | 'results';

const HSK_LEVELS: { level: TestLevel; label: string; description: string }[] = [
  { level: 1, label: 'HSK 1', description: 'Базовые слова и фразы' },
  { level: 2, label: 'HSK 2', description: 'Расширенный набор для начинающих' },
  { level: 3, label: 'HSK 3', description: 'Средний уровень' },
  { level: 4, label: 'HSK 4', description: 'Уверенный средний' },
  { level: 5, label: 'HSK 5', description: 'Продвинутый' },
  { level: 6, label: 'HSK 6', description: 'Свободное владение' },
];

/**
 * Экран «Тестирование» (PLAN_Features_v0.3 §6).
 *
 * 3 фазы:
 *  1. Выбор уровня HSK (6 кнопок-карточек) + история последних тестов.
 *  2. Прохождение теста — вопрос за вопросом, прогресс-бар, таймер.
 *  3. Результаты — оценка, время, разбор по типам, список ошибок.
 */
export default function TestScreen() {
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);
  const [phase, setPhase] = useState<Phase>('level-select');
  const [session, setSession] = useState<TestSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<TestAnswer[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<TestLevel | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);
  const [detailWordId, setDetailWordId] = useState<string | null>(null);
  const startedAtRef = useRef<number | null>(null);

  const startMut = useStartTest();
  const submitMut = useSubmitTest();
  const history = useTestHistory(5);

  const startTest = async (level: TestLevel) => {
    setSelectedLevel(level);
    setAnswers([]);
    setCurrentIndex(0);
    setResult(null);
    try {
      const sess = await startMut.mutateAsync({ level });
      setSession(sess);
      startedAtRef.current = Date.now();
      setPhase('in-progress');
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : 'Не удалось начать тест',
        'error',
      );
    }
  };

  const handleAnswer = (answer: string) => {
    if (!session) return;
    const question = session.questions[currentIndex];
    if (!question) return;
    const newAnswers: TestAnswer[] = [
      ...answers,
      { questionId: question.id, answer },
    ];
    setAnswers(newAnswers);
    if (currentIndex + 1 < session.questions.length) {
      setCurrentIndex(currentIndex + 1);
    } else {
      void submitAnswers(newAnswers);
    }
  };

  const submitAnswers = async (finalAnswers: TestAnswer[]) => {
    if (!session || startedAtRef.current === null) return;
    const timeSpentMs = Date.now() - startedAtRef.current;
    try {
      const res = await submitMut.mutateAsync({
        testId: session.id,
        body: { answers: finalAnswers, timeSpentMs },
      });
      setResult(res);
      setPhase('results');
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : 'Не удалось отправить ответы',
        'error',
      );
      setPhase('level-select');
    }
  };

  const backToLevels = () => {
    setPhase('level-select');
    setSession(null);
    setAnswers([]);
    setCurrentIndex(0);
    setResult(null);
    setSelectedLevel(null);
  };

  const retry = () => {
    if (selectedLevel) void startTest(selectedLevel);
  };

  /* ─── Render: выбор уровня ──────────────────────────────────────── */

  if (phase === 'level-select') {
    return (
      <div className="test-screen">
        <div className="test-screen-header">
          <button
            type="button"
            className="test-screen-back"
            onClick={() => navigate('/')}
            aria-label="На главную"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="test-screen-title">Тестирование</h1>
        </div>
        <p className="test-screen-subtitle">
          Выберите уровень HSK — соберём тест из 20–30 случайных слов этого уровня.
        </p>

        <div className="test-levels">
          {HSK_LEVELS.map(({ level, label, description }) => (
            <button
              key={level}
              type="button"
              className="test-level-card"
              onClick={() => void startTest(level)}
              disabled={startMut.isPending}
            >
              <div className="test-level-card-label">{label}</div>
              <div className="test-level-card-desc">{description}</div>
              <ChevronRight size={18} className="test-level-card-arrow" />
            </button>
          ))}
        </div>

        {startMut.isError && (
          <div className="test-screen-error">
            {startMut.error instanceof Error
              ? startMut.error.message
              : 'Ошибка запуска теста'}
          </div>
        )}

        {history.data && history.data.length > 0 && (
          <section className="test-history">
            <h2 className="test-history-title">История тестов</h2>
            <ul className="test-history-list">
              {history.data.map((r) => {
                const seconds = Math.round(r.timeSpentMs / 1000);
                const minutes = Math.floor(seconds / 60);
                const rest = seconds % 60;
                const time = minutes > 0 ? `${minutes}м ${rest}с` : `${rest}с`;
                const date = new Date(r.completedAt).toLocaleDateString('ru-RU');
                return (
                  <li key={r.id} className="test-history-item">
                    <span className="test-history-level">HSK {r.level}</span>
                    <span
                      className={cn(
                        'test-history-pct',
                        r.percentage >= 60 ? 'test-history-pct-pass' : 'test-history-pct-fail',
                      )}
                    >
                      {r.percentage}%
                    </span>
                    <span className="test-history-meta">
                      {r.correctAnswers} / {r.totalQuestions} · {time}
                    </span>
                    <span className="test-history-date">{date}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    );
  }

  /* ─── Render: прохождение теста ─────────────────────────────────── */

  if (phase === 'in-progress' && session) {
    const currentQuestion = session.questions[currentIndex];
    return (
      <div className="test-screen test-screen-in-progress">
        <ProgressHeader
          current={currentIndex}
          total={session.questions.length}
          level={session.level}
          startedAt={startedAtRef.current}
        />
        {currentQuestion ? (
          <TestQuestionCard
            question={currentQuestion}
            index={currentIndex}
            total={session.questions.length}
            onAnswer={handleAnswer}
          />
        ) : (
          <div className="test-screen-loading">
            <Loader2 size={20} className="spinner-inline" />
          </div>
        )}
      </div>
    );
  }

  /* ─── Render: результаты ────────────────────────────────────────── */

  if (phase === 'results' && result) {
    return (
      <div className="test-screen test-screen-results">
        <TestResultCard
          result={result}
          onBackToLevels={backToLevels}
          onRetry={retry}
          onWordClick={(wordId) => setDetailWordId(wordId)}
        />
        <WordDetailModalWrapper
          wordId={detailWordId}
          onClose={() => setDetailWordId(null)}
        />
      </div>
    );
  }

  return null;
}

/**
 * Обёртка: подгружает Word по wordId и передаёт в WordDetailModal,
 * который принимает `word: Word | null` (не id).
 */
function WordDetailModalWrapper({
  wordId,
  onClose,
}: {
  wordId: string | null;
  onClose: () => void;
}) {
  const { data: word } = useWord(wordId);
  if (!wordId) return null;
  return <WordDetailModal word={(word as Word | undefined) ?? null} onClose={onClose} />;
}

/* ─── Прогресс-бар для активной фазы ──────────────────────────────── */

function ProgressHeader({
  current,
  total,
  level,
  startedAt,
}: {
  current: number;
  total: number;
  level: TestLevel;
  startedAt: number | null;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const elapsedSec = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const minutes = Math.floor(elapsedSec / 60);
  const rest = elapsedSec % 60;
  const timeLabel = minutes > 0 ? `${minutes}:${String(rest).padStart(2, '0')}` : `${rest}с`;

  return (
    <div className="test-progress">
      <div className="test-progress-info">
        <span className="test-progress-level">HSK {level}</span>
        <span className="test-progress-counter">
          {current + 1} / {total}
        </span>
        <span className="test-progress-timer">{timeLabel}</span>
      </div>
      <div className="test-progress-bar">
        <div
          className="test-progress-bar-fill"
          style={{ width: `${((current + 1) / total) * 100}%` }}
        />
      </div>
    </div>
  );
}

