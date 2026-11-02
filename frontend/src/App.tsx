import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

const DashboardPage = lazy(() => import('./pages/DashboardPage').then(({ DashboardPage }) => ({ default: DashboardPage })));
const HomePage = lazy(() => import('./pages/HomePage').then(({ HomePage }) => ({ default: HomePage })));
const LegalPage = lazy(() => import('./pages/LegalPage').then(({ LegalPage }) => ({ default: LegalPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then(({ LoginPage }) => ({ default: LoginPage })));
const RegistrationPage = lazy(() => import('./pages/RegistrationPage').then(({ RegistrationPage }) => ({ default: RegistrationPage })));
const ResubmissionPage = lazy(() => import('./pages/ResubmissionPage').then(({ ResubmissionPage }) => ({ default: ResubmissionPage })));
const StatusPage = lazy(() => import('./pages/StatusPage').then(({ StatusPage }) => ({ default: StatusPage })));

function Protected({ children }: { children: React.ReactNode }) {
  return sessionStorage.getItem('accessToken') ? children : <Navigate to="/login" replace />;
}

export function App() {
  return (
    <Suspense fallback={<div role="status" style={{ padding: 24 }}>Carregando...</div>}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/inscricao" element={<RegistrationPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/status" element={<Protected><StatusPage /></Protected>} />
        <Route path="/corrigir-inscricao" element={<Protected><ResubmissionPage /></Protected>} />
        <Route path="/termos-de-inscricao" element={<LegalPage document="termos-de-inscricao" />} />
        <Route path="/politica-de-privacidade" element={<LegalPage document="politica-de-privacidade" />} />
        <Route path="/app" element={<Protected><DashboardPage /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
