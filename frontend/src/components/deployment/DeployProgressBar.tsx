import type { DeploymentStatus } from "@/hooks/useDeploymentLogStream";
import { cn } from "@/lib/utils";

type DeployProgressBarProps = {
  status: DeploymentStatus;
  /** 0-100 when the run reports its position; omit to keep the bar indeterminate. */
  value?: number | null;
  className?: string;
};

const TERMINAL_TONE: Partial<Record<DeploymentStatus, string>> = {
  succeeded: "bg-status-ok",
  failed: "bg-status-fail",
  aborted: "bg-status-warn",
};

/**
 * Progress for a run, measured whenever the run says where it is.
 *
 * The agent's artifact deploy names the stage it is in and Jenkins reports an
 * elapsed-vs-estimate figure, so those runs get a real bar. Plain SSH/PMP
 * output still carries no step markers: there the bar stays an honest
 * indeterminate sweep rather than a fake "step 4 of 7".
 */
export const DeployProgressBar = ({ status, value, className }: DeployProgressBarProps) => {
  const isActive = status === "running" || status === "connecting";
  const terminalTone = TERMINAL_TONE[status];
  const percent =
    typeof value === "number" && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null;

  return (
    <div
      className={cn("h-1 w-full overflow-hidden bg-line-strong", className)}
      role="progressbar"
      aria-label="Deployment progress"
      aria-valuetext={percent === null ? status : `${status} — ${Math.round(percent)}%`}
      {...(percent === null
        ? {}
        : { "aria-valuenow": Math.round(percent), "aria-valuemin": 0, "aria-valuemax": 100 })}
    >
      {isActive && percent !== null ? (
        <div
          className="h-1 bg-status-run transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      ) : isActive ? (
        <div className="h-1 w-1/4 animate-indeterminate bg-status-run" />
      ) : terminalTone ? (
        <div className={cn("h-1 w-full", terminalTone)} />
      ) : null}
    </div>
  );
};
