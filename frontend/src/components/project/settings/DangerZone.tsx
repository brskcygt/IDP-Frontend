import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2 } from "lucide-react";
import { useSession } from "@/hooks/useSession";
import { can } from "@/lib/permissions";
import { ConfirmActionDialog } from "@/components/artifacts/ConfirmActionDialog";

interface DangerZoneProps {
  projectName: string;
  isDeleting: boolean;
  onConfirmDelete: () => void;
}

/**
 * Project deletion, gated behind the same type-to-confirm dialog as a Canlı
 * install.
 *
 * T-52 / SEC-09: renders nothing for a session without `project:delete` —
 * UI-level convenience only, the backend independently rejects the
 * DELETE request itself regardless of what this component shows.
 */
export const DangerZone = ({ projectName, isDeleting, onConfirmDelete }: DangerZoneProps) => {
  const { data: session } = useSession();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  if (!can(session?.role, 'project:delete')) return null;

  return (
    <section className="mt-6 rounded-md border border-destructive/30 p-4" aria-labelledby="danger-zone-title">
      <h5 id="danger-zone-title" className="text-sm font-semibold text-destructive">Projeyi sil</h5>
      <p className="mt-1 text-xs text-muted-foreground">
        Proje, ayarları ve müşteri tanımları kalıcı olarak silinir. Geri alınamaz.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isDeleting}
        onClick={() => setIsConfirmOpen(true)}
        className="mt-3 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        Projeyi sil…
      </Button>

      <ConfirmActionDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title={`${projectName} silinsin mi?`}
        description="Proje, dağıtım ayarları ve müşteri tanımları kalıcı olarak silinir. Bu işlem geri alınamaz."
        confirmLabel="Projeyi sil"
        destructive
        typedConfirmation={projectName}
        typedConfirmationLabel="Proje adı"
        pending={isDeleting}
        onConfirm={onConfirmDelete}
      />
    </section>
  );
};
