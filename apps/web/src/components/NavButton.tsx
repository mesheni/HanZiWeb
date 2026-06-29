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
      className="w-[54px] h-[48px] rounded-[10px] border-none flex flex-col items-center justify-center gap-[3px] transition-all duration-150 mb-0.5 cursor-pointer"
      style={{
        background: active ? 'var(--accent-bg)' : 'transparent',
        color: active ? 'var(--accent)' : '#48495C',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          (e.target as HTMLButtonElement).style.background = 'var(--bg-hover)';
          (e.target as HTMLButtonElement).style.color = '#888';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.target as HTMLButtonElement).style.background = 'transparent';
          (e.target as HTMLButtonElement).style.color = '#48495C';
        }
      }}
    >
      {typeof Icon === 'string' ? (
        <span style={{ fontSize: 20, lineHeight: 1 }}>{Icon}</span>
      ) : (
        <Icon size={20} />
      )}
      <span style={{ fontSize: 10, lineHeight: 1 }}>{label}</span>
    </button>
  );
}
