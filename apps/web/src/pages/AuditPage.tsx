import { useCallback, useEffect, useState, type FormEvent } from "react";
import { EVENT_LABELS, type AuditEventDto } from "@lins/shared";
import { AppShell } from "../components/AppShell";
import { EmptyState, LoadingBlock, Notice } from "../components/Feedback";
import { Icon } from "../components/Icon";
import { ErrorNotice, PageHeader } from "../components/PageHeader";
import { api } from "../lib/api";
import { formatDateTime, shortId } from "../lib/format";

interface Filters {
  targetType: string;
  targetId: string;
  eventType: string;
  limit: string;
}

const initialFilters: Filters = {
  targetType: "",
  targetId: "",
  eventType: "",
  limit: "50",
};

const eventTypes = Object.keys(EVENT_LABELS);

export function AuditPage() {
  const [events, setEvents] = useState<AuditEventDto[]>([]);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [applied, setApplied] = useState<Filters>(initialFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [queriedAt, setQueriedAt] = useState<string>(new Date().toISOString());

  const load = useCallback(async (current: Filters) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.auditEvents({
        targetType: current.targetType.trim() || undefined,
        targetId: current.targetId.trim() || undefined,
        eventType: current.eventType.trim() || undefined,
        limit: Number(current.limit) || 50,
      });
      setEvents(result.events);
      setQueriedAt(new Date().toISOString());
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(applied);
  }, [load, applied]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setApplied({ ...filters });
  };

  const reset = (): void => {
    setFilters(initialFilters);
    setApplied(initialFilters);
  };

  return (
    <AppShell>
      <div className="page page--audit">
        <PageHeader
          eyebrow="Auditoria e segurança"
          title="Trilha de eventos"
          description={
            <p>
              Consulta restrita ao perfil de auditoria. Cada consulta também é registrada
              e não há CPF completo, imagem, token ou payload sensível nos eventos.
            </p>
          }
          actions={
            <div className="stat-strip stat-strip--light">
              <span>
                <strong>{events.length}</strong> eventos retornados
              </span>
              <span>
                <strong>{formatDateTime(queriedAt)}</strong> última consulta
              </span>
            </div>
          }
        />

        <form className="filter-bar" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field__label">Tipo de alvo</span>
            <input
              type="text"
              value={filters.targetType}
              onChange={(event) =>
                setFilters((current) => ({ ...current, targetType: event.target.value }))
              }
              placeholder="VisitRequest"
              maxLength={80}
            />
          </label>
          <label className="field">
            <span className="field__label">ID do alvo</span>
            <input
              type="text"
              value={filters.targetId}
              onChange={(event) =>
                setFilters((current) => ({ ...current, targetId: event.target.value }))
              }
              placeholder="ID opaco"
              maxLength={120}
            />
          </label>
          <label className="field">
            <span className="field__label">Evento</span>
            <input
              type="text"
              list="event-types"
              value={filters.eventType}
              onChange={(event) =>
                setFilters((current) => ({ ...current, eventType: event.target.value }))
              }
              placeholder="Todos"
              maxLength={80}
            />
            <datalist id="event-types">
              {eventTypes.map((eventType) => (
                <option key={eventType} value={eventType}>
                  {EVENT_LABELS[eventType]}
                </option>
              ))}
            </datalist>
          </label>
          <label className="field field--small">
            <span className="field__label">Limite</span>
            <select
              value={filters.limit}
              onChange={(event) =>
                setFilters((current) => ({ ...current, limit: event.target.value }))
              }
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </label>
          <div className="filter-bar__actions">
            <button type="button" className="button button--ghost" onClick={reset}>
              Limpar
            </button>
            <button type="submit" className="button button--primary" disabled={loading}>
              <Icon name="search" size={16} />
              Consultar
            </button>
          </div>
        </form>

        <Notice tone="info" title="Consulta auditada">
          <p>
            A leitura da trilha registra o evento <code>AUDIT_QUERY</code> com o perfil
            autenticado, filtros e quantidade de resultados. O evento da consulta atual
            não aparece nesta mesma resposta.
          </p>
        </Notice>

        {loading ? <LoadingBlock label="Consultando auditoria" /> : null}
        {error ? <ErrorNotice error={error} /> : null}

        {!loading && !error && events.length === 0 ? (
          <EmptyState title="Nenhum evento encontrado" icon="audit">
            Ajuste os filtros ou execute o fluxo para gerar novos eventos.
          </EmptyState>
        ) : null}

        <div className="audit-list">
          {events.map((event) => (
            <article key={event.id} className="audit-event">
              <div className="audit-event__rail" aria-hidden="true">
                <span className={`audit-event__dot audit-event__dot--${event.result.toLowerCase()}`} />
              </div>
              <div className="audit-event__body">
                <div className="audit-event__top">
                  <div>
                    <p className="audit-event__type">
                      {EVENT_LABELS[event.eventType] ?? event.eventType}
                    </p>
                    <p className="audit-event__raw">{event.eventType}</p>
                  </div>
                  <div className="audit-event__tags">
                    <span className={`result-tag result-tag--${event.result.toLowerCase()}`}>
                      {event.result}
                    </span>
                    {event.mode ? <span className="mono-tag">{event.mode}</span> : null}
                  </div>
                </div>
                <dl className="audit-event__meta">
                  <div>
                    <dt>Quando</dt>
                    <dd>{formatDateTime(event.occurredAt)}</dd>
                  </div>
                  <div>
                    <dt>Ator</dt>
                    <dd>
                      {event.actorName ?? "Sistema"}{" "}
                      {event.actorRole ? (
                        <span className="muted">({event.actorRole})</span>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt>Alvo</dt>
                    <dd>
                      {event.targetType} · <code>{shortId(event.targetId)}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Correlação</dt>
                    <dd>
                      <code>{event.correlationId}</code>
                    </dd>
                  </div>
                </dl>
                {Object.keys(event.metadata).length > 0 ? (
                  <details className="audit-event__details">
                    <summary>Metadados redigidos</summary>
                    <pre>{JSON.stringify(event.metadata, null, 2)}</pre>
                  </details>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
