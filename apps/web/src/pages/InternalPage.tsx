import { useCallback, useEffect, useState } from "react";
import type { InternalVisitDetailDto, InternalVisitDto } from "@lins/shared";
import { AppShell } from "../components/AppShell";
import { useAuth } from "../auth/AuthContext";
import { EmptyState, LoadingBlock, Notice } from "../components/Feedback";
import { Icon } from "../components/Icon";
import { ErrorNotice, PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { api } from "../lib/api";
import { formatDateTime } from "../lib/format";

type Filter = "ALL" | "PENDING_REVIEW" | "APPROVED" | "REJECTED";

const filters: { value: Filter; label: string }[] = [
  { value: "ALL", label: "Todas" },
  { value: "PENDING_REVIEW", label: "Aguardando" },
  { value: "APPROVED", label: "Aprovadas" },
  { value: "REJECTED", label: "Rejeitadas" },
];

export function InternalPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<InternalVisitDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [selected, setSelected] = useState<InternalVisitDetailDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await api.internalVisits();
      setRequests(result.requests);
    } catch (caught) {
      setLoadError(caught);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const closeDrawer = useCallback(() => {
    setSelected(null);
    setReason("");
    setActionError(null);
    setValidationError(null);
    setActionSuccess(null);
  }, []);

  useEffect(() => {
    if (!selected) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        closeDrawer();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, closeDrawer]);

  const openDetail = async (id: string): Promise<void> => {
    setDetailLoading(true);
    setDetailError(null);
    setActionError(null);
    setValidationError(null);
    setActionSuccess(null);
    setReason("");
    try {
      const detail = await api.internalVisit(id);
      setSelected(detail);
    } catch (caught) {
      setDetailError(caught);
    } finally {
      setDetailLoading(false);
    }
  };

  const decide = async (decision: "APPROVE" | "REJECT"): Promise<void> => {
    if (!selected) {
      return;
    }
    setValidationError(null);
    setActionError(null);
    setActionSuccess(null);
    if (decision === "REJECT" && reason.trim().length < 3) {
      setValidationError("Informe o motivo da rejeição com pelo menos 3 caracteres.");
      return;
    }
    setBusy(true);
    try {
      const result = await api.decide(
        selected.request.id,
        decision,
        selected.request.version,
        reason.trim() || undefined,
      );
      setActionSuccess(
        decision === "APPROVE"
          ? `Visita ${result.request.requestCode} aprovada.`
          : `Visita ${result.request.requestCode} rejeitada.`,
      );
      setReason("");
      const [detail] = await Promise.all([
        api.internalVisit(selected.request.id),
        loadRequests(),
      ]);
      setSelected(detail);
    } catch (caught) {
      setActionError(caught);
      await loadRequests();
    } finally {
      setBusy(false);
    }
  };

  const pendingCount = requests.filter((request) => request.status === "PENDING_REVIEW").length;
  const approvedCount = requests.filter((request) => request.status === "APPROVED").length;
  const rejectedCount = requests.filter((request) => request.status === "REJECTED").length;
  const filtered =
    filter === "ALL" ? requests : requests.filter((request) => request.status === filter);
  const counts: Record<Filter, number> = {
    ALL: requests.length,
    PENDING_REVIEW: pendingCount,
    APPROVED: approvedCount,
    REJECTED: rejectedCount,
  };

  return (
    <AppShell>
      <div className="page page--internal">
        <PageHeader
          eyebrow="Portal interno"
          title="Central de análise"
          description={
            <p>
              Revise solicitações com dados mínimos. Cada decisão considera a versão
              atual e é registrada junto da auditoria na mesma transação.
            </p>
          }
          actions={
            <div className="stat-strip stat-strip--light" aria-label="Resumo da fila">
              <span>
                <strong>{pendingCount}</strong> aguardando
              </span>
              <span>
                <strong>{approvedCount}</strong> aprovadas
              </span>
              <span>
                <strong>{rejectedCount}</strong> rejeitadas
              </span>
            </div>
          }
        />

        <div className="toolbar">
          <div className="filter-tabs" role="group" aria-label="Filtrar solicitações">
            {filters.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`filter-tab ${filter === item.value ? "filter-tab--active" : ""}`}
                onClick={() => setFilter(item.value)}
                aria-pressed={filter === item.value}
              >
                {item.label}
                <span>{counts[item.value]}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => void loadRequests()}
            disabled={loading}
          >
            <Icon name="refresh" size={16} />
            Atualizar
          </button>
        </div>

        {loading ? <LoadingBlock label="Carregando fila" /> : null}
        {loadError ? <ErrorNotice error={loadError} /> : null}
        {detailError ? <ErrorNotice error={detailError} /> : null}

        {!loading && !loadError && filtered.length === 0 ? (
          <EmptyState title="Nenhuma solicitação neste filtro" icon="list">
            Novas solicitações aparecem aqui assim que forem enviadas.
          </EmptyState>
        ) : null}

        <div className="analysis-list">
          {filtered.map((request) => (
            <button
              key={request.id}
              type="button"
              className="analysis-row"
              onClick={() => void openDetail(request.id)}
            >
              <span className="analysis-row__code">
                <span>{request.requestCode}</span>
                <span className="analysis-row__version">v{request.version}</span>
              </span>
              <span className="analysis-row__person">
                <strong>{request.visitorName}</strong>
                <span>{request.company ?? "Sem empresa informada"}</span>
              </span>
              <span className="analysis-row__purpose">{request.purpose}</span>
              <span className="analysis-row__date">{formatDateTime(request.createdAt)}</span>
              <span className="analysis-row__status">
                <StatusBadge status={request.status} />
              </span>
              <span className="analysis-row__action" aria-hidden="true">
                <Icon name="chevron-right" size={18} />
              </span>
            </button>
          ))}
        </div>

        <Notice tone="info" title="Decisão auditada">
          <p>
            A sessão de <strong>{user?.name}</strong> é a autora das decisões. Nenhum
            identificador de ator é aceito do navegador.
          </p>
        </Notice>
      </div>

      {selected ? (
        <div
          className="drawer-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeDrawer();
            }
          }}
        >
          <aside
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-title"
          >
            <header className="drawer__header">
              <div>
                <p className="eyebrow">Solicitação</p>
                <h2 id="drawer-title">{selected.request.requestCode}</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={closeDrawer}
                aria-label="Fechar detalhes"
              >
                <Icon name="x" size={20} />
              </button>
            </header>

            <div className="drawer__body">
              <div className="drawer__status-row">
                <StatusBadge status={selected.request.status} />
                <span className="mono-tag">versão {selected.request.version}</span>
                <span className="mono-tag">{selected.request.cpfMasked}</span>
              </div>

              <dl className="detail-grid">
                <div>
                  <dt>Visitante</dt>
                  <dd>{selected.request.visitorName}</dd>
                </div>
                <div>
                  <dt>Empresa</dt>
                  <dd>{selected.request.company ?? "—"}</dd>
                </div>
                <div>
                  <dt>Contato</dt>
                  <dd>{selected.request.contact ?? "—"}</dd>
                </div>
                <div>
                  <dt>Anfitrião</dt>
                  <dd>{selected.request.hostName ?? "—"}</dd>
                </div>
                <div className="detail-grid__wide">
                  <dt>Motivo</dt>
                  <dd>{selected.request.purpose}</dd>
                </div>
                <div>
                  <dt>Criada em</dt>
                  <dd>{formatDateTime(selected.request.createdAt)}</dd>
                </div>
                <div>
                  <dt>Aviso</dt>
                  <dd>{selected.request.privacyNoticeVersion}</dd>
                </div>
              </dl>

              {selected.request.decisionReason ? (
                <Notice tone="info" title="Decisão registrada">
                  <p>{selected.request.decisionReason}</p>
                </Notice>
              ) : null}

              {actionSuccess ? (
                <Notice tone="success" title="Operação concluída">
                  <p>{actionSuccess}</p>
                </Notice>
              ) : null}
              {validationError ? (
                <Notice tone="warning" title="Revise a decisão">
                  <p>{validationError}</p>
                </Notice>
              ) : null}
              {actionError ? <ErrorNotice error={actionError} /> : null}

              {selected.request.status === "PENDING_REVIEW" ? (
                <section className="decision-panel" aria-labelledby="decision-title">
                  <div className="section-heading section-heading--compact">
                    <div>
                      <p className="eyebrow">Decisão</p>
                      <h3 id="decision-title">Aprovar ou rejeitar</h3>
                    </div>
                    <span className="mono-tag">visit.decide</span>
                  </div>
                  <label className="field">
                    <span className="field__label">Motivo ou observação</span>
                    <textarea
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      rows={3}
                      maxLength={500}
                      placeholder="Obrigatório para rejeição nesta demonstração."
                    />
                    <span className="field__hint">
                      A decisão usa a versão {selected.request.version}. Se outra pessoa
                      decidir antes, a API retorna conflito.
                    </span>
                  </label>
                  <div className="decision-panel__actions">
                    <button
                      type="button"
                      className="button button--danger"
                      onClick={() => void decide("REJECT")}
                      disabled={busy}
                    >
                      <Icon name="x" size={17} />
                      Rejeitar
                    </button>
                    <button
                      type="button"
                      className="button button--primary"
                      onClick={() => void decide("APPROVE")}
                      disabled={busy}
                    >
                      <Icon name="check" size={17} />
                      {busy ? "Registrando…" : "Aprovar visita"}
                    </button>
                  </div>
                </section>
              ) : null}

              <section className="drawer-section" aria-labelledby="history-detail-title">
                <div className="section-heading section-heading--compact">
                  <div>
                    <p className="eyebrow">Rastreabilidade</p>
                    <h3 id="history-detail-title">Histórico de decisões</h3>
                  </div>
                </div>
                {selected.decisions.length === 0 ? (
                  <p className="muted">Nenhuma decisão registrada.</p>
                ) : (
                  <ol className="timeline">
                    {selected.decisions.map((decision) => (
                      <li key={decision.id}>
                        <span className="timeline__dot" aria-hidden="true" />
                        <div>
                          <p>
                            <strong>
                              {decision.decision === "APPROVE" ? "Aprovada" : "Rejeitada"}
                            </strong>{" "}
                            por {decision.actorName}
                          </p>
                          <p className="muted">
                            {formatDateTime(decision.occurredAt)} · versão{" "}
                            {decision.requestVersion}
                          </p>
                          {decision.reason ? <p>{decision.reason}</p> : null}
                          <code className="inline-code">{decision.correlationId}</code>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <div className="drawer__metrics">
                <span>
                  <strong>{selected.request.identityCheckCount}</strong> conferências
                </span>
                <span>
                  <strong>{selected.request.releaseCount}</strong> liberações
                </span>
                <span>
                  <strong>{selected.request.decisionCount}</strong> decisões
                </span>
              </div>

              <p className="drawer__footnote">
                <Icon name="shield" size={15} />
                Dados mínimos, sem imagem. Toda ação crítica é auditada.
              </p>
            </div>
          </aside>
        </div>
      ) : null}

      {detailLoading ? (
        <div className="drawer-loading" role="status">
          <span className="spinner" aria-hidden="true" />
          Abrindo solicitação
        </div>
      ) : null}
    </AppShell>
  );
}
