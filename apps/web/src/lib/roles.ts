import type { Role } from "@lins/shared";

export function homeForRole(role: Role): string {
  switch (role) {
    case "VISITOR":
      return "/visitor";
    case "ANALYST":
      return "/internal";
    case "GATE":
      return "/gate";
    case "AUDITOR":
      return "/audit";
  }
}
