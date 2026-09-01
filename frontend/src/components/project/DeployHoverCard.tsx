import type { DeploymentHistoryRecord } from "@/hooks/useDeploymentHistory";
import { deployStatusClass, deployStatusIcon, deployStatusLabel } from "@/lib/deploymentStatus";
import { formatDeployDuration, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type DeployHoverCardProps = {
  deployment: DeploymentHistoryRecord;
  /** Viewport-fixed anchor, measured from the trigger's bounding rect so the
   * card never gets clipped by the project table's own scroll container. */
  anchor: { top: number; right: number };
};

/** Detail popup for a project row's last-deploy summary — outcome, environment,
 * duration, who triggered it, and the failure message when there is one. */
export const DeployHoverCard = ({ deployment, anchor }: DeployHoverCardProps) => {
  const Icon = deployStatusIcon(deployment.status);
  const durationLabel =
    typeof deployment.durationMs === "number" ? formatDeployDuration(deployment.durationMs) : "—";

  return (
    <div
      role="tooltip"
      style={{ top: anchor.top, right: anchor.right }}
      className="fixed z-50 w-64 rounded-md border border-line-strong bg-bar p-3 shadow-xl"
    >
      <div
        className={cn(
          "flex items-center gap-1.5 font-mono text-[12px] font-semibold",
          deployStatusClass(deployment.status),
        )}
      >
        <Icon className={cn("h-3.5 w-3.5", deployment.status === "running" && "animate-spin")} aria-hidden="true" />
        {deployStatusLabel(deployment.status)}
      </div>

      <dl className="mt-2 space-y-1.5 font-mono text-[11px]">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-dim">Duration</dt>
          <dd className="text-foreground">{durationLabel}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-dim">Started</dt>
          <dd className="text-foreground">{formatRelativeTime(deployment.startedAt)}</dd>
        </div>
        {deployment.triggeredBy && (
          <div className="flex items-center justify-between gap-2">
            <dt className="text-dim">Triggered by</dt>
            <dd className="truncate text-foreground">{deployment.triggeredBy}</dd>
          </div>
        )}
      </dl>

      {deployment.error && (
        <p className="mt-2 border-t border-line pt-2 font-mono text-[10.5px] text-status-fail">
          {deployment.error}
        </p>
      )}
    </div>
  );
};
