import { type ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

interface ModalEntry {
  close: () => void;
}

/**
 * Module-level стек открытых Modal'ов + ЕДИНСТВЕННЫЙ document-listener
 * (fix v0.4 §18 follow-up). Per-instance keydown-обработчики закрывали
 * ВСЕ вложенные модалки сразу (WordDetailModal внутри DeckBuilderModal),
 * т.к. каждое открытое окно вешало свой listener. Теперь Escape
 * закрывает ровно одну — верхнюю в стеке (`modalStack.at(-1)`).
 * Тот же стек управляет body-overflow: скролл разблокируется, только
 * когда стек пуст.
 */
const modalStack: ModalEntry[] = [];

function handleDocumentKeyDown(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return;
  const top = modalStack[modalStack.length - 1];
  top?.close();
}

export default function Modal({ open, onClose, title, children }: ModalProps) {
  useEffect(() => {
    if (!open) return undefined;
    const entry: ModalEntry = { close: onClose };
    modalStack.push(entry);
    if (modalStack.length === 1) {
      document.addEventListener('keydown', handleDocumentKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      const idx = modalStack.indexOf(entry);
      if (idx !== -1) modalStack.splice(idx, 1);
      if (modalStack.length === 0) {
        document.removeEventListener('keydown', handleDocumentKeyDown);
        document.body.style.overflow = '';
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-md mx-4 bg-bg-card border border-border-default rounded-2xl shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
          {title && <h3 className="text-base font-medium text-text-primary">{title}</h3>}
          <button
            onClick={onClose}
            className="ml-auto p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
            aria-label="Закрыть"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
