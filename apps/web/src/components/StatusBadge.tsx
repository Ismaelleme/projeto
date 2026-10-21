import type { VisitStatus } from "@lins/shared";
import { STATUS_LABELS } from "@lins/shared";

const tone: Record<VisitStatus, string> = {
  PENDING_REVIEW: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  CANCELLED: "muted",
  EXPIRED: "muted",
  COMPLETED: "complete",
};

export function StatusBadge({ status }: { status: VisitStatus }) {
  return (
    <span className={`status-badge status-badge--${tone[status]}`}>
      <span className="status-badge__dot" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}
