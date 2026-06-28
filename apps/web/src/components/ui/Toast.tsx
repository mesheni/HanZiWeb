import { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { useToastStore, type Toast } from '@/stores/toastStore';
import { cn } from '@/utils/cn';

function ToastItem({ toast }: { toast: Toast }) {
  const [visible, setVisible] = useState(false);
  const removeToast = useToastStore((s) => s.removeToast);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => setVisible(false), 2700);
    return () => clearTimeout(timer);
  }, []);

  const icons: Record<Toast['type'], typeof Info> = {
    success: CheckCircle,
    error: AlertCircle,
    info: Info,
  };

  const typeStyles: Record<Toast['type'], string> = {
    success: 'border-tone-2/40 bg-tone-2-bg',
    error: 'border-tone-4/40 bg-tone-4-bg',
    info: 'border-tone-1/40 bg-tone-1-bg',
  };

  const Icon = icons[toast.type];

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-sm transition-all duration-300',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
        typeStyles[toast.type],
      )}
    >
      <Icon size={16} className="shrink-0" />
      <span className="text-sm text-text-primary flex-1">{toast.message}</span>
      <button
        onClick={() => removeToast(toast.id)}
        className="shrink-0 p-0.5 rounded text-text-muted hover:text-text-primary transition-colors"
        aria-label="Закрыть"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
