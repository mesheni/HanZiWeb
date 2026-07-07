import { useLocation, useNavigate } from 'react-router-dom';
import { Home, BookOpen, Library, PenLine, BarChart3, ClipboardList } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'home', icon: Home, label: 'Главная', route: '/' },
  { id: 'study', icon: BookOpen, label: 'Учить', route: '/study' },
  { id: 'library', icon: Library, label: 'Слова', route: '/library' },
  { id: 'handwriting', icon: PenLine, label: 'Письмо', route: '/handwriting' },
  { id: 'test', icon: ClipboardList, label: 'Тест', route: '/test' },
  { id: 'stats', icon: BarChart3, label: 'Итоги', route: '/stats' },
] as const;

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-bg-secondary border-t border-border-default flex justify-around items-center px-1 py-1.5 md:hidden">
      {NAV_ITEMS.map((item) => {
        const active = location.pathname === item.route;
        const Icon = item.icon;

        return (
          <button
            key={item.id}
            onClick={() => navigate(item.route)}
            aria-label={item.label}
            className="flex flex-col items-center justify-center gap-0.5 w-14 h-12 rounded-xl transition-colors duration-150 border-none cursor-pointer bg-transparent"
            style={{
              color: active ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >
            <Icon size={18} />
            <span className="text-[9px] leading-none">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
