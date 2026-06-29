import { useEffect } from 'react';
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
import HandwritingScreen from './screens/HandwritingScreen';
import PricingScreen from './screens/PricingScreen';
import SettingsScreen from './screens/SettingsScreen';

function GuestGuard({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const hydrateAuth = useAuthStore((s) => s.hydrateAuth);

  useEffect(() => {
    void hydrateAuth();
  }, [hydrateAuth]);

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
          <Route path="/handwriting" element={<HandwritingScreen />} />
          <Route path="/pricing" element={<PricingScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
