import { useMutation } from "@tanstack/react-query";
import { PlugZap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTransport } from "@/services/transport";
import { ConnectionCheckList } from "@/components/project/settings/ConnectionCheckList";
import type { ConnectionTestResult } from "@/services/transport/types";

interface ConnectionTestPanelProps {
  projectId: string;
}

/**
 * T-73: "Test Connection" — lets an operator verify a project's deploy
 * target (Jenkins/Server-SSH/Server-WinRM/PMP vault) is reachable and its
 * credentials are valid, WITHOUT running a deploy first.
 *
 * Tests the project's currently SAVED settings (`POST /api/projects/:id/
 * test-connection` reads the persisted config) — unsaved edits in this
 * modal aren't included until "Save Settings" is clicked first.
 */
export const ConnectionTestPanel = ({ projectId }: ConnectionTestPanelProps) => {
  const { mutate, data, error, isPending } = useMutation<ConnectionTestResult, Error>({
    mutationFn: () => getTransport().projects.testConnection(projectId),
  });

  return (
    <div className="border-t border-border/50 pt-4 mt-4 space-y-3">
      <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Connection Test
      </h5>

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => mutate()}
        className="w-full justify-start"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <PlugZap className="h-4 w-4 mr-2" />
        )}
        {isPending ? "Testing…" : "Test Connection"}
      </Button>

      <p className="text-[10px] text-muted-foreground/80">
        Tests the currently saved settings — save your changes first if you just edited them.
      </p>

      {error && (
        <p className="text-xs text-status-fail">{error.message}</p>
      )}

      {data && <ConnectionCheckList checks={data.checks} />}
    </div>
  );
};
