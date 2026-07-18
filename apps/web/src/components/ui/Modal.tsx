import { type ReactNode, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/**
 * Module-level счётчик одновременно открытых Modal'ов.
 * Сбрасываем `body.overflow` только когда счётчик доходит до нуля —
 * иначе при вложенных модалках (например, WordDetailModal внутри
 * DeckBuilderModal) закрытие внутренней реактивировало бы scroll,
 * хотя внешняя ещё открыта. См. PLAN_Features_v0.4 §18.
 */
let openModalCount = 0;

export default function Modal({ open, onClose, title, children }: ModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return undefined;
    if (openModalCount === 0) {
      document.body.style.overflow = 'hidden';
    }
    openModalCount += 1;
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      openModalCount -= 1;
      document.removeEventListener('keydown', handleKeyDown);
      if (openModalCount === 0) {
        document.body.style.overflow = '';
      }
    };
  }, [open, handleKeyDown]);

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
