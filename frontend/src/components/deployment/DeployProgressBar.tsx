import type { DeploymentStatus } from "@/hooks/useDeploymentLogStream";
import { cn } from "@/lib/utils";

type DeployProgressBarProps = {
  status: DeploymentStatus;
  className?: string;
};

const TERMINAL_TONE: Partial<Record<DeploymentStatus, string>> = {
  succeeded: "bg-status-ok",
  failed: "bg-status-fail",
  aborted: "bg-status-warn",
};

/**
 * Progress for a run whose steps we cannot see.
 *
 * The adapters stream free-form text with no step markers, so this is an
 * honest indeterminate bar while work is in flight and a solid bar in the
 * terminal colour once it settles — never a fake "step 4 of 7".
 */
export const DeployProgressBar = ({ status, className }: DeployProgressBarProps) => {
  const isActive = status === "running" || status === "connecting";
  const terminalTone = TERMINAL_TONE[status];

  return (
    <div
      className={cn("h-1 w-full overflow-hidden bg-line-strong", className)}
      role="progressbar"
      aria-label="Deployment progress"
      aria-valuetext={status}
    >
      {isActive ? (
        <div className="h-1 w-1/4 animate-indeterminate bg-status-run" />
      ) : terminalTone ? (
        <div className={cn("h-1 w-full", terminalTone)} />
      ) : null}
    </div>
  );
};
