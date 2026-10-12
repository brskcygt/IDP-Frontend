import { X } from "lucide-react";
import type { DeploymentRunView } from "@/hooks/useDeploymentRun";
import type { DeploymentStatus } from "@/hooks/useDeploymentLogStream";
import { cn } from "@/lib/utils";
import { useRunContext } from "@/hooks/useRunContext";

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

type DeploymentTabProps = {
  run: DeploymentRunView;
  isActive: boolean;
  onSelect: (runKey: string) => void;
  onClose: (runKey: string) => void;
};

/** One run's tab: project, then customer and version once the run record says which. */
const DeploymentTab = ({ run, isActive, onSelect, onClose }: DeploymentTabProps) => {
  const context = useRunContext(run.project, run.deploymentId ?? run.attachDeploymentId);
  const isDone = TERMINAL.has(run.status);
  const project = run.project?.name ?? "Silinmiş proje";
  const label = [project, context.customer, context.version].filter(Boolean).join(" · ");

  return (
    <div
      className={cn(
        "flex h-7 shrink-0 items-center gap-1 rounded-md pl-2.5 pr-1 transition-colors",
        isActive ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60",
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(run.runKey)}
        aria-pressed={isActive}
        title={label}
        className="flex items-center gap-1.5 font-mono text-[11px]"
      >
        <span
          aria-hidden="true"
          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT_TONE[run.status], !isDone && "animate-pulse")}
        />
        <span className="max-w-[260px] truncate">{label}</span>
      </button>
      {isDone && (
        <button
          type="button"
          aria-label={`${label} sekmesini kapat`}
          title="Sekmeyi kapat"
          onClick={() => onClose(run.runKey)}
          className="rounded p-0.5 opacity-60 transition-opacity hover:bg-line-strong hover:opacity-100"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </div>
  );
};

/** Switches the terminal panel between every deployment tracked this session (T-71). */
export const DeploymentTabs = ({ runs, activeRunKey, onSelect, onClose, onBrowseSessions }: DeploymentTabsProps) => (
  <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-bar px-3">
    {runs.map((run) => (
      <DeploymentTab key={run.runKey} run={run} isActive={run.runKey === activeRunKey} onSelect={onSelect} onClose={onClose} />
    ))}

    <button
      type="button"
      onClick={onBrowseSessions}
      className="ml-auto shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] text-dim transition-colors hover:bg-accent/60 hover:text-foreground"
    >
      Dağıtım geçmişi…
    </button>
  </div>
);
