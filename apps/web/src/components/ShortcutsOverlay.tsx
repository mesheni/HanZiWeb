import Modal from './ui/Modal';
import type { PracticeType } from '@hanzi/shared';

interface ShortcutsOverlayProps {
  open: boolean;
  onClose: () => void;
  practiceType: PracticeType;
}

interface ShortcutRow {
  keys: string[];
  action: string;
}

function shortcutsFor(practiceType: PracticeType): ShortcutRow[] {
  if (practiceType === 'flip-card') {
    return [
      { keys: ['Space'], action: 'Показать ответ / перевернуть' },
      { keys: ['1', '2', '3', '4'], action: 'Оценка: не помню / трудно / помню / легко' },
      { keys: ['R'], action: 'Прослушать слово' },
      { keys: ['?'], action: 'Открыть/закрыть шпаргалку' },
    ];
  }
  if (
    practiceType === 'multiple-choice' ||
    practiceType === 'reverse-choice' ||
    practiceType === 'tone-recognition' ||
    practiceType === 'listening'
  ) {
    return [
      { keys: ['1', '2', '3', '4'], action: 'Выбрать вариант' },
      { keys: ['Enter'], action: 'Продолжить (после ответа)' },
      { keys: ['Space', 'R'], action: 'Прослушать слово' },
      { keys: ['?'], action: 'Открыть/закрыть шпаргалку' },
    ];
  }
  if (practiceType === 'pinyin-input' || practiceType === 'cloze') {
    return [
      { keys: ['Enter'], action: 'Отправить ответ' },
      { keys: ['?'], action: 'Открыть/закрыть шпаргалку' },
    ];
  }
  return [{ keys: ['?'], action: 'Открыть/закрыть шпаргалку' }];
}

function KeyCap({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-md border border-border-default bg-bg-hover text-xs font-mono text-text-primary">
      {children}
    </kbd>
  );
}

export default function ShortcutsOverlay({ open, onClose, practiceType }: ShortcutsOverlayProps) {
  const rows = shortcutsFor(practiceType);
  return (
    <Modal open={open} onClose={onClose} title="Горячие клавиши">
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.action} className="flex items-center justify-between gap-4">
            <span className="text-sm text-text-secondary">{row.action}</span>
            <span className="flex items-center gap-1 shrink-0">
              {row.keys.map((key) => (
                <KeyCap key={key}>{key}</KeyCap>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-text-muted">
        Режимы с вводом текста и перетаскиванием управляются мышью и клавиатурой внутри поля.
      </p>
    </Modal>
  );
}
