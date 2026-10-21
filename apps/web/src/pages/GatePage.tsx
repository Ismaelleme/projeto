import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  OUTCOME_LABELS,
  type GateVisitDto,
  type IdentityCheckDto,
  type IdentityOutcome,
  type ReleaseDto,
} from "@lins/shared";
import { AppShell } from "../components/AppShell";
import { EmptyState, LoadingBlock, Notice } from "../components/Feedback";
import { Icon } from "../components/Icon";
import { ErrorNotice, PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { api } from "../lib/api";
import { formatDateTime, shortId } from "../lib/format";

const outcomeOptions: IdentityOutcome[] = [
  "SIMULATED_MATCH",
  "SIMULATED_NO_MATCH",
  "INCONCLUSIVE",
  "ERROR",
  "UNAVAILABLE",
];

export function GatePage() {
  const [visits, setVisits] = useState<GateVisitDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<unknown>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visit, setVisit] = useState<GateVisitDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<unknown>(null);
  const [simulatedOutcome, setSimulatedOutcome] =
    useState<IdentityOutcome>("SIMULATED_MATCH");
  const [check, setCheck] = useState<IdentityCheckDto | null>(null);
  const [checkBusy, setCheckBusy] = useState(false);
  const [checkError, setCheckError] = useState<unknown>(null);
  const [release, setRelease] = useState<ReleaseDto | null>(null);
  const [releaseKey, setReleaseKey] = useState<string | null>(null);
  const [releaseBusy, setReleaseBusy] = useState(false);
  const [releaseError, setReleaseError] = useState<unknown>(null);

  const loadVisits = useCallback(async (query?: string): Promise<GateVisitDto[]> => {
    setLoading(true);
    setListError(null);
    try {
      const result = await api.gateVisits(query?.trim() || undefined);
      setVisits(result.visits);
      return result.visits;
    } catch (caught) {
      setListError(caught);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const selectVisit = useCallback(async (id: string) => {
    setSelectedId(id);
    setVisit(null);
    setDetailLoading(true);
    setDetailError(null);
    setCheck(null);
    setCheckError(null);
    setRelease(null);
    setReleaseKey(null);
    setReleaseError(null);
    try {
      const result = await api.gateVisit(id);
      setVisit(result.visit);
    } catch (caught) {
      setDetailError(caught);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVisits();
  }, [loadVisits]);

  useEffect(() => {
    if (!selectedId && visits.length > 0) {
      void selectVisit(visits[0].id);
    }
  }, [visits, selectedId, selectVisit]);

  const handleSearch = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const result = await loadVisits(search);
    if (result.length > 0) {
      void selectVisit(result[0].id);
    } else {
      setSelectedId(null);
      setVisit(null);
    }
  };

  const runCheck = async (): Promise<void> => {
    if (!visit) {
      return;
    }
    setCheckBusy(true);
    setCheckError(null);
    setRelease(null);
    setReleaseKey(null);
    setReleaseError(null);
    try {
      const result = await api.identityCheck(visit.id, simulatedOutcome);
      setCheck(result.check);
    } catch (caught) {
      setCheckError(caught);
    } finally {
      setCheckBusy(false);
    }
  };

  const requestRelease = async (): Promise<void> => {
    if (!visit || !check) {
      return;
    }
    setReleaseBusy(true);
    setReleaseError(null);
    const key = releaseKey ?? crypto.randomUUID();
    if (!releaseKey) {
      setReleaseKey(key);
    }
    try {
      const result = await api.release(visit.id, check.id, visit.version, key);
      setRelease(result);
      setVisit((current) =>
        current ? { ...current, lastReleaseDecision: result.decision } : current,
      );
      await loadVisits(search);
    } catch (caught) {
      setReleaseError(caught);
    } finally {
      setReleaseBusy(false);
    }
  };

  const outcomeChanged = (value: IdentityOutcome): void => {
    setSimulatedOutcome(value);
    setCheck(null);
    setCheckError(null);
    setRelease(null);
    setReleaseKey(null);
    setReleaseError(null);
  };

  const alreadyAuthorized =
    visit?.lastReleaseDecision === "AUTHORIZED" && release === null;
  const canRelease = Boolean(check) && !alreadyAuthorized;

  return (
    <AppShell>
      <div className="page page--gate">
        <PageHeader
          eyebrow="Portaria mobile · catraca virtual"
          title="Conferência e liberação"
          description={
            <p>
              Interface operacional demonstrativa. O backend revalida estado, vínculo da
              conferência, versão e idempotência antes de qualquer decisão.
            </p>
          }
          actions={
            <div className="stat-strip stat-strip--dark">
              <span>
                <strong>{visits.length}</strong> visitas elegíveis
              </span>
              <span className="mono-tag">mode=SIMULATED</span>
              <span className="mono-tag">physical=false</span>
            </div>
          }
        />

        <div className="gate-layout">
          <section className="gate-list" aria-labelledby="gate-list-title">
            <div className="section-heading section-heading--compact">
              <div>
                <p className="eyebrow">Visitas aprovadas</p>
                <h2 id="gate-list-title">Fila da portaria</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => void loadVisits(search)}
                aria-label="Atualizar visitas"
                title="Atualizar"
              >
                <Icon name="refresh" size={18} />
              </button>
            </div>

            <form className="search-box" onSubmit={(event) => void handleSearch(event)}>
              <Icon name="search" size={17} />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por código VIS-…"
                aria-label="Buscar visita por código"
              />
              <button type="submit" className="text-button">
                Buscar
              </button>
            </form>

            {loading ? <LoadingBlock label="Carregando visitas" /> : null}
            {listError ? <ErrorNotice error={listError} /> : null}
            {!loading && !listError && visits.length === 0 ? (
              <EmptyState title="Nenhuma visita aprovada" icon="gate">
                Aprove uma solicitação no portal interno para ela aparecer aqui.
              </EmptyState>
            ) : null}

            <div className="gate-visit-list">
              {visits.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`gate-visit ${
                    selectedId === item.id ? "gate-visit--active" : ""
                  }`}
                  onClick={() => void selectVisit(item.id)}
                  aria-pressed={selectedId === item.id}
                >
                  <span className="gate-visit__code">{item.requestCode}</span>
                  <span className="gate-visit__name">{item.visitorName}</span>
                  <span className="gate-visit__meta">
                    {item.company ?? "Sem empresa"} · {formatDateTime(item.approvedAt)}
                  </span>
                  <span className="gate-visit__footer">
                    <StatusBadge status={item.status} />
                    {item.lastReleaseDecision ? (
                      <span
                        className={`mini-release mini-release--${item.lastReleaseDecision.toLowerCase()}`}
                      >
                        {item.lastReleaseDecision === "AUTHORIZED"
                          ? "Liberação registrada"
                          : item.lastReleaseDecision === "DENIED"
                            ? "Última tentativa negada"
                            : "Resultado incerto"}
                      </span>
                    ) : (
                      <span className="mini-release">Sem liberação</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="gate-device" aria-labelledby="gate-device-title">
            <div className="gate-device__top">
              <div className="gate-device__brand">
                <span className="gate-device__antenna" aria-hidden="true" />
                <span>
                  <strong>PORTA 01</strong>
                  <small>terminal de demonstração</small>
                </span>
              </div>
              <span className="gate-device__signal">
                <span className="pulse-dot" aria-hidden="true" />
                API conectada
              </span>
            </div>

            {!visit ? (
              <div className="gate-device__empty">
                <Icon name="gate" size={34} />
                <h2 id="gate-device-title">Selecione uma visita</h2>
                <p>A conferência simulada só começa após carregar o estado do backend.</p>
              </div>
            ) : (
              <div className="gate-device__body">
                <div className="gate-visit-header">
                  <div>
                    <p className="eyebrow">Visita selecionada</p>
                    <h2 id="gate-device-title">{visit.requestCode}</h2>
                    <p className="gate-visit-header__name">{visit.visitorName}</p>
                  </div>
                  <StatusBadge status={visit.status} />
                </div>

                {detailLoading ? <LoadingBlock label="Consultando estado atual" /> : null}
                {detailError ? <ErrorNotice error={detailError} /> : null}

                <dl className="gate-detail-grid">
                  <div>
                    <dt>Empresa</dt>
                    <dd>{visit.company ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Anfitrião</dt>
                    <dd>{visit.hostName ?? "—"}</dd>
                  </div>
                  <div className="gate-detail-grid__wide">
                    <dt>Motivo</dt>
                    <dd>{visit.purpose}</dd>
                  </div>
                  <div>
                    <dt>Aprovada em</dt>
                    <dd>{formatDateTime(visit.approvedAt)}</dd>
                  </div>
                  <div>
                    <dt>Versão</dt>
                    <dd>v{visit.version}</dd>
                  </div>
                </dl>

                {!visit.eligible ? (
                  <Notice tone="danger" title="Visita inelegível">
                    <ul className="plain-list">
                      {visit.eligibilityReasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </Notice>
                ) : (
                  <div className="eligibility-strip">
                    <Icon name="check" size={16} />
                    Estado atual elegível para conferência demonstrativa
                  </div>
                )}

                <section className="device-step" aria-labelledby="step-check-title">
                  <div className="device-step__header">
                    <span className="step-marker step-marker--dark">01</span>
                    <div>
                      <h3 id="step-check-title">Conferência de identidade</h3>
                      <p>Adaptador fake · nenhuma câmera é acessada</p>
                    </div>
                  </div>

                  <label className="field field--dark">
                    <span className="field__label">Cenário do simulador</span>
                    <select
                      value={simulatedOutcome}
                      onChange={(event) =>
                        outcomeChanged(event.target.value as IdentityOutcome)
                      }
                    >
                      {outcomeOptions.map((outcome) => (
                        <option key={outcome} value={outcome}>
                          {OUTCOME_LABELS[outcome]}
                        </option>
                      ))}
                    </select>
                    <span className="field__hint">
                      Controle exclusivo da demonstração. Não representa biometria real.
                    </span>
                  </label>

                  {checkError ? <ErrorNotice error={checkError} /> : null}

                  {check ? (
                    <div className={`check-result check-result--${check.outcome.toLowerCase()}`}>
                      <span className="check-result__icon">
                        <Icon
                          name={
                            check.outcome === "SIMULATED_MATCH"
                              ? "check"
                              : check.outcome === "SIMULATED_NO_MATCH"
                                ? "x"
                                : "alert"
                          }
                          size={18}
                        />
                      </span>
                      <div>
                        <p className="check-result__title">
                          {OUTCOME_LABELS[check.outcome]}
                        </p>
                        <p className="check-result__meta">
                          <span className="mono-tag">SIMULATED</span>
                          <span>{formatDateTime(check.occurredAt)}</span>
                          <code>{shortId(check.id)}</code>
                        </p>
                      </div>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    className="button button--device"
                    onClick={() => void runCheck()}
                    disabled={checkBusy || !visit.eligible}
                  >
                    <Icon name="camera-off" size={17} />
                    {checkBusy
                      ? "Registrando…"
                      : check
                        ? "Registrar nova conferência"
                        : "Registrar conferência simulada"}
                  </button>
                </section>

                <section className="device-step" aria-labelledby="step-release-title">
                  <div className="device-step__header">
                    <span className="step-marker step-marker--dark">02</span>
                    <div>
                      <h3 id="step-release-title">Liberação virtual</h3>
                      <p>Decisão lógica, sem comando físico</p>
                    </div>
                  </div>

                  {alreadyAuthorized ? (
                    <Notice tone="warning" title="Liberação já registrada">
                      <p>
                        Esta visita já possui uma liberação autorizada. Uma nova chave é
                        bloqueada pelo backend; use a repetição da mesma solicitação para
                        consultar o resultado original.
                      </p>
                    </Notice>
                  ) : null}
                  {releaseError ? <ErrorNotice error={releaseError} /> : null}

                  <button
                    type="button"
                    className="button button--cta"
                    onClick={() => void requestRelease()}
                    disabled={!canRelease || releaseBusy}
                  >
                    <Icon name="gate" size={18} />
                    {releaseBusy ? "Processando…" : "Solicitar liberação virtual"}
                  </button>
                  <p className="device-note">
                    <Icon name="shield" size={14} />
                    O botão apenas registra uma decisão no backend. Nenhuma catraca é
                    acionada.
                  </p>

                  {release ? (
                    <div
                      className={`release-result release-result--${release.decision.toLowerCase()}`}
                      aria-live="polite"
                    >
                      <p className="release-result__kicker">
                        {release.decision === "AUTHORIZED"
                          ? "Liberação virtual simulada registrada"
                          : "Tentativa registrada e negada"}
                      </p>
                      <p className="release-result__decision">
                        {release.decision === "AUTHORIZED"
                          ? "ACESSO AUTORIZADO"
                          : "ACESSO NÃO AUTORIZADO"}
                      </p>
                      <p className="release-result__warning">
                        Sem abertura física. Resultado exclusivamente lógico e
                        demonstrativo.
                      </p>
                      {release.reasonCode ? (
                        <p className="release-result__reason">
                          Motivo: <code>{release.reasonCode}</code>
                        </p>
                      ) : null}
                      {release.idempotentReplay ? (
                        <p className="release-result__replay">
                          Repetição idempotente: nenhum novo efeito foi criado.
                        </p>
                      ) : null}
                      <dl className="release-result__meta">
                        <div>
                          <dt>modo</dt>
                          <dd>{release.mode}</dd>
                        </div>
                        <div>
                          <dt>physicalAccessPerformed</dt>
                          <dd>{String(release.physicalAccessPerformed)}</dd>
                        </div>
                        <div>
                          <dt>releaseId</dt>
                          <dd>{shortId(release.releaseId)}</dd>
                        </div>
                        <div>
                          <dt>correlação</dt>
                          <dd>{release.correlationId}</dd>
                        </div>
                      </dl>
                      <button
                        type="button"
                        className="button button--ghost button--block"
                        onClick={() => void requestRelease()}
                        disabled={releaseBusy}
                      >
                        <Icon name="refresh" size={16} />
                        Repetir mesma solicitação
                      </button>
                    </div>
                  ) : null}
                </section>

                <p className="gate-device__footnote">
                  <Icon name="shield" size={14} />
                  Estado lido do backend. Recarregue a visita se outra operação alterar a
                  versão.
                </p>
              </div>
            )}
          </section>

          <aside className="gate-rules">
            <p className="eyebrow">Regras aplicadas</p>
            <ul className="rule-list">
              <li>
                <span>01</span>
                Somente visita <strong>aprovada</strong> pode ser conferida.
              </li>
              <li>
                <span>02</span>
                A verificação não altera o estado da visita.
              </li>
              <li>
                <span>03</span>
                <code>SIMULATED_NO_MATCH</code> nunca autoriza.
              </li>
              <li>
                <span>04</span>
                Inconclusivo, erro e indisponível não autorizam.
              </li>
              <li>
                <span>05</span>
                Mesma chave + mesmo payload devolve o mesmo resultado.
              </li>
              <li>
                <span>06</span>
                Nenhum SDK, webhook ou comando Hikvision é usado.
              </li>
            </ul>
            <Notice tone="warning" title="Sem hardware">
              <p>
                Esta tela não controla catraca, relé ou dispositivo de rede. Em produção,
                uma integração exigiria decisão, homologação e controles próprios.
              </p>
            </Notice>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
