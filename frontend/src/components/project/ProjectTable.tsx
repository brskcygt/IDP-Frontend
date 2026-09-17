import { useState } from "react";
import type { Project } from "@/hooks/useProjects";
import { ProjectTableHeader } from "./ProjectTableHeader";
import { ProjectRow } from "./ProjectRow";
import { ProjectTableSkeleton } from "./ProjectTableSkeleton";
import { ProjectTableEmpty } from "./ProjectTableEmpty";
import { PROJECT_GRID_MIN_WIDTH } from "./tableLayout";
import type { DeploySelection } from "./ProjectTargetsPanel";

type ProjectTableProps = {
  projects: Project[];
  isLoading: boolean;
  hasFilters: boolean;
  deployingElapsed?: string;
  onDeploy: (project: Project, selection?: DeploySelection) => void;
  onReleases: (project: Project) => void;
  onAbort: (projectId: string) => void;
  onSettings: (project: Project) => void;
  onOpenHistory: (project: Project) => void;
  onAddTarget: (project: Project) => void;
  onClearFilters: () => void;
  onCreateProject?: () => void;
};

export const ProjectTable = ({
  projects,
  isLoading,
  hasFilters,
  deployingElapsed,
  onDeploy,
  onReleases,
  onAbort,
  onSettings,
  onOpenHistory,
  onAddTarget,
  onClearFilters,
  onCreateProject,
}: ProjectTableProps) => {
  // Several projects can stay open at once: comparing what two customers run is
  // the reason to open them in the first place.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggle = (projectId: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(projectId)) next.delete(projectId);
    else next.add(projectId);
    return next;
  });

  return (
  <div className="flex min-h-0 flex-grow flex-col overflow-auto">
    <div className={PROJECT_GRID_MIN_WIDTH} role="table" aria-label="Projects">
      <ProjectTableHeader />
      {isLoading ? (
        <ProjectTableSkeleton />
      ) : projects.length === 0 ? (
        <ProjectTableEmpty
          hasFilters={hasFilters}
          onClearFilters={onClearFilters}
          onCreateProject={onCreateProject}
        />
      ) : (
        projects.map((project) => (
          <ProjectRow
            key={project.id}
            project={project}
            elapsedLabel={project.status === "Deploying" ? deployingElapsed : undefined}
            onDeploy={onDeploy}
            onReleases={onReleases}
            onAbort={onAbort}
            onSettings={onSettings}
            onOpenHistory={onOpenHistory}
            onAddTarget={onAddTarget}
            expanded={expanded.has(project.id)}
            onToggleExpanded={toggle}
          />
        ))
      )}
    </div>
  </div>
  );
};
