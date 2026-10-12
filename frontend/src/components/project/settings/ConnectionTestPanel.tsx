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
 * T-73: "Bağlantıyı test et" — lets an operator verify a project's deploy
 * target (Jenkins/Server-SSH/Server-WinRM/PMP vault) is reachable and its
 * credentials are valid, WITHOUT running a deploy first.
 *
 * Tests the project's currently SAVED settings (`POST /api/projects/:id/
 * test-connection` reads the persisted config) — unsaved edits in this
 * modal aren't included until "Kaydet" is clicked first.
 */
export const ConnectionTestPanel = ({ projectId }: ConnectionTestPanelProps) => {
  const { mutate, data, error, isPending } = useMutation<ConnectionTestResult, Error>({
    mutationFn: () => getTransport().projects.testConnection(projectId),
  });

  return (
    <section className="mt-6 space-y-3 rounded-md border border-border/60 p-4" aria-labelledby="connection-test-title">
      <div>
        <h5 id="connection-test-title" className="text-sm font-semibold">Bağlantı testi</h5>
        <p className="mt-1 text-xs text-muted-foreground">
          Kayıtlı ayarlarla hedefe ulaşılıp ulaşılamadığını ve kimlik bilgilerini dağıtım yapmadan dener.
          Değişiklik yaptıysanız önce kaydedin.
        </p>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => mutate()}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <PlugZap className="h-4 w-4" />
        )}
        {isPending ? "Deneniyor…" : "Bağlantıyı test et"}
      </Button>

      {error && (
        <p className="text-xs text-status-fail">{error.message}</p>
      )}

      {data && <ConnectionCheckList checks={data.checks} />}
    </section>
  );
};
