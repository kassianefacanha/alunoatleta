import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { CircularProgress } from "@mui/material";

const DashboardPage = lazy(() => import("../views/DashboardPage").then((page) => ({ default: page.DashboardPage })));
const HomePage = lazy(() => import("../views/HomePage").then((page) => ({ default: page.HomePage })));
const LegalPage = lazy(() => import("../views/LegalPage").then((page) => ({ default: page.LegalPage })));
const LoginPage = lazy(() => import("../views/LoginPage").then((page) => ({ default: page.LoginPage })));
const RegistrationPage = lazy(() => import("../views/RegistrationPage").then((page) => ({ default: page.RegistrationPage })));
const StatusPage = lazy(() => import("../views/StatusPage").then((page) => ({ default: page.StatusPage })));

export function App() {
  return (
    <Suspense fallback={<div className="page-loading" role="status"><CircularProgress size={26} /></div>}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/inscricao" element={<RegistrationPage />} />
        <Route path="/inscricao/status" element={<StatusPage />} />
        <Route path="/termos" element={<LegalPage />} />
        <Route path="/privacidade" element={<LegalPage privacy />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="*" element={<HomePage />} />
      </Routes>
    </Suspense>
  );
}
