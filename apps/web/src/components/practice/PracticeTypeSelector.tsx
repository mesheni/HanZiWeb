import {
  Layers,
  ArrowLeftRight,
  Keyboard,
  Music2,
  Puzzle,
  CreditCard,
  WholeWord,
  GraduationCap,
  Dumbbell,
} from 'lucide-react';
import { useStudyStore } from '../../stores/studyStore';
import {
  getPracticeTypeInfo,
  isTrainingPractice,
  type PracticeTypeInfo,
} from '../../utils/practiceTypes';
import { usePracticeTypes } from '../../hooks/useFeatureFlag';
import { cn } from '../../utils/cn';
import type { PracticeType, StudyMode } from '@hanzi/shared';

const ICONS = {
  Layers,
  ArrowLeftRight,
  Keyboard,
  Music2,
  Puzzle,
  CreditCard,
  WholeWord,
} as const;

interface PracticeTypeSelectorProps {
  mode: StudyMode;
  onStart: (practiceType: PracticeType) => void;
  onCancel?: () => void;
}

const MODE_DESCRIPTION: Record<StudyMode, string> = {
  mixed: 'Смешанная сессия — повторение + новые слова',
  review: 'Только повторение — слова, у которых подошёл dueDate',
  learn: 'Только новые слова — для первичного запоминания',
};

interface TypeCardProps {
  info: PracticeTypeInfo;
  isActive: boolean;
  isTraining: boolean;
  onClick: () => void;
}

function TypeCard({ info, isActive, isTraining, onClick }: TypeCardProps) {
  const Icon = ICONS[info.icon];
  return (
    <button
      type="button"
      className={cn(
        'practice-selector-card',
        isActive && 'practice-selector-card-active',
        isTraining && 'practice-selector-card-training',
      )}
      style={
        isActive
          ? { borderColor: info.color, background: info.bg }
          : undefined
      }
      onClick={onClick}
    >
      <div
        className="practice-selector-icon"
        style={{ color: info.color, background: info.bg }}
      >
        <Icon size={20} />
      </div>
      <div className="practice-selector-label">{info.label}</div>
      <div className="practice-selector-desc">{info.description}</div>
      {isTraining && (
        <span
          className="practice-selector-card-training-badge"
          title="Тренировка: ответы не влияют на FSRS-прогресс, XP и достижения"
        >
          <Dumbbell size={10} aria-hidden />
          Тренировка
        </span>
      )}
    </button>
  );
}

/**
 * Экран выбора типа практики. Показывается перед запуском сессии,
 * если пользователь не указал practiceType явно (или захотел сменить).
 *
 * Разделяет режимы на две визуальные секции (PLAN_Features_v0.3 §20):
 * - **Изучение** — только `flip-card`: ответы влияют на FSRS-прогресс.
 * - **Тренировка** — все остальные режимы: для практики и запоминания,
 *   НЕ влияют на прогресс (на карточках стоит бейдж «Тренировка»).
 */
export default function PracticeTypeSelector({
  mode,
  onStart,
  onCancel,
}: PracticeTypeSelectorProps) {
  const practiceType = useStudyStore((s) => s.practiceType);
  const setPracticeType = useStudyStore((s) => s.setPracticeType);
  const modeInfo = getPracticeTypeInfo(practiceType);
  const visibleTypes = usePracticeTypes();

  // Разделяем на «Изучение» (только flip-card) и «Тренировка» (всё остальное).
  // Порядок внутри секции сохраняется как в PRACTICE_TYPES.
  const studyTypes = visibleTypes.filter((p) => !isTrainingPractice(p.id));
  const trainingTypes = visibleTypes.filter((p) => isTrainingPractice(p.id));

  return (
    <div className="practice-selector">
      <div className="practice-selector-header">
        <div className="practice-selector-eyebrow">Тип практики</div>
        <h2 className="practice-selector-title">Выбери формат тренировки</h2>
        <p className="practice-selector-sub">{MODE_DESCRIPTION[mode]}</p>
      </div>

      {studyTypes.length > 0 && (
        <div className="practice-selector-section">
          <div className="practice-selector-section-label">
            <GraduationCap size={13} aria-hidden />
            <span>Изучение</span>
            <small>влияет на прогресс</small>
          </div>
          <div className="practice-selector-grid">
            {studyTypes.map((p) => (
              <TypeCard
                key={p.id}
                info={p}
                isActive={practiceType === p.id}
                isTraining={false}
                onClick={() => setPracticeType(p.id)}
              />
            ))}
          </div>
        </div>
      )}

      {trainingTypes.length > 0 && (
        <div className="practice-selector-section">
          <div className="practice-selector-section-label">
            <Dumbbell size={13} aria-hidden />
            <span>Тренировка</span>
            <small>не влияет на прогресс</small>
          </div>
          <div className="practice-selector-grid">
            {trainingTypes.map((p) => (
              <TypeCard
                key={p.id}
                info={p}
                isActive={practiceType === p.id}
                isTraining
                onClick={() => setPracticeType(p.id)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="practice-selector-actions">
        {onCancel && (
          <button type="button" className="practice-selector-cancel" onClick={onCancel}>
            Отмена
          </button>
        )}
        <button
          type="button"
          className="practice-selector-start"
          style={{ background: modeInfo.color }}
          onClick={() => onStart(practiceType)}
        >
          Начать: {modeInfo.label}
        </button>
      </div>
    </div>
  );
}
