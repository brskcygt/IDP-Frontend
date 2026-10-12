import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useDeploymentSessions, type DeploymentSession } from "@/hooks/useDeploymentSessions";
import { useProjects } from "@/hooks/useProjects";
import { History } from "lucide-react";
import { deployStatusClass, deployStatusIcon, deployStatusLabel } from "@/lib/deploymentStatus";
import { formatDateTime, formatRelativeTimeTr } from "@/lib/format";
import { cn } from "@/lib/utils";

type DeploymentsSheetProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onAttach: (session: DeploymentSession) => void;
};

const LIVE = new Set(["pending", "connecting", "running"]);

/** Live and recent runs across every project; opening one attaches the log stream. */
export const DeploymentsSheet = ({ isOpen, onOpenChange, onAttach }: DeploymentsSheetProps) => {
  const { data: sessions, isLoading, isError, refetch, isFetching } = useDeploymentSessions();
  const { data: projects } = useProjects();

  // A run outlives its project when the project is deleted; the id is all that is left.
  const projectName = (projectId: string) =>
    projects?.find((project) => project.id === projectId)?.name ?? `Silinmiş proje (${projectId.slice(0, 8)})`;

  const sorted = [...(sessions ?? [])].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent resizeKey="deployments" side="right" className="flex w-full flex-col gap-0 border-l-line-strong bg-background p-0 sm:max-w-[520px]">
        <div className="shrink-0 border-b border-line-strong bg-bar px-5 py-4 pr-12">
          <SheetTitle className="flex items-center gap-2.5 text-[15px] font-bold tracking-tight">
            <History className="h-4 w-4 text-primary" aria-hidden="true" />
            Dağıtım geçmişi
          </SheetTitle>
          <SheetDescription className="mt-1 text-xs text-muted-foreground">
            Süren ve son dağıtımlar. Birini açınca log akışı gelir.
          </SheetDescription>
        </div>

        <div className="min-h-0 flex-grow overflow-y-auto">
          {isError ? (
            <div className="space-y-2 px-5 py-6">
              <p className="text-sm text-status-fail">Dağıtımlar yüklenemedi.</p>
              <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>Tekrar dene</Button>
            </div>
          ) : isLoading ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">Dağıtımlar yükleniyor…</p>
          ) : sorted.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">Süren ya da yakın zamanda biten dağıtım yok.</p>
          ) : (
            <ul>
              {sorted.map((session) => {
                const Icon = deployStatusIcon(session.status);
                return (
                  <li key={session.id} className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold">{projectName(session.projectId)}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-dim">
                        <span className={cn("flex items-center gap-1 font-medium", deployStatusClass(session.status))}>
                          <Icon className={cn("h-3 w-3", LIVE.has(session.status) && "animate-spin")} aria-hidden="true" />
                          {deployStatusLabel(session.status)}
                        </span>
                        <span title={formatDateTime(session.startedAt)}>{formatRelativeTimeTr(session.startedAt)}</span>
                        {typeof session.logCount === "number" && <span>{session.logCount} log satırı</span>}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`${projectName(session.projectId)} dağıtımının logunu aç`}
                      onClick={() => {
                        onAttach(session);
                        onOpenChange(false);
                      }}
                    >
                      Aç
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
