import type { ReactNode } from "react";

export type IconName =
  | "gate"
  | "user"
  | "list"
  | "audit"
  | "logout"
  | "check"
  | "x"
  | "alert"
  | "clock"
  | "arrow-right"
  | "refresh"
  | "shield"
  | "camera-off"
  | "search"
  | "chevron-right"
  | "sun";

const paths: Record<IconName, ReactNode> = {
  gate: (
    <>
      <path d="M5 21V5h5v16M14 21V5h5v16" />
      <path d="M10 11h4" />
      <circle cx="12" cy="11" r="1.6" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 20c.7-3.6 3.4-5.5 7-5.5s6.3 1.9 7 5.5" />
    </>
  ),
  list: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </>
  ),
  audit: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M15 3v5h5M9 12h6M9 16h6" />
    </>
  ),
  logout: (
    <>
      <path d="M10 5H5v14h5M14 8l4 4-4 4M9 12h9" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  alert: (
    <>
      <path d="M12 3 2.8 20h18.4z" />
      <path d="M12 9v5M12 17.5h.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  "arrow-right": <path d="M4 12h16M14 6l6 6-6 6" />,
  refresh: (
    <>
      <path d="M20 7v5h-5" />
      <path d="M19 12a8 8 0 1 1-2.6-5.9L20 9" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v5c0 4.5 2.9 8.2 7 10 4.1-1.8 7-5.5 7-10V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  "camera-off": (
    <>
      <path d="M3 4l18 16" />
      <path d="M9 5h6l1.5 2H21v11H7.5" />
      <path d="M3 8v10h3" />
      <circle cx="12.5" cy="12.5" r="3" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  "chevron-right": <path d="m9 5 7 7-7 7" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
    </>
  ),
};

export function Icon({
  name,
  size = 18,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}
