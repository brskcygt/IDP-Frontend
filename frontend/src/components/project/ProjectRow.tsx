import { FolderOpen, RotateCcw, Square } from "lucide-react";
import type { Project } from "@/hooks/useProjects";
import { providerClass } from "@/lib/projectMeta";
import { StatusMark } from "./StatusMark";
import { RunSparkline, type RunOutcome } from "./RunSparkline";
import { HostLoadCell } from "./HostLoadCell";
import { LastDeployCell } from "./LastDeployCell";
import { PROJECT_CELL, PROJECT_GRID } from "./tableLayout";
import { useSession } from "@/hooks/useSession";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type ProjectRowProps = {
  project: Project;
  /** Absent until the platform exposes run history; the sparkline degrades. */
  runs?: ReadonlyArray<RunOutcome>;
  elapsedLabel?: string;
  /** Legacy (non-artifact) projects: the provider's own trigger dialog. */
  onDeploy: (project: Project) => void;
  /** Artifact projects: customers, versions and source live in the workspace. */
  onOpenWorkspace: (project: Project) => void;
  onAbort: (projectId: string) => void;
  onSettings: (project: Project) => void;
  onOpenHistory: (project: Project) => void;
};

const ACTION_CLASS =
  "inline-flex h-[26px] items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const ProjectRow = ({
  project,
  runs,
  elapsedLabel,
  onDeploy,
  onOpenWorkspace,
  onAbort,
  onSettings,
  onOpenHistory,
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
    <div
      role="row"
      // The whole row opens an artifact project's workspace; the controls in it
      // (name, last run, actions) keep their own behaviour.
      onClick={isArtifactProject ? (event) => {
        if ((event.target as HTMLElement).closest("button, a, input")) return;
        onOpenWorkspace(project);
      } : undefined}
      className={cn(
        PROJECT_GRID,
        "h-[46px] border-b border-line transition-colors hover:bg-surface",
        isArtifactProject && "cursor-pointer",
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
        <span className="w-[18px]" aria-hidden="true" />
        <button
          type="button"
          onClick={() => (isArtifactProject ? onOpenWorkspace(project) : onSettings(project))}
          title={isArtifactProject ? `${project.name} projesini aç` : `${project.name} ayarları`}
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
            Durdur
          </button>
        ) : isArtifactProject && canView ? (
          <button
            type="button"
            onClick={() => onOpenWorkspace(project)}
            aria-label={`${project.name} projesini aç`}
            className={cn(ACTION_CLASS, "bg-primary font-semibold text-primary-foreground hover:bg-primary/90")}
          >
            <FolderOpen className="h-3 w-3" aria-hidden="true" />
            Aç
          </button>
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
            Tekrar dene
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
            Dağıt…
          </button>
        ) : null}
      </div>
    </div>
  );
};
