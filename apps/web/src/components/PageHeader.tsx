import type { ReactNode } from "react";
import { ApiError } from "../lib/api";
import { Notice } from "./Feedback";

export function ErrorNotice({ error }: { error: unknown }) {
  const apiError = error instanceof ApiError ? error : null;
  return (
    <Notice tone="danger" title={apiError?.message ?? "Não foi possível concluir a operação."}>
      {apiError ? (
        <p className="error-meta">
          Código: <code>{apiError.code}</code>
          {apiError.correlationId ? (
            <>
              {" "}
              · Correlação: <code>{apiError.correlationId}</code>
            </>
          ) : null}
        </p>
      ) : (
        <p>Tente novamente. Se persistir, informe a equipe responsável.</p>
      )}
      {apiError && apiError.fields.length > 0 ? (
        <ul className="error-fields">
          {apiError.fields.map((field) => (
            <li key={`${field.name}-${field.message}`}>
              <strong>{field.name}:</strong> {field.message}
            </li>
          ))}
        </ul>
      ) : null}
    </Notice>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        <div className="page-header__description">{description}</div>
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}
