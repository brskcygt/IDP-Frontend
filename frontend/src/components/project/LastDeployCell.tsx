import { useRef, useState } from "react";
import { History } from "lucide-react";
import type { Project } from "@/hooks/useProjects";
import { useProjectLastDeployment } from "@/hooks/useDeploymentHistory";
import { formatDeployDuration, formatRelativeTime } from "@/lib/format";
import { PROJECT_CELL } from "./tableLayout";
import { DeployHoverCard } from "./DeployHoverCard";
import { cn } from "@/lib/utils";

type LastDeployCellProps = {
  project: Project;
  isDeploying: boolean;
  hasFailed: boolean;
  elapsedLabel?: string;
  onOpenHistory: (project: Project) => void;
};

type Anchor = { top: number; right: number };

/**
 * Enriched "last run" cell (T-70): the row stayed narrow so only two facts
 * show inline — relative time and, once known, how long the run took.
 * Everything else the backend now tracks (outcome, environment, who
 * triggered it, the failure message) lives in a hover card so this column
 * doesn't have to grow to fit it.
 */
export const LastDeployCell = ({
  project,
  isDeploying,
  hasFailed,
  elapsedLabel,
  onOpenHistory,
}: LastDeployCellProps) => {
  const { data: lastDeployment } = useProjectLastDeployment(project.id);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const lastRunLabel = isDeploying
    ? `running ${elapsedLabel ?? ""}`.trim()
    : hasFailed
      ? `failed ${formatRelativeTime(project.lastDeploy)}`
      : formatRelativeTime(project.lastDeploy);

  const durationLabel =
    !isDeploying && typeof lastDeployment?.durationMs === "number"
      ? formatDeployDuration(lastDeployment.durationMs)
      : null;

  const showDetails = !isDeploying && Boolean(lastDeployment);

  const openHover = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setAnchor({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
  };
  const closeHover = () => setAnchor(null);

  return (
    <div
      className={cn(
        PROJECT_CELL,
        "tabular flex items-center gap-1.5 font-mono text-xs",
        isDeploying ? "text-status-run" : hasFailed ? "text-status-fail" : "text-muted-foreground",
      )}
    >
      <span className="truncate">{lastRunLabel}</span>
      {durationLabel && <span className="shrink-0 text-dim">· {durationLabel}</span>}

      {showDetails && lastDeployment && (
        <div
          ref={triggerRef}
          tabIndex={0}
          onMouseEnter={openHover}
          onMouseLeave={closeHover}
          onFocus={openHover}
          onBlur={closeHover}
          className="ml-auto flex shrink-0 items-center focus-visible:outline-none"
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenHistory(project);
            }}
            title="View deployment history"
            className="text-faint transition-colors hover:text-foreground"
          >
            <History className="h-3 w-3" aria-hidden="true" />
          </button>
          {anchor && <DeployHoverCard deployment={lastDeployment} anchor={anchor} />}
        </div>
      )}
    </div>
  );
};
