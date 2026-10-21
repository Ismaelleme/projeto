import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { PRIVACY_NOTICE_VERSION, type VisitDto } from "@lins/shared";
import { AppShell } from "../components/AppShell";
import { EmptyState, LoadingBlock, Notice } from "../components/Feedback";
import { Icon } from "../components/Icon";
import { ErrorNotice, PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { api } from "../lib/api";
import { formatCpfInput, formatDateTime } from "../lib/format";

interface FormState {
  visitorName: string;
  cpf: string;
  company: string;
  contact: string;
  purpose: string;
  hostName: string;
  accepted: boolean;
}

const emptyForm: FormState = {
  visitorName: "",
  cpf: "",
  company: "",
  contact: "",
  purpose: "",
  hostName: "",
  accepted: false,
};

const demoForm: FormState = {
  visitorName: "Visitante Teste",
  cpf: "111.444.777-35",
  company: "Visitante Exemplo Ltda",
  contact: "(14) 99999-0000",
  purpose: "Visita técnica de demonstração",
  hostName: "Equipe Usina Lins",
  accepted: false,
};

export function VisitorPage() {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [visits, setVisits] = useState<VisitDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [lastCreated, setLastCreated] = useState<VisitDto | null>(null);
  const successRef = useRef<HTMLDivElement>(null);

  const loadVisits = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await api.myVisits();
      setVisits(result.requests);
    } catch (caught) {
      setLoadError(caught);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVisits();
  }, [loadVisits]);

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setForm((current) => ({ ...current, [key]: value }));
    setIdempotencyKey(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    const key = idempotencyKey ?? crypto.randomUUID();
    if (!idempotencyKey) {
      setIdempotencyKey(key);
    }
    try {
      const created = await api.createVisit(
        {
          visitorName: form.visitorName.trim(),
          cpf: form.cpf,
          company: form.company.trim() || undefined,
          contact: form.contact.trim() || undefined,
          purpose: form.purpose.trim(),
          hostName: form.hostName.trim() || undefined,
          privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
          privacyNoticeAccepted: form.accepted,
        },
        key,
      );
      setLastCreated(created);
      setForm(emptyForm);
      setIdempotencyKey(null);
      await loadVisits();
      window.setTimeout(() => successRef.current?.focus(), 50);
    } catch (caught) {
      setSubmitError(caught);
    } finally {
      setSubmitting(false);
    }
  };

  const pending = visits.filter((visit) => visit.status === "PENDING_REVIEW").length;
  const approved = visits.filter((visit) => visit.status === "APPROVED").length;

  return (
    <AppShell>
      <div className="page page--visitor">
        <PageHeader
          eyebrow="Portal do visitante"
          title="Solicitar uma visita"
          description={
            <p>
              Preencha os dados mínimos para análise. O CPF é validado, não pedimos RG e
              o aviso abaixo é obrigatório.
            </p>
          }
          actions={
            <div className="stat-strip" aria-label="Resumo das solicitações">
              <span>
                <strong>{visits.length}</strong> solicitações
              </span>
              <span>
                <strong>{pending}</strong> em análise
              </span>
              <span>
                <strong>{approved}</strong> aprovadas
              </span>
            </div>
          }
        />

        <div className="visitor-layout">
          <section className="panel panel--form" aria-labelledby="form-title">
            <div className="panel__header">
              <span className="step-marker">01</span>
              <div>
                <h2 id="form-title">Dados da solicitação</h2>
                <p>Campos com <span aria-hidden="true">*</span> são obrigatórios.</p>
              </div>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setForm(demoForm);
                  setIdempotencyKey(null);
                  setSubmitError(null);
                }}
              >
                Preencher exemplo
              </button>
            </div>

            <form onSubmit={(event) => void handleSubmit(event)} className="form-stack">
              {submitError ? <ErrorNotice error={submitError} /> : null}

              <div className="field-grid">
                <label className="field field--wide">
                  <span className="field__label">
                    Nome completo <span aria-hidden="true">*</span>
                  </span>
                  <input
                    type="text"
                    value={form.visitorName}
                    onChange={(event) => updateField("visitorName", event.target.value)}
                    autoComplete="name"
                    maxLength={120}
                    required
                    placeholder="Como consta no documento"
                  />
                </label>

                <label className="field">
                  <span className="field__label">
                    CPF <span aria-hidden="true">*</span>
                  </span>
                  <input
                    type="text"
                    value={form.cpf}
                    onChange={(event) => updateField("cpf", formatCpfInput(event.target.value))}
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={14}
                    required
                    placeholder="000.000.000-00"
                    aria-describedby="cpf-help"
                  />
                  <span id="cpf-help" className="field__hint">
                    Validado no backend. Não armazenado em texto claro.
                  </span>
                </label>

                <label className="field">
                  <span className="field__label">Empresa</span>
                  <input
                    type="text"
                    value={form.company}
                    onChange={(event) => updateField("company", event.target.value)}
                    autoComplete="organization"
                    maxLength={120}
                    placeholder="Opcional"
                  />
                </label>

                <label className="field">
                  <span className="field__label">Contato</span>
                  <input
                    type="tel"
                    value={form.contact}
                    onChange={(event) => updateField("contact", event.target.value)}
                    autoComplete="tel"
                    maxLength={80}
                    placeholder="Telefone ou e-mail (opcional)"
                  />
                </label>

                <label className="field">
                  <span className="field__label">Anfitrião na usina</span>
                  <input
                    type="text"
                    value={form.hostName}
                    onChange={(event) => updateField("hostName", event.target.value)}
                    maxLength={120}
                    placeholder="Opcional"
                  />
                </label>

                <label className="field field--wide">
                  <span className="field__label">
                    Motivo da visita <span aria-hidden="true">*</span>
                  </span>
                  <textarea
                    value={form.purpose}
                    onChange={(event) => updateField("purpose", event.target.value)}
                    maxLength={200}
                    rows={3}
                    required
                    placeholder="Descreva brevemente a atividade"
                  />
                </label>
              </div>

              <div className="privacy-box">
                <div className="privacy-box__title">
                  <Icon name="shield" size={18} />
                  <span>Aviso de privacidade</span>
                  <code>{PRIVACY_NOTICE_VERSION}</code>
                </div>
                <p>
                  Este ambiente é demonstrativo e usa somente dados fictícios. O CPF é
                  validado para o fluxo, mas não é persistido em texto claro. Nenhuma
                  imagem é coletada e nenhum acesso físico é executado.
                </p>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={form.accepted}
                    onChange={(event) => updateField("accepted", event.target.checked)}
                    required
                  />
                  <span>Li e compreendo o aviso de demonstração.</span>
                </label>
              </div>

              <div className="form-actions">
                <button
                  type="submit"
                  className="button button--primary"
                  disabled={submitting}
                >
                  {submitting ? "Enviando…" : "Enviar para análise"}
                  {!submitting ? <Icon name="arrow-right" size={17} /> : null}
                </button>
                <span className="form-actions__note">
                  <Icon name="shield" size={15} />
                  Repetição segura com chave de idempotência.
                </span>
              </div>
            </form>
          </section>

          <aside className="visitor-aside">
            <div className="aside-card aside-card--dark">
              <p className="eyebrow eyebrow--light">O que acontece depois</p>
              <ol className="mini-steps">
                <li>
                  <span>1</span>
                  <p>
                    <strong>Análise interna</strong>
                    Um analista autorizado aprova ou rejeita a solicitação.
                  </p>
                </li>
                <li>
                  <span>2</span>
                  <p>
                    <strong>Conferência na portaria</strong>
                    A equipe registra uma verificação demonstrativa.
                  </p>
                </li>
                <li>
                  <span>3</span>
                  <p>
                    <strong>Liberação virtual</strong>
                    Registro lógico, sem acionar catraca ou hardware.
                  </p>
                </li>
              </ol>
            </div>

            <div ref={successRef} tabIndex={-1} aria-live="polite">
              {lastCreated ? (
                <div className="success-card">
                  <span className="success-card__icon">
                    <Icon name="check" size={22} />
                  </span>
                  <div>
                    <p className="success-card__title">Solicitação enviada</p>
                    <p>
                      Código <strong>{lastCreated.requestCode}</strong>. CPF mascarado:{" "}
                      <strong>{lastCreated.cpfMasked}</strong>.
                    </p>
                    <p className="success-card__status">
                      <StatusBadge status={lastCreated.status} />
                    </p>
                  </div>
                </div>
              ) : (
                <div className="aside-card">
                  <p className="eyebrow">Privacidade por padrão</p>
                  <ul className="check-list">
                    <li>
                      <Icon name="check" size={16} /> Sem RG
                    </li>
                    <li>
                      <Icon name="check" size={16} /> Sem imagem ou selfie
                    </li>
                    <li>
                      <Icon name="check" size={16} /> CPF completo fora das respostas
                    </li>
                    <li>
                      <Icon name="check" size={16} /> Dados sintéticos nesta demo
                    </li>
                  </ul>
                </div>
              )}
            </div>

            <Notice tone="warning" title="Ambiente de demonstração">
              <p>
                A liberação exibida na portaria é apenas virtual. Nenhum equipamento é
                acionado e não há integração com Hikvision.
              </p>
            </Notice>
          </aside>
        </div>

        <section className="history-section" aria-labelledby="history-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Acompanhamento</p>
              <h2 id="history-title">Minhas solicitações</h2>
            </div>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => void loadVisits()}
              disabled={loading}
            >
              <Icon name="refresh" size={16} />
              Atualizar
            </button>
          </div>

          {loading ? <LoadingBlock label="Carregando solicitações" /> : null}
          {loadError ? <ErrorNotice error={loadError} /> : null}
          {!loading && !loadError && visits.length === 0 ? (
            <EmptyState title="Nenhuma solicitação ainda" icon="list">
              Use o formulário acima para criar a primeira visita de demonstração.
            </EmptyState>
          ) : null}

          <div className="request-list">
            {visits.map((visit) => (
              <article key={visit.id} className="request-card">
                <div className="request-card__top">
                  <div>
                    <p className="request-card__code">{visit.requestCode}</p>
                    <h3>{visit.purpose}</h3>
                  </div>
                  <StatusBadge status={visit.status} />
                </div>
                <dl className="request-card__meta">
                  <div>
                    <dt>Criada em</dt>
                    <dd>{formatDateTime(visit.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>CPF</dt>
                    <dd>{visit.cpfMasked}</dd>
                  </div>
                  <div>
                    <dt>Anfitrião</dt>
                    <dd>{visit.hostName ?? "Não informado"}</dd>
                  </div>
                  <div>
                    <dt>Versão</dt>
                    <dd>v{visit.version}</dd>
                  </div>
                </dl>
                {visit.decisionReason ? (
                  <p className="request-card__decision">
                    <strong>Orientação:</strong> {visit.decisionReason}
                  </p>
                ) : null}
                <details className="request-card__details">
                  <summary>
                    Ver detalhes
                    <Icon name="chevron-right" size={15} />
                  </summary>
                  <div className="request-card__details-body">
                    <p>
                      <strong>Nome:</strong> {visit.visitorName}
                    </p>
                    <p>
                      <strong>Empresa:</strong> {visit.company ?? "—"}
                    </p>
                    <p>
                      <strong>Contato:</strong> {visit.contact ?? "—"}
                    </p>
                    <p>
                      <strong>Aviso de privacidade:</strong> {visit.privacyNoticeVersion}
                    </p>
                    <p>
                      <strong>Decidida em:</strong> {formatDateTime(visit.decidedAt)}
                      {visit.decisionBy ? ` por ${visit.decisionBy}` : ""}
                    </p>
                    {visit.status === "APPROVED" ? (
                      <p className="request-card__hint">
                        <Icon name="gate" size={15} />
                        Apresente o código <strong>{visit.requestCode}</strong> na
                        portaria.
                      </p>
                    ) : null}
                  </div>
                </details>
              </article>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
