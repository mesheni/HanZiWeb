import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import Layout from './Layout';

export default function ProtectedLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Layout />;
}
