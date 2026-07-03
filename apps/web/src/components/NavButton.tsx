import { type ElementType } from 'react';

interface NavButtonProps {
  icon: string | ElementType;
  label: string;
  active: boolean;
  onClick: () => void;
}

export default function NavButton({ icon: Icon, label, active, onClick }: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="w-[68px] h-[56px] rounded-[14px] border-none flex flex-col items-center justify-center gap-1 transition-all duration-150 mb-1 cursor-pointer"
      style={{
        background: active ? 'var(--accent-bg)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          const target = e.currentTarget;
          target.style.background = 'var(--bg-hover)';
          target.style.color = 'var(--text-secondary)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          const target = e.currentTarget;
          target.style.background = 'transparent';
          target.style.color = 'var(--text-muted)';
        }
      }}
    >
      {typeof Icon === 'string' ? (
        <span style={{ fontSize: 21, lineHeight: 1 }}>{Icon}</span>
      ) : (
        <Icon size={21} />
      )}
      <span style={{ fontSize: 11, lineHeight: 1.1 }}>{label}</span>
    </button>
  );
}
