import { ChevronRight, Package, RotateCcw, Square } from "lucide-react";
import type { Project } from "@/hooks/useProjects";
import { providerClass } from "@/lib/projectMeta";
import { StatusMark } from "./StatusMark";
import { RunSparkline, type RunOutcome } from "./RunSparkline";
import { HostLoadCell } from "./HostLoadCell";
import { LastDeployCell } from "./LastDeployCell";
import { PROJECT_CELL, PROJECT_GRID } from "./tableLayout";
import { ProjectTargetsPanel, type DeploySelection } from "./ProjectTargetsPanel";
import { useSession } from "@/hooks/useSession";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type ProjectRowProps = {
  project: Project;
  /** Absent until the platform exposes run history; the sparkline degrades. */
  runs?: ReadonlyArray<RunOutcome>;
  elapsedLabel?: string;
  onDeploy: (project: Project, selection?: DeploySelection) => void;
  onReleases: (project: Project) => void;
  onAbort: (projectId: string) => void;
  onSettings: (project: Project) => void;
  onOpenHistory: (project: Project) => void;
  onAddTarget: (project: Project) => void;
  onRunStarted: (project: Project, deploymentId: string) => void;
  /** Customers stay collapsed until asked for: the list costs a request per project. */
  expanded: boolean;
  onToggleExpanded: (projectId: string) => void;
};

const ACTION_CLASS =
  "inline-flex h-[26px] items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const ProjectRow = ({
  project,
  runs,
  elapsedLabel,
  onDeploy,
  onReleases,
  onAbort,
  onSettings,
  onOpenHistory,
  onAddTarget,
  onRunStarted,
  expanded,
  onToggleExpanded,
}: ProjectRowProps) => {
  const { data: session } = useSession();
  // The backend is what actually blocks these actions (403); this only keeps the
  // UI from offering a button that is guaranteed to fail.
  const canDeploy = can(session?.role, 'deploy:trigger');
  const canAbort = can(session?.role, 'deploy:abort');
  const canView = can(session?.role, 'project:read');

  const isDeploying = project.status === "Deploying";
  const hasFailed = project.status === "Failed";
  const isArtifactProject = Boolean(project.config?.artifactDeploy);

  return (
    <>
    <div
      role="row"
      className={cn(
        PROJECT_GRID,
        "h-[46px] border-b border-line transition-colors hover:bg-surface",
        isDeploying && "bg-rowactive",
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "h-[46px]",
          isDeploying ? "bg-status-run" : hasFailed ? "bg-status-fail" : "bg-line-strong",
        )}
      />

      <div className={cn(PROJECT_CELL, "flex min-w-0 items-center gap-1")}>
        {isArtifactProject ? (
          <button
            type="button"
            onClick={() => onToggleExpanded(project.id)}
            aria-expanded={expanded}
            aria-label={`${expanded ? "Hide" : "Show"} customers of ${project.name}`}
            className="-ml-1 rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform motion-reduce:transition-none", expanded && "rotate-90")} />
          </button>
        ) : (
          <span className="w-[18px]" aria-hidden="true" />
        )}
        <button
          type="button"
          onClick={() => onSettings(project)}
          title={`Open settings for ${project.name}`}
          className="flex min-w-0 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <StatusMark status={project.status} />
          <span className="truncate font-semibold">{project.name}</span>
        </button>
      </div>

      <div className={cn(PROJECT_CELL, "truncate text-muted-foreground")}>{project.tenant}</div>

      <div className={cn(PROJECT_CELL, "font-mono text-xs", providerClass(project.provider))}>
        {project.provider}
      </div>

      <div className={PROJECT_CELL}>
        <HostLoadCell projectId={project.id} provider={project.provider} />
      </div>

      <div className={PROJECT_CELL}>
        <RunSparkline runs={runs} />
      </div>

      <LastDeployCell
        project={project}
        isDeploying={isDeploying}
        hasFailed={hasFailed}
        elapsedLabel={elapsedLabel}
        onOpenHistory={onOpenHistory}
      />

      <div className={cn(PROJECT_CELL, "text-right")}>
        {isDeploying && canAbort ? (
          <button
            type="button"
            onClick={() => onAbort(project.id)}
            className={cn(
              ACTION_CLASS,
              "border border-status-fail/40 text-status-fail hover:bg-status-fail/10",
            )}
          >
            <Square className="h-3 w-3" aria-hidden="true" />
            Abort
          </button>
        ) : isArtifactProject && canView ? (
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => onReleases(project)}
              aria-label={`Open releases for ${project.name}`}
              className={cn(ACTION_CLASS, "border border-line-strong hover:bg-accent")}
            >
              <Package className="h-3 w-3" aria-hidden="true" />
              Releases
            </button>
            {/* The ellipsis is a promise: this opens a screen where the release
                and the customer are chosen. Actions that deploy on the spot
                (the customer breakdown below) deliberately read differently. */}
            {canDeploy && <button
              type="button"
              onClick={() => onDeploy(project)}
              aria-label={`Choose a release and customer to deploy ${project.name}`}
              className={cn(ACTION_CLASS, "bg-primary font-semibold text-primary-foreground hover:bg-primary/90")}
            >
              Deploy…
            </button>}
          </div>
        ) : !isDeploying && hasFailed && canDeploy ? (
          <button
            type="button"
            onClick={() => onDeploy(project)}
            className={cn(
              ACTION_CLASS,
              "bg-primary font-semibold text-primary-foreground hover:bg-primary/90",
            )}
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            Retry
          </button>
        ) : !isDeploying && !hasFailed && canDeploy ? (
          <button
            type="button"
            onClick={() => onDeploy(project)}
            className={cn(
              ACTION_CLASS,
              "border border-line-strong hover:bg-accent",
            )}
          >
            Deploy…
          </button>
        ) : null}
      </div>
    </div>
    {expanded && isArtifactProject && (
      <ProjectTargetsPanel project={project} onDeploy={onDeploy} onAddTarget={onAddTarget} onRunStarted={onRunStarted} />
    )}
    </>
  );
};
