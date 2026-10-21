import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export function Notice({
  tone = "info",
  title,
  children,
  icon,
}: {
  tone?: "info" | "warning" | "success" | "danger";
  title?: string;
  children: ReactNode;
  icon?: IconName;
}) {
  const fallback: IconName =
    tone === "success"
      ? "check"
      : tone === "danger"
        ? "x"
        : tone === "warning"
          ? "alert"
          : "shield";
  return (
    <div className={`notice notice--${tone}`} role={tone === "danger" ? "alert" : undefined}>
      <span className="notice__icon">
        <Icon name={icon ?? fallback} size={18} />
      </span>
      <div className="notice__body">
        {title ? <p className="notice__title">{title}</p> : null}
        <div className="notice__content">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  children,
  icon = "list",
}: {
  title: string;
  children?: ReactNode;
  icon?: IconName;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon">
        <Icon name={icon} size={26} />
      </span>
      <p className="empty-state__title">{title}</p>
      {children ? <div className="empty-state__body">{children}</div> : null}
    </div>
  );
}

export function LoadingBlock({ label = "Carregando" }: { label?: string }) {
  return (
    <div className="loading-block" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
