import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useVpnSessions } from "@/hooks/useVpnSessions";
import { useClearVpnSession } from "@/hooks/useProjects";
import { Shield, Clock, Trash2, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

type VpnSessionsSheetProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export const VpnSessionsSheet = ({ isOpen, onOpenChange }: VpnSessionsSheetProps) => {
  const { data: sessions, isLoading } = useVpnSessions();
  const { mutate: clearSession } = useClearVpnSession();
  const { toast } = useToast();

  const getRemainingTime = (expiresAt: number) => {
    const diff = expiresAt - Date.now();
    if (diff <= 0) return 'Expired';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto border-l border-border/50 bg-background/95 backdrop-blur-md">
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Active VPN Sessions
          </SheetTitle>
          <SheetDescription>
            Cached VPN cookies allowing passwordless access.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading sessions...</div>
          ) : !sessions || sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-border/50 rounded-xl bg-accent/20">
              <ShieldAlert className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm font-medium text-foreground">No active sessions</p>
              <p className="text-xs text-muted-foreground mt-1">There are currently no cached VPN connections.</p>
            </div>
          ) : (
            sessions.map((session) => (
              <div key={`${session.projectId}_${session.provider}`} className="bg-accent/30 rounded-lg p-4 border border-border/50 flex flex-col gap-3 group">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-medium text-sm">
                    <Shield className="h-4 w-4 text-emerald-500" />
                    {session.projectName}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => {
                      clearSession(session.projectId, {
                        onSuccess: () => toast({ title: 'Session Cleared', description: `VPN session for ${session.projectName} has been cleared.` }),
                        onError: (err) => toast({ title: 'Error', description: err.message, variant: 'destructive' })
                      });
                    }}
                    title="Clear Session"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground bg-background/50 rounded-md p-2">
                  <div className="flex flex-col gap-1">
                    <span className="uppercase text-[10px] tracking-wider font-semibold">Provider</span>
                    <span className="text-foreground">{session.provider}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="uppercase text-[10px] tracking-wider font-semibold">Expires In</span>
                    <span className="flex items-center gap-1 text-foreground">
                      <Clock className="h-3 w-3" />
                      {getRemainingTime(session.expiresAt)}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
