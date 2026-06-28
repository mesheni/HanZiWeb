import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import NavButton from './NavButton';

interface LayoutProps {
  children: ReactNode;
}

const NAV_ITEMS = [
  { id: 'home', icon: '⌂', label: 'Главная', route: '/' },
  { id: 'study', icon: '▦', label: 'Учить', route: '/study' },
  { id: 'library', icon: '▣', label: 'Слова', route: '/library' },
] as const;

const BOTTOM_ITEMS = [
  { id: 'stats', icon: '▤', label: 'Итоги', route: '/stats' },
  { id: 'settings', icon: '⚙', label: 'Настройки', route: '/settings' },
] as const;

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (route: string) => location.pathname === route;

  return (
    <div style={styles.app}>
      <nav style={styles.nav}>
        <div style={styles.logo}>汉</div>
        {NAV_ITEMS.map((item) => (
          <NavButton
            key={item.id}
            icon={item.icon}
            label={item.label}
            active={isActive(item.route)}
            onClick={() => navigate(item.route)}
          />
        ))}
        <div style={{ flex: 1 }} />
        {BOTTOM_ITEMS.map((item) => (
          <NavButton
            key={item.id}
            icon={item.icon}
            label={item.label}
            active={isActive(item.route)}
            onClick={() => navigate(item.route)}
          />
        ))}
      </nav>
      <main style={styles.main}>{children}</main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  app: {
    display: 'flex',
    height: '100%',
    background: 'var(--bg-primary)',
    borderRadius: 16,
    overflow: 'hidden',
    fontFamily: 'var(--font-sans)',
    color: 'var(--text-primary)',
    fontSize: 14,
  },
  nav: {
    width: 62,
    background: 'var(--bg-secondary)',
    borderRight: '1px solid var(--border-default)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '18px 0 14px',
    flexShrink: 0,
  },
  logo: {
    fontSize: 23,
    color: 'var(--accent)',
    fontWeight: 700,
    marginBottom: 20,
    lineHeight: 1,
  },
  main: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
};
