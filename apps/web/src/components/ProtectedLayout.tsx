import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import Layout from './Layout';

export default function ProtectedLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHydrating = useAuthStore((s) => s.isHydrating);

  if (isHydrating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary">
        <span className="spinner" aria-label="Загрузка" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Layout />;
}
