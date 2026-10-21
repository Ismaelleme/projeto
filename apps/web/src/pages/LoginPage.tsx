import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ROLE_LABELS, type Role } from "@lins/shared";
import { useAuth } from "../auth/AuthContext";
import { homeForRole } from "../lib/roles";
import { Brand } from "../components/Brand";
import { Icon } from "../components/Icon";
import { ErrorNotice } from "../components/PageHeader";
import { ModeBanner } from "../components/ModeBanner";

interface DemoAccount {
  role: Role;
  email: string;
  password: string;
  summary: string;
  icon: "user" | "list" | "gate" | "audit";
}

const demoAccounts: DemoAccount[] = [
  {
    role: "VISITOR",
    email: "visitante@demo.local",
    password: "Demo@1234",
    summary: "Solicitar e acompanhar uma visita.",
    icon: "user",
  },
  {
    role: "ANALYST",
    email: "analista@demo.local",
    password: "Demo@1234",
    summary: "Analisar, aprovar ou rejeitar solicitações.",
    icon: "list",
  },
  {
    role: "GATE",
    email: "portaria@demo.local",
    password: "Demo@1234",
    summary: "Conferir e registrar liberação simulada.",
    icon: "gate",
  },
  {
    role: "AUDITOR",
    email: "auditor@demo.local",
    password: "Demo@1234",
    summary: "Consultar eventos de auditoria.",
    icon: "audit",
  },
];

export function LoginPage() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("visitante@demo.local");
  const [password, setPassword] = useState("Demo@1234");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [activeRole, setActiveRole] = useState<Role>("VISITOR");

  if (user) {
    return <Navigate to={homeForRole(user.role)} replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const signed = await signIn(email, password);
      navigate(homeForRole(signed.role), { replace: true });
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  const fillAccount = (account: DemoAccount): void => {
    setEmail(account.email);
    setPassword(account.password);
    setActiveRole(account.role);
    setError(null);
  };

  return (
    <div className="login-page">
      <ModeBanner />
      <div className="login-layout">
        <section className="login-hero" aria-labelledby="login-hero-title">
          <div className="login-hero__top">
            <Brand to="/login" light />
            <span className="login-hero__status">
              <span className="pulse-dot" aria-hidden="true" />
              Sistema operacional
            </span>
          </div>

          <div className="login-hero__copy">
            <p className="eyebrow eyebrow--light">Acesso de visitantes externos</p>
            <h1 id="login-hero-title">
              Acesso
              <br />
              <span>controlado.</span>
            </h1>
            <p className="login-hero__lead">
              Da solicitação à portaria, cada decisão é registrada. Nesta demonstração,
              a conferência é simulada e nenhuma catraca é acionada.
            </p>
          </div>

          <ol className="flow-steps">
            <li>
              <span className="flow-steps__number">01</span>
              <span>
                <strong>Solicitação</strong>
                Dados mínimos, CPF validado e aviso de privacidade.
              </span>
            </li>
            <li>
              <span className="flow-steps__number">02</span>
              <span>
                <strong>Análise</strong>
                Decisão humana, atômica e auditada.
              </span>
            </li>
            <li>
              <span className="flow-steps__number">03</span>
              <span>
                <strong>Portaria</strong>
                Conferência simulada e liberação virtual.
              </span>
            </li>
          </ol>

          <div className="login-hero__footer">
            <span className="mono-tag">mode=SIMULATED</span>
            <span className="mono-tag">physicalAccessPerformed=false</span>
            <span className="mono-tag">dados sintéticos</span>
          </div>
        </section>

        <section className="login-panel" aria-labelledby="login-title">
          <div className="login-panel__inner">
            <p className="eyebrow">Portal de demonstração</p>
            <h2 id="login-title">Entrar no sistema</h2>
            <p className="login-panel__subtitle">
              Escolha um perfil abaixo ou informe as credenciais. Todas as contas usam a
              mesma senha de demonstração.
            </p>

            <div className="account-grid" aria-label="Contas de demonstração">
              {demoAccounts.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  className={`account-card ${
                    activeRole === account.role ? "account-card--active" : ""
                  }`}
                  onClick={() => fillAccount(account)}
                  aria-pressed={activeRole === account.role}
                >
                  <span className="account-card__icon">
                    <Icon name={account.icon} size={18} />
                  </span>
                  <span className="account-card__text">
                    <strong>{ROLE_LABELS[account.role]}</strong>
                    <span>{account.summary}</span>
                  </span>
                </button>
              ))}
            </div>

            <form onSubmit={(event) => void handleSubmit(event)} className="login-form">
              {error ? <ErrorNotice error={error} /> : null}
              <label className="field">
                <span className="field__label">E-mail</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="username"
                  inputMode="email"
                  required
                  autoFocus
                />
              </label>
              <label className="field">
                <span className="field__label">Senha</span>
                <span className="field__password">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="field__toggle"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? "Ocultar" : "Mostrar"}
                  </button>
                </span>
              </label>
              <button type="submit" className="button button--primary button--block" disabled={busy}>
                {busy ? "Entrando…" : "Entrar"}
                {!busy ? <Icon name="arrow-right" size={17} /> : null}
              </button>
            </form>

            <div className="login-panel__notice">
              <Icon name="alert" size={17} />
              <p>
                Não informe dados pessoais reais. Este ambiente existe apenas para
                demonstração do fluxo e usa dados fictícios.
              </p>
            </div>

            <p className="login-panel__support">
              Acesso restrito · MVP demonstrativo v0.1.0
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
