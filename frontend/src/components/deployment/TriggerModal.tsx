import { Terminal } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Project } from "@/hooks/useProjects";
import { useSession } from "@/hooks/useSession";
import { cn } from "@/lib/utils";
import { DeploySummary } from "@/components/deployment/DeploySummary";

type TriggerModalProps = {
  project: Project | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (projectId: string) => void;
};

export const TriggerModal = ({ project, isOpen, onOpenChange, onConfirm }: TriggerModalProps) => {
  const { data: session } = useSession();

  if (!project) return null;

  const handleDeploy = () => {
    onConfirm(project.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[468px]">
        <div className="border-b border-line px-6 py-5">
          <p className="mb-2 font-mono text-[10px] tracking-[0.14em] text-dim">TRIGGER DEPLOYMENT</p>
          <DialogTitle className="text-xl font-bold tracking-tight">{project.name}</DialogTitle>
          <DialogDescription className="mt-1.5 font-mono text-[11.5px] text-muted-foreground">
            {project.tenant} · {project.provider}
          </DialogDescription>
        </div>

        <div className="px-6 py-5">
          <DeploySummary project={project} />
        </div>

        <div className="flex items-center gap-2.5 border-t border-line bg-bar px-6 py-4">
          {session?.username && (
            <span className="font-mono text-[10.5px] text-faint">as {session.username}</span>
          )}
          <span className="flex-grow" />
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-[34px] rounded-md border border-line-strong px-3.5 text-[12.5px] font-medium transition-colors hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDeploy}
            className={cn(
              "inline-flex h-[34px] items-center gap-2 rounded-md px-4 text-[12.5px] font-bold transition-opacity hover:opacity-90",
              "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:opacity-40",
              "bg-primary text-primary-foreground",
            )}
          >
            <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
            Deploy
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
