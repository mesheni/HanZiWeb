import type { PracticeType, StudyMode } from '@hanzi/shared';

export interface PracticeTypeInfo {
  id: PracticeType;
  /** Короткий заголовок (например, для карточки выбора). */
  label: string;
  /** Описание режима (1 строка). */
  description: string;
  /** Иконка Lucide. */
  icon: 'Layers' | 'ArrowLeftRight' | 'Keyboard' | 'Music2' | 'Puzzle' | 'CreditCard' | 'WholeWord';
  /** Цвет (для бейджа / подсветки). */
  color: string;
  /** Полупрозрачный фон для бейджа. */
  bg: string;
}

export const PRACTICE_TYPES: PracticeTypeInfo[] = [
  {
    id: 'flip-card',
    label: 'Карточки',
    description: 'Классический flip — посмотри иероглиф, открой перевод',
    icon: 'CreditCard',
    color: '#A78BFA',
    bg: 'rgba(167,139,250,0.15)',
  },
  {
    id: 'multiple-choice',
    label: 'Выбор перевода',
    description: 'Китайский → 4 варианта русского перевода',
    icon: 'Layers',
    color: '#4FC3F7',
    bg: 'rgba(79,195,247,0.15)',
  },
  {
    id: 'reverse-choice',
    label: 'Выбор иероглифа',
    description: 'Русский перевод → 4 варианта иероглифа',
    icon: 'ArrowLeftRight',
    color: '#81C784',
    bg: 'rgba(129,199,132,0.15)',
  },
  {
    id: 'pinyin-input',
    label: 'Ввод пиньиня',
    description: 'Набери пиньинь по иероглифу (тоны обязательны)',
    icon: 'Keyboard',
    color: '#FFB74D',
    bg: 'rgba(255,183,77,0.15)',
  },
  {
    id: 'tone-recognition',
    label: 'Тон на слух',
    description: 'Послушай аудио и выбери правильный тон (1/2/3/4)',
    icon: 'Music2',
    color: '#E57373',
    bg: 'rgba(229,115,115,0.15)',
  },
  {
    id: 'syllable-constructor',
    label: 'Собери пиньинь',
    description: 'Перетащи слоги пиньиня в правильном порядке',
    icon: 'Puzzle',
    color: '#BA68C8',
    bg: 'rgba(186,104,200,0.15)',
  },
  {
    id: 'cloze',
    label: 'Подстановка',
    description: 'Вставь пропущенное слово в предложение-пример',
    icon: 'WholeWord',
    color: '#F472B6',
    bg: 'rgba(244,114,182,0.15)',
  },
];

export function getPracticeTypeInfo(type: PracticeType): PracticeTypeInfo {
  return PRACTICE_TYPES.find((p) => p.id === type) ?? PRACTICE_TYPES[0]!;
}

export const STUDY_MODE_LABELS: Record<StudyMode, { label: string; color: string; bg: string }> = {
  mixed: { label: 'Тренировка', color: '#A78BFA', bg: 'rgba(167,139,250,0.15)' },
  review: { label: 'Повторение', color: '#FBBF24', bg: 'rgba(251,191,36,0.15)' },
  learn: { label: 'Изучение', color: '#34D399', bg: 'rgba(52,211,153,0.15)' },
};
