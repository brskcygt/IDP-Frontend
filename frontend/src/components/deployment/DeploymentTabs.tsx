import { X } from "lucide-react";
import type { DeploymentRunView } from "@/hooks/useDeploymentRun";
import type { DeploymentStatus } from "@/hooks/useDeploymentLogStream";
import { cn } from "@/lib/utils";

type DeploymentTabsProps = {
  runs: DeploymentRunView[];
  activeRunKey: string | null;
  onSelect: (runKey: string) => void;
  onClose: (runKey: string) => void;
  onBrowseSessions: () => void;
};

const TERMINAL = new Set<DeploymentStatus>(["succeeded", "failed", "aborted"]);

const DOT_TONE: Record<DeploymentStatus, string> = {
  idle: "bg-faint",
  connecting: "bg-status-run",
  running: "bg-status-run",
  succeeded: "bg-status-ok",
  failed: "bg-status-fail",
  aborted: "bg-status-warn",
};

/** Switches the terminal panel between every deployment tracked this session (T-71). */
export const DeploymentTabs = ({ runs, activeRunKey, onSelect, onClose, onBrowseSessions }: DeploymentTabsProps) => (
  <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-bar px-3">
    {runs.map((run) => {
      const isActive = run.runKey === activeRunKey;
      const isDone = TERMINAL.has(run.status);
      const label = run.project?.name ?? run.projectId;
      return (
        <div
          key={run.runKey}
          className={cn(
            "flex h-7 shrink-0 items-center gap-1 rounded-md pl-2.5 pr-1 transition-colors",
            isActive ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60",
          )}
        >
          <button
            type="button"
            onClick={() => onSelect(run.runKey)}
            aria-pressed={isActive}
            className="flex items-center gap-1.5 font-mono text-[11px]"
          >
            <span
              aria-hidden="true"
              className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT_TONE[run.status], !isDone && "animate-pulse")}
            />
            <span className="max-w-[140px] truncate">{label}</span>
          </button>
          {isDone && (
            <button
              type="button"
              aria-label={`Close ${label} tab`}
              onClick={() => onClose(run.runKey)}
              className="rounded p-0.5 opacity-60 transition-opacity hover:bg-line-strong hover:opacity-100"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          )}
        </div>
      );
    })}

    <button
      type="button"
      onClick={onBrowseSessions}
      className="ml-auto shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 font-mono text-[10.5px] text-dim transition-colors hover:bg-accent/60 hover:text-foreground"
    >
      Browse deployments…
    </button>
  </div>
);
