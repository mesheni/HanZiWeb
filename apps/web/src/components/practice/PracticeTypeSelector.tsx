import {
  Layers,
  ArrowLeftRight,
  Keyboard,
  Music2,
  Puzzle,
  CreditCard,
  WholeWord,
} from 'lucide-react';
import { useStudyStore } from '../../stores/studyStore';
import { PRACTICE_TYPES, getPracticeTypeInfo } from '../../utils/practiceTypes';
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

/**
 * Экран выбора типа практики. Показывается перед запуском сессии,
 * если пользователь не указал practiceType явно (или захотел сменить).
 */
export default function PracticeTypeSelector({
  mode,
  onStart,
  onCancel,
}: PracticeTypeSelectorProps) {
  const practiceType = useStudyStore((s) => s.practiceType);
  const setPracticeType = useStudyStore((s) => s.setPracticeType);
  const modeInfo = getPracticeTypeInfo(practiceType);

  return (
    <div className="practice-selector">
      <div className="practice-selector-header">
        <div className="practice-selector-eyebrow">Тип практики</div>
        <h2 className="practice-selector-title">Выбери формат тренировки</h2>
        <p className="practice-selector-sub">{MODE_DESCRIPTION[mode]}</p>
      </div>

      <div className="practice-selector-grid">
        {PRACTICE_TYPES.map((p) => {
          const Icon = ICONS[p.icon];
          const isActive = practiceType === p.id;
          return (
            <button
              key={p.id}
              type="button"
              className={cn(
                'practice-selector-card',
                isActive && 'practice-selector-card-active',
              )}
              style={
                isActive
                  ? { borderColor: p.color, background: p.bg }
                  : undefined
              }
              onClick={() => setPracticeType(p.id)}
            >
              <div
                className="practice-selector-icon"
                style={{ color: p.color, background: p.bg }}
              >
                <Icon size={20} />
              </div>
              <div className="practice-selector-label">{p.label}</div>
              <div className="practice-selector-desc">{p.description}</div>
            </button>
          );
        })}
      </div>

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
