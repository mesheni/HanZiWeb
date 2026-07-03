import { useLocation, useNavigate } from 'react-router-dom';
import { Home, BookOpen, Library, PenLine, BarChart3, Settings, LogOut, Wifi, WifiOff, Heart, Moon, Sun } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useTheme } from '@/ui/useTheme';

const NAV_ITEMS = [
  { id: 'home', icon: Home, label: 'Главная', route: '/' },
  { id: 'study', icon: BookOpen, label: 'Учить', route: '/study' },
  { id: 'library', icon: Library, label: 'Слова', route: '/library' },
  { id: 'handwriting', icon: PenLine, label: 'Письмо', route: '/handwriting' },
] as const;

const BOTTOM_ITEMS = [
  { id: 'stats', icon: BarChart3, label: 'Итоги', route: '/stats' },
  { id: 'donate', icon: Heart, label: 'Помочь', route: '/donate' },
  { id: 'settings', icon: Settings, label: 'Настройки', route: '/settings' },
] as const;

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const isOnline = useOnlineStatus();
  const { toggle, isDark } = useTheme();

  const isActive = (route: string) => location.pathname === route;

  return (
    <aside className="sidebar">
      <div
        onClick={() => navigate('/')}
        className="sidebar-logo cursor-pointer select-none"
        role="button"
        tabIndex={0}
      >
        汉
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`sidebar-btn${isActive(item.route) ? ' active' : ''}`}
            onClick={() => navigate(item.route)}
            aria-label={item.label}
          >
            <item.icon size={20} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-divider" />

      <div className="sidebar-bottom">
        {BOTTOM_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`sidebar-btn${isActive(item.route) ? ' active' : ''}`}
            onClick={() => navigate(item.route)}
            aria-label={item.label}
          >
            <item.icon size={20} />
            <span>{item.label}</span>
          </button>
        ))}

        <button
          className="sidebar-btn"
          onClick={() => toggle()}
          aria-label={isDark ? 'Светлая тема' : 'Тёмная тема'}
          title={isDark ? 'Светлая тема' : 'Тёмная тема'}
        >
          {isDark ? <Sun size={20} /> : <Moon size={20} />}
          <span>{isDark ? 'Светлая' : 'Тёмная'}</span>
        </button>

        <button
          className="sidebar-btn"
          onClick={() => logout()}
          aria-label="Выйти"
        >
          <LogOut size={20} />
          <span>Выйти</span>
        </button>
      </div>

      <div
        title={isOnline ? 'Онлайн' : 'Офлайн'}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 42,
          height: 42,
          borderRadius: 12,
          marginTop: 10,
          marginLeft: 'auto',
          marginRight: 'auto',
          color: isOnline ? '#22c55e' : 'var(--accent)',
          background: isOnline ? 'rgba(34,197,94,0.1)' : 'var(--accent-bg)',
        }}
      >
        {isOnline ? <Wifi size={17} /> : <WifiOff size={17} />}
      </div>
    </aside>
  );
}
