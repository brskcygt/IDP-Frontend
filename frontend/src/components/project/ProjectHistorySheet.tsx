import { useState } from "react";
import { History } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { Project } from "@/hooks/useProjects";
import { useProjectDeploymentHistory } from "@/hooks/useDeploymentHistory";
import { ProjectHistoryEntry } from "./ProjectHistoryEntry";

const HISTORY_LIMIT = 20;

type ProjectHistorySheetProps = {
  project: Project | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Per-project deploy history (T-70): opened from a row's "last run" cell,
 * lists the project's last HISTORY_LIMIT deployments with expandable logs. */
export const ProjectHistorySheet = ({ project, isOpen, onOpenChange }: ProjectHistorySheetProps) => {
  const { data: history, isLoading, isError } = useProjectDeploymentHistory(project?.id, HISTORY_LIMIT);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpanded = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  const handleOpenChange = (open: boolean) => {
    if (!open) setExpandedId(null);
    onOpenChange(open);
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l-line-strong bg-background p-0 sm:max-w-[520px]"
      >
        <div className="shrink-0 border-b border-line-strong bg-bar px-5 py-4">
          <SheetTitle className="flex items-center gap-2.5 text-[15px] font-bold tracking-tight">
            <History className="h-4 w-4 text-primary" aria-hidden="true" />
            {project ? `${project.name} — deploy history` : "Deploy history"}
          </SheetTitle>
          <SheetDescription className="mt-1 font-mono text-[10.5px] tracking-[0.04em] text-dim">
            LAST {HISTORY_LIMIT} DEPLOYMENTS
          </SheetDescription>
        </div>

        <div className="min-h-0 flex-grow overflow-y-auto">
          {isError ? (
            <p className="px-5 py-6 text-sm text-status-fail">Could not load deployment history.</p>
          ) : isLoading ? (
            <p className="px-5 py-6 font-mono text-[11px] text-dim">Loading deployments…</p>
          ) : !history || history.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">No deployments recorded yet.</p>
          ) : (
            <ul>
              {history.map((entry) => (
                <ProjectHistoryEntry
                  key={entry.id}
                  entry={entry}
                  isExpanded={expandedId === entry.id}
                  onToggle={() => toggleExpanded(entry.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
