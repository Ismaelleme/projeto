import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import type { Role } from "@lins/shared";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { homeForRole } from "./lib/roles";
import { LoginPage } from "./pages/LoginPage";
import { VisitorPage } from "./pages/VisitorPage";
import { InternalPage } from "./pages/InternalPage";
import { AuditPage } from "./pages/AuditPage";
import { GatePage } from "./pages/GatePage";

function Splash() {
  return (
    <div className="splash" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>Preparando o portal</span>
    </div>
  );
}

function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return <Splash />;
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}

function RoleGate({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!roles.includes(user.role)) {
    return <Navigate to={homeForRole(user.role)} replace />;
  }
  return children;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) {
    return <Splash />;
  }
  return <Navigate to={user ? homeForRole(user.role) : "/login"} replace />;
}

function NotFound() {
  return (
    <div className="not-found">
      <p className="eyebrow">Erro 404</p>
      <h1>Página não encontrada</h1>
      <p>O endereço informado não existe neste portal.</p>
      <a className="button button--primary" href="/">
        Voltar ao início
      </a>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route
              path="/visitor"
              element={
                <RoleGate roles={["VISITOR"]}>
                  <VisitorPage />
                </RoleGate>
              }
            />
            <Route
              path="/internal"
              element={
                <RoleGate roles={["ANALYST"]}>
                  <InternalPage />
                </RoleGate>
              }
            />
            <Route
              path="/audit"
              element={
                <RoleGate roles={["AUDITOR"]}>
                  <AuditPage />
                </RoleGate>
              }
            />
            <Route
              path="/gate"
              element={
                <RoleGate roles={["GATE"]}>
                  <GatePage />
                </RoleGate>
              }
            />
          </Route>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
