import { useRef, useState } from "react";
import { History } from "lucide-react";
import type { Project } from "@/hooks/useProjects";
import { useProjectLastDeployment } from "@/hooks/useDeploymentHistory";
import { formatDeployDuration, formatRelativeTimeTr } from "@/lib/format";
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
    ? `çalışıyor ${elapsedLabel ?? ""}`.trim()
    : hasFailed
      ? `başarısız · ${formatRelativeTimeTr(project.lastDeploy)}`
      : formatRelativeTimeTr(project.lastDeploy);

  const durationLabel =
    !isDeploying && typeof lastDeployment?.durationMs === "number"
      ? formatDeployDuration(lastDeployment.durationMs)
      : null;

  const showDetails = !isDeploying && Boolean(lastDeployment);

  const openHover = () => {
    if (!showDetails) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setAnchor({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
  };
  const closeHover = () => setAnchor(null);

  return (
    <div
      ref={triggerRef}
      onMouseEnter={openHover}
      onMouseLeave={closeHover}
      className={cn(
        PROJECT_CELL,
        "tabular flex items-center gap-1.5 font-mono text-xs",
        isDeploying ? "text-status-run" : hasFailed ? "text-status-fail" : "text-muted-foreground",
      )}
    >
      <span className="truncate">{lastRunLabel}</span>
      {durationLabel && <span className="shrink-0 text-dim">· {durationLabel}</span>}

      {/* A labelled control rather than a bare icon: the history sheet is
          otherwise only reachable from the rail's Dağıtım geçmişi. */}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpenHistory(project);
        }}
        onFocus={openHover}
        onBlur={closeHover}
        aria-label={`${project.name} dağıtım geçmişi`}
        className="ml-auto inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-sans text-[11px] font-medium text-dim transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <History className="h-3 w-3" aria-hidden="true" />
        Geçmiş
      </button>
      {anchor && lastDeployment && <DeployHoverCard deployment={lastDeployment} anchor={anchor} />}
    </div>
  );
};
