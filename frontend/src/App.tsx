import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';

const DashboardPage = lazy(() => import('./pages/DashboardPage').then(({ DashboardPage }) => ({ default: DashboardPage })));
const HomePage = lazy(() => import('./pages/HomePage').then(({ HomePage }) => ({ default: HomePage })));
const LegalPage = lazy(() => import('./pages/LegalPage').then(({ LegalPage }) => ({ default: LegalPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then(({ LoginPage }) => ({ default: LoginPage })));
const RegistrationPage = lazy(() => import('./pages/RegistrationPage').then(({ RegistrationPage }) => ({ default: RegistrationPage })));
const ResubmissionPage = lazy(() => import('./pages/ResubmissionPage').then(({ ResubmissionPage }) => ({ default: ResubmissionPage })));
const StatusPage = lazy(() => import('./pages/StatusPage').then(({ StatusPage }) => ({ default: StatusPage })));
const StudentsPage = lazy(() => import('./pages/StudentsPage').then(({ StudentsPage }) => ({ default: StudentsPage })));
const ClassesPage = lazy(() => import('./pages/ClassesPage').then(({ ClassesPage }) => ({ default: ClassesPage })));
const AttendancePage = lazy(() => import('./pages/AttendancePage').then(({ AttendancePage }) => ({ default: AttendancePage })));
const AssignmentsPage = lazy(() => import('./pages/AssignmentsPage').then(({ AssignmentsPage }) => ({ default: AssignmentsPage })));
const MaterialsNotificationsPage = lazy(() => import('./pages/MaterialsNotificationsPage').then(({ MaterialsNotificationsPage }) => ({ default: MaterialsNotificationsPage })));
const EventsEvaluationsPage = lazy(() => import('./pages/EventsEvaluationsPage').then(({ EventsEvaluationsPage }) => ({ default: EventsEvaluationsPage })));
const SocialPage = lazy(() => import('./pages/SocialPage').then(({ SocialPage }) => ({ default: SocialPage })));
const StudentProfilePage = lazy(() => import('./pages/StudentProfilePage').then(({ StudentProfilePage }) => ({ default: StudentProfilePage })));
const AuditLogsPage = lazy(() => import('./pages/AuditLogsPage').then(({ AuditLogsPage }) => ({ default: AuditLogsPage })));
const ExportsPage = lazy(() => import('./pages/ExportsPage').then(({ ExportsPage }) => ({ default: ExportsPage })));

function Protected({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  if (!sessionStorage.getItem('accessToken')) return <Navigate to="/login" replace />;
  const user = JSON.parse(sessionStorage.getItem('user') ?? '{}') as { role?: string };
  if (roles && !roles.includes(user.role ?? '')) return <Navigate to="/app" replace />;
  return children;
}

export function App() {
  return (
    <Suspense fallback={<Box role="status" aria-label="Carregando página" sx={{ minHeight: '40vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress aria-label="Carregando página" size={28} /></Box>}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/inscricao" element={<RegistrationPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/status" element={<Protected><StatusPage /></Protected>} />
        <Route path="/corrigir-inscricao" element={<Protected><ResubmissionPage /></Protected>} />
        <Route path="/termos-de-inscricao" element={<LegalPage document="termos-de-inscricao" />} />
        <Route path="/politica-de-privacidade" element={<LegalPage document="politica-de-privacidade" />} />
        <Route path="/app" element={<Protected><DashboardPage /></Protected>} />
        <Route path="/alunos" element={<Protected roles={['admin', 'teacher']}><StudentsPage /></Protected>} />
        <Route path="/turmas" element={<Protected roles={['admin', 'teacher']}><ClassesPage /></Protected>} />
        <Route path="/chamadas" element={<Protected roles={['admin', 'teacher']}><AttendancePage /></Protected>} />
        <Route path="/tarefas" element={<Protected><AssignmentsPage /></Protected>} />
        <Route path="/materiais-avisos" element={<Protected><MaterialsNotificationsPage /></Protected>} />
        <Route path="/eventos-avaliacoes" element={<Protected><EventsEvaluationsPage /></Protected>} />
        <Route path="/rede-social" element={<Protected><SocialPage /></Protected>} />
        <Route path="/meu-perfil" element={<Protected roles={['student']}><StudentProfilePage /></Protected>} />
        <Route path="/auditoria" element={<Protected roles={['admin']}><AuditLogsPage /></Protected>} />
        <Route path="/exportacoes" element={<Protected roles={['admin', 'teacher']}><ExportsPage /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
