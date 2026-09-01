import { cn } from "@/lib/utils";
import { ConnectionCheckStatusIcon } from "@/components/project/settings/ConnectionCheckStatusIcon";
import type { ConnectionCheckResult } from "@/services/transport/types";

interface ConnectionCheckListProps {
  checks: ConnectionCheckResult[];
}

const statusLabel = (ok: boolean | null): string => (ok === true ? "Passed" : ok === false ? "Failed" : "Not tested");

/**
 * Renders the per-check results from `POST /api/projects/:id/test-connection`
 * (T-73): one row per check, a ✓/✗/– icon, and its human-readable detail.
 */
export const ConnectionCheckList = ({ checks }: ConnectionCheckListProps) => {
  if (checks.length === 0) return null;

  return (
    <ul className="space-y-2" aria-label="Connection test results">
      {checks.map((check) => (
        <li
          key={check.name}
          className={cn(
            "flex items-start gap-2.5 rounded-md border px-3 py-2 text-xs",
            check.ok === true && "border-status-ok/25 bg-status-ok/5",
            check.ok === false && "border-status-fail/25 bg-status-fail/5",
            check.ok === null && "border-border/50 bg-accent/20"
          )}
        >
          <span className="mt-0.5" title={statusLabel(check.ok)}>
            <ConnectionCheckStatusIcon ok={check.ok} />
          </span>
          <span className="min-w-0">
            <span className="block font-medium text-foreground">{check.name}</span>
            <span className="block text-muted-foreground/90 break-words">{check.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
};
