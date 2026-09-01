import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";
import { useSession } from "@/hooks/useSession";
import { can } from "@/lib/permissions";

interface DangerZoneProps {
  projectName: string;
  isDeleting: boolean;
  onConfirmDelete: () => void;
}

/**
 * Project deletion, gated behind a type-to-confirm dialog.
 *
 * T-52 / SEC-09: renders nothing for a session without `project:delete` —
 * UI-level convenience only, the backend independently rejects the
 * DELETE request itself regardless of what this component shows.
 */
export const DangerZone = ({ projectName, isDeleting, onConfirmDelete }: DangerZoneProps) => {
  const { data: session } = useSession();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  if (!can(session?.role, 'project:delete')) return null;

  const isConfirmed = confirmText === projectName;

  const handleOpenChange = (open: boolean) => {
    setIsConfirmOpen(open);
    if (!open) setConfirmText('');
  };

  return (
    <div className="border-t border-border/50 pt-4 mt-4">
      <h5 className="text-xs font-semibold text-red-500/80 uppercase tracking-wider mb-3">Danger Zone</h5>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isDeleting}
        onClick={() => setIsConfirmOpen(true)}
        className="w-full justify-start text-red-500 hover:text-red-400 hover:bg-red-950/30 border-red-900/30"
      >
        <Trash2 className="h-4 w-4 mr-2" />
        {isDeleting ? 'Deleting...' : 'Delete Project'}
      </Button>

      <Dialog open={isConfirmOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-500">Delete Project</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete{' '}
              <span className="font-semibold text-foreground">{projectName}</span> and all of its
              deployment configuration.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Type <span className="font-semibold text-foreground">{projectName}</span> to confirm
            </Label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={projectName}
              className="bg-accent/50 border-border/50"
              autoComplete="off"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!isConfirmed || isDeleting}
              onClick={onConfirmDelete}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {isDeleting ? 'Deleting...' : 'Delete Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
