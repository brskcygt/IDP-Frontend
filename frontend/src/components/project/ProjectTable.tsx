import type { Project } from "@/hooks/useProjects";
import { ProjectTableHeader } from "./ProjectTableHeader";
import { ProjectRow } from "./ProjectRow";
import { ProjectTableSkeleton } from "./ProjectTableSkeleton";
import { ProjectTableEmpty } from "./ProjectTableEmpty";
import { PROJECT_GRID_MIN_WIDTH } from "./tableLayout";

type ProjectTableProps = {
  projects: Project[];
  isLoading: boolean;
  hasFilters: boolean;
  deployingElapsed?: string;
  onDeploy: (project: Project) => void;
  onAbort: (projectId: string) => void;
  onSettings: (project: Project) => void;
  onOpenHistory: (project: Project) => void;
  onClearFilters: () => void;
  onCreateProject?: () => void;
};

export const ProjectTable = ({
  projects,
  isLoading,
  hasFilters,
  deployingElapsed,
  onDeploy,
  onAbort,
  onSettings,
  onOpenHistory,
  onClearFilters,
  onCreateProject,
}: ProjectTableProps) => (
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
            onAbort={onAbort}
            onSettings={onSettings}
            onOpenHistory={onOpenHistory}
          />
        ))
      )}
    </div>
  </div>
);
