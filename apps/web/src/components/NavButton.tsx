interface NavButtonProps {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}

export default function NavButton({ icon, label, active, onClick }: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        width: 46,
        height: 48,
        borderRadius: 10,
        border: 'none',
        background: active ? 'var(--accent-bg)' : 'transparent',
        color: active ? 'var(--accent)' : '#48495C',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        transition: 'all 0.15s',
        marginBottom: 2,
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
      <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
      <span style={{ fontSize: 9, lineHeight: 1 }}>{label}</span>
    </button>
  );
}
