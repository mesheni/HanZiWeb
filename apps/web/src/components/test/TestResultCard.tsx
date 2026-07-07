import { Check, X, Clock, Award } from 'lucide-react';
import type { TestBreakdownItem, TestResult as TestResultData, TestQuestionType } from '@hanzi/shared';
import { cn } from '../../utils/cn';

interface TestResultCardProps {
  result: TestResultData;
  onWordClick?: (wordId: string) => void;
  onRetry?: () => void;
  onBackToLevels?: () => void;
}

/**
 * Экран результатов теста (PLAN_Features_v0.3 §6).
 *
 * Содержит:
 *  - Главный блок: оценка (% правильных), время, статус «сдан/не сдан».
 *  - Разбор по типам заданий (breakdown).
 *  - Список ошибок — клик по карточке ошибки открывает детали слова.
 */
export default function TestResultCard({
  result,
  onWordClick,
  onRetry,
  onBackToLevels,
}: TestResultCardProps) {
  const wrongAnswers = result.answers.filter((a) => !a.isCorrect);
  const passed = result.percentage >= 60;
  const seconds = Math.round(result.timeSpentMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  const timeLabel = minutes > 0 ? `${minutes} мин ${restSeconds} сек` : `${restSeconds} сек`;

  return (
    <div className="test-result">
      <div className={cn('test-result-summary', passed ? 'test-result-summary-pass' : 'test-result-summary-fail')}>
        <div className="test-result-percentage">{result.percentage}%</div>
        <div className="test-result-status">
          {passed ? (
            <>
              <Award size={20} />
              <span>Тест сдан</span>
            </>
          ) : (
            <>
              <X size={20} />
              <span>Нужно подтянуть</span>
            </>
          )}
        </div>
        <div className="test-result-meta">
          <div className="test-result-meta-item">
            <Check size={14} />
            <span>{result.correctAnswers} / {result.totalQuestions} правильных</span>
          </div>
          <div className="test-result-meta-item">
            <Clock size={14} />
            <span>{timeLabel}</span>
          </div>
        </div>
      </div>

      <section className="test-result-section">
        <h3 className="test-result-section-title">Разбор по типам</h3>
        <div className="test-result-breakdown">
          {result.breakdown.map((b) => (
            <BreakdownRow key={b.type} item={b} />
          ))}
        </div>
      </section>

      <section className="test-result-section">
        <h3 className="test-result-section-title">
          {wrongAnswers.length > 0
            ? `Ошибки (${wrongAnswers.length})`
            : 'Ошибок нет — отличная работа!'}
        </h3>
        {wrongAnswers.length > 0 && (
          <ul className="test-result-errors">
            {wrongAnswers.map((a) => (
              <li key={a.questionId} className="test-result-error-row">
                <button
                  type="button"
                  className="test-result-error-card"
                  onClick={() => onWordClick?.(a.wordId)}
                  aria-label={`Подробности слова ${a.wordCharacter}`}
                >
                  <div className="test-result-error-char">{a.wordCharacter}</div>
                  <div className="test-result-error-body">
                    <div className="test-result-error-pinyin">{a.wordPinyin}</div>
                    <div className="test-result-error-translation">{a.wordTranslation}</div>
                    <div className="test-result-error-compare">
                      <span className="test-result-error-wrong">
                        <X size={11} /> {a.userAnswer || '— пусто —'}
                      </span>
                      <span className="test-result-error-correct">
                        <Check size={11} /> {a.correctAnswer}
                      </span>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="test-result-actions">
        {onBackToLevels && (
          <button
            type="button"
            className="test-result-btn test-result-btn-secondary"
            onClick={onBackToLevels}
          >
            К уровням
          </button>
        )}
        {onRetry && (
          <button
            type="button"
            className="test-result-btn test-result-btn-primary"
            onClick={onRetry}
          >
            Пройти заново
          </button>
        )}
      </div>
    </div>
  );
}

function BreakdownRow({ item }: { item: TestBreakdownItem }) {
  const pct = item.total === 0 ? 0 : Math.round((item.correct / item.total) * 100);
  const colorClass = pct >= 80 ? 'test-result-bar-good' : pct >= 50 ? 'test-result-bar-mid' : 'test-result-bar-bad';
  return (
    <div className="test-result-breakdown-row">
      <div className="test-result-breakdown-head">
        <span className="test-result-breakdown-label">{typeLabel(item.type)}</span>
        <span className="test-result-breakdown-value">
          {item.correct} / {item.total} ({pct}%)
        </span>
      </div>
      <div className="test-result-bar">
        <div
          className={cn('test-result-bar-fill', colorClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function typeLabel(type: TestQuestionType): string {
  switch (type) {
    case 'multiple-choice-translation':
      return 'Выбор перевода';
    case 'reverse-choice-character':
      return 'Выбор иероглифа';
    case 'pinyin-input':
      return 'Набор пиньиня';
    case 'tone-recognition':
      return 'Тон на слух';
    case 'character-assembly':
      return 'Собери слово';
    case 'cloze':
      return 'Вставь слово';
  }
}
