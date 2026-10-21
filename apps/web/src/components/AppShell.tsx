import { useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { ROLE_LABELS, type Role } from "@lins/shared";
import { useAuth } from "../auth/AuthContext";
import { homeForRole } from "../lib/roles";
import { initials } from "../lib/format";
import { Brand } from "./Brand";
import { Icon, type IconName } from "./Icon";
import { ModeBanner } from "./ModeBanner";

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);

  if (!user) {
    return null;
  }

  const navByRole: Record<Role, NavItem[]> = {
    VISITOR: [{ to: "/visitor", label: "Minhas visitas", icon: "user" }],
    ANALYST: [{ to: "/internal", label: "Central de análise", icon: "list" }],
    GATE: [{ to: "/gate", label: "Portaria mobile", icon: "gate" }],
    AUDITOR: [{ to: "/audit", label: "Auditoria", icon: "audit" }],
  };

  const handleLogout = async (): Promise<void> => {
    setLeaving(true);
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div className="app-frame">
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <ModeBanner />
      <header className="topbar">
        <Brand to={homeForRole(user.role)} />
        <nav className="topnav" aria-label="Navegação principal">
          {navByRole[user.role].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `topnav__link ${isActive ? "topnav__link--active" : ""}`
              }
            >
              <Icon name={item.icon} size={16} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="topbar__user">
          <span className="avatar" aria-hidden="true">
            {initials(user.name)}
          </span>
          <span className="topbar__identity">
            <span className="topbar__name">{user.name}</span>
            <span className="topbar__role">{ROLE_LABELS[user.role]}</span>
          </span>
          <button
            type="button"
            className="icon-button"
            onClick={() => void handleLogout()}
            disabled={leaving}
            aria-label="Sair da sessão"
            title="Sair"
          >
            <Icon name="logout" size={18} />
          </button>
        </div>
      </header>
      <main id="conteudo" className="app-main">
        {children}
      </main>
      <footer className="app-footer">
        <span>
          <strong>MVP demonstrativo</strong> · dados sintéticos · verificação simulada
        </span>
        <span>Usina Lins · controle de visitas externas</span>
      </footer>
    </div>
  );
}
