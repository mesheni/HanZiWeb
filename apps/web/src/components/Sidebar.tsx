import { useLocation, useNavigate } from 'react-router-dom';
import { Home, BookOpen, Library, BarChart3, Settings, LogOut } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import NavButton from './NavButton';

const NAV_ITEMS = [
  { id: 'home', icon: Home, label: 'Главная', route: '/' },
  { id: 'study', icon: BookOpen, label: 'Учить', route: '/study' },
  { id: 'library', icon: Library, label: 'Слова', route: '/library' },
] as const;

const BOTTOM_ITEMS = [
  { id: 'stats', icon: BarChart3, label: 'Итоги', route: '/stats' },
  { id: 'settings', icon: Settings, label: 'Настройки', route: '/settings' },
] as const;

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);

  const isActive = (route: string) => location.pathname === route;

  return (
    <aside className="w-[62px] bg-bg-secondary border-r border-border-default flex flex-col items-center py-[18px] flex-shrink-0">
      <div
        onClick={() => navigate('/')}
        className="text-[23px] text-accent font-bold mb-5 leading-none cursor-pointer select-none"
        role="button"
        tabIndex={0}
      >
        汉
      </div>

      {NAV_ITEMS.map((item) => (
        <NavButton
          key={item.id}
          icon={item.icon}
          label={item.label}
          active={isActive(item.route)}
          onClick={() => navigate(item.route)}
        />
      ))}

      <div className="flex-1" />

      {BOTTOM_ITEMS.map((item) => (
        <NavButton
          key={item.id}
          icon={item.icon}
          label={item.label}
          active={isActive(item.route)}
          onClick={() => navigate(item.route)}
        />
      ))}

      <NavButton
        icon={LogOut}
        label="Выйти"
        active={false}
        onClick={() => logout()}
      />
    </aside>
  );
}
