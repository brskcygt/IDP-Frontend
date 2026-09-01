import { Trash2, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useClearVpnSession, useForceDisconnectVpn } from "@/hooks/useProjects";
import { useToast } from "@/hooks/use-toast";

interface VpnActionsProps {
  projectId: string;
}

/** Session-management actions for an active VPN connection. */
export const VpnActions = ({ projectId }: VpnActionsProps) => {
  const { mutate: clearSession, isPending: isClearing } = useClearVpnSession();
  const { mutate: forceDisconnect, isPending: isDisconnecting } = useForceDisconnectVpn();
  const { toast } = useToast();

  return (
    <div className="border-t border-border/50 pt-4 mt-4">
      <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">VPN Actions</h5>
      <div className="flex flex-col gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isClearing}
          onClick={() => {
            clearSession(projectId, {
              onSuccess: () => toast({ title: 'Cache Cleared', description: 'VPN session cookie has been removed.' }),
              onError: (err) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
            });
          }}
          className="w-full justify-start text-amber-500 hover:text-amber-400 hover:bg-amber-950/30 border-amber-900/30"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          {isClearing ? 'Clearing...' : 'Clear Cached Session'}
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isDisconnecting}
          onClick={() => {
            forceDisconnect(undefined, {
              onSuccess: () => toast({ title: 'Force Disconnected', description: 'All background VPN processes have been terminated.' }),
              onError: (err) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
            });
          }}
          className="w-full justify-start text-red-500 hover:text-red-400 hover:bg-red-950/30 border-red-900/30"
        >
          <PowerOff className="h-4 w-4 mr-2" />
          {isDisconnecting ? 'Disconnecting...' : 'Force Disconnect VPN'}
        </Button>
      </div>
    </div>
  );
};
