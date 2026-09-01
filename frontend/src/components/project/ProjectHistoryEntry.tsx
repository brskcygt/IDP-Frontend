import { ChevronDown, ChevronRight } from "lucide-react";
import type { DeploymentHistoryRecord } from "@/hooks/useDeploymentHistory";
import { deployStatusClass, deployStatusIcon, deployStatusLabel } from "@/lib/deploymentStatus";
import { isProductionEnv } from "@/lib/projectMeta";
import { formatClock, formatDayLabel, formatDeployDuration } from "@/lib/format";
import { DeploymentLogViewer } from "./DeploymentLogViewer";
import { cn } from "@/lib/utils";

type ProjectHistoryEntryProps = {
  entry: DeploymentHistoryRecord;
  isExpanded: boolean;
  onToggle: () => void;
};

/** One deployment record in the history sheet — collapsed to a summary line,
 * expands in place to the archived logs rather than opening another panel. */
export const ProjectHistoryEntry = ({ entry, isExpanded, onToggle }: ProjectHistoryEntryProps) => {
  const Icon = deployStatusIcon(entry.status);
  const durationLabel =
    typeof entry.durationMs === "number" ? formatDeployDuration(entry.durationMs) : "—";

  return (
    <li className="border-b border-line px-5 py-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="flex w-full items-start gap-2.5 text-left"
      >
        {isExpanded ? (
          <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-dim" aria-hidden="true" />
        ) : (
          <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-dim" aria-hidden="true" />
        )}

        <div className="min-w-0 flex-grow">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={cn(
                "flex items-center gap-1.5 text-[13px] font-semibold",
                deployStatusClass(entry.status),
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {deployStatusLabel(entry.status)}
            </span>
            {entry.environment && (
              <span
                className={cn(
                  "rounded border border-line-strong px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide",
                  isProductionEnv(entry.environment) ? "text-status-warn" : "text-dim",
                )}
              >
                {entry.environment}
              </span>
            )}
          </div>

          <div className="tabular mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10.5px] text-dim">
            <span>
              {formatDayLabel(entry.startedAt)} · {formatClock(entry.startedAt)}
            </span>
            <span>{durationLabel}</span>
            {entry.triggeredBy && <span className="truncate">by {entry.triggeredBy}</span>}
          </div>

          {entry.error && <p className="mt-1.5 text-[11px] text-status-fail">{entry.error}</p>}
        </div>
      </button>

      {isExpanded && (
        <div className="mt-3 pl-6">
          <DeploymentLogViewer deploymentId={entry.id} />
        </div>
      )}
    </li>
  );
};
