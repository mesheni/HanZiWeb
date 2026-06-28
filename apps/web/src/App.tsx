import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import ProtectedLayout from './components/ProtectedLayout';
import ToastContainer from './components/ui/Toast';
import HomeScreen from './screens/HomeScreen';
import StudyScreen from './screens/StudyScreen';
import LibraryScreen from './screens/LibraryScreen';
import StatsScreen from './screens/StatsScreen';
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';

function GuestGuard({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <>
      <ToastContainer />
      <Routes>
        <Route
          path="/login"
          element={
            <GuestGuard>
              <LoginScreen />
            </GuestGuard>
          }
        />
        <Route
          path="/register"
          element={
            <GuestGuard>
              <RegisterScreen />
            </GuestGuard>
          }
        />

        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/study" element={<StudyScreen />} />
          <Route path="/library" element={<LibraryScreen />} />
          <Route path="/stats" element={<StatsScreen />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
