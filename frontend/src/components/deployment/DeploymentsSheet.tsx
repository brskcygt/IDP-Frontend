import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useDeploymentSessions, type DeploymentSession } from "@/hooks/useDeploymentSessions";
import { useProjects } from "@/hooks/useProjects";
import { PlayCircle, Clock, CheckCircle2, XCircle, AlertCircle, TerminalSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type DeploymentsSheetProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onAttach: (session: DeploymentSession) => void;
};

export const DeploymentsSheet = ({ isOpen, onOpenChange, onAttach }: DeploymentsSheetProps) => {
  const { data: sessions, isLoading } = useDeploymentSessions();
  const { data: projects } = useProjects();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
      case 'connecting':
        return <PlayCircle className="h-4 w-4 text-emerald-500 animate-pulse" />;
      case 'succeeded':
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'aborted':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getProjectName = (projectId: string) => {
    const p = projects?.find((p) => p.id === projectId);
    return p ? p.name : 'Unknown Project';
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center gap-2">
            <TerminalSquare className="h-5 w-5" />
            Active & Recent Deployments
          </SheetTitle>
          <SheetDescription>
            View background deployments and attach to their live terminal streams.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4">
          {isLoading && <div className="text-sm text-muted-foreground">Loading sessions...</div>}
          
          {!isLoading && (!sessions || sessions.length === 0) && (
            <div className="text-center py-8 text-muted-foreground text-sm bg-accent/30 rounded-lg border border-border/50">
              No active or recent deployments.
            </div>
          )}

          {sessions?.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()).map((session) => (
            <div 
              key={session.id}
              className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-card hover:border-primary/30 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">{getStatusIcon(session.status)}</div>
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-none">{getProjectName(session.projectId)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(session.startedAt), { addSuffix: true })}
                  </p>
                  <div className="flex gap-2">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground bg-accent/50 px-1.5 py-0.5 rounded">
                      {session.status}
                    </span>
                    <span className="text-[10px] text-muted-foreground bg-accent/50 px-1.5 py-0.5 rounded">
                      {session.logCount} logs
                    </span>
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onAttach(session);
                  onOpenChange(false);
                }}
              >
                View
              </Button>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
};
