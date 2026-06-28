import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';

interface LayoutProps {
  children?: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="flex h-full bg-bg-primary rounded-2xl overflow-hidden font-sans text-text-primary text-sm">
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      <main className="flex-1 relative overflow-hidden pb-14 md:pb-0">
        {children ?? <Outlet />}
      </main>

      <BottomNav />
    </div>
  );
}
