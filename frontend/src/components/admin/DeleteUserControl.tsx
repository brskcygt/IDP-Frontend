import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useDeleteUser } from "@/hooks/useUsers";

type DeleteUserControlProps = {
  userId: string;
  username: string;
  /** Disables the control (e.g. the row is the caller's own account, or the sole admin). */
  disabled?: boolean;
  disabledReason?: string;
};

/** Two-click inline delete confirmation for one row of UserManagementSheet. */
export const DeleteUserControl = ({ userId, username, disabled, disabledReason }: DeleteUserControlProps) => {
  const { toast } = useToast();
  const deleteUser = useDeleteUser();
  const [isConfirming, setIsConfirming] = useState(false);

  const handleDelete = () => {
    deleteUser.mutate(userId, {
      onSuccess: () => toast({ title: 'User deleted', description: `${username} was removed.` }),
      onError: (err) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
      onSettled: () => setIsConfirming(false),
    });
  };

  if (disabled) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled
        title={disabledReason}
        className="h-7 gap-1.5 px-2 text-xs text-faint"
      >
        <Trash2 className="h-3 w-3" aria-hidden="true" />
        Delete
      </Button>
    );
  }

  if (isConfirming) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-status-fail">Delete {username}?</span>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={deleteUser.isPending}
          onClick={handleDelete}
        >
          Confirm
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setIsConfirming(false)}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 px-2 text-xs text-status-fail hover:bg-status-fail/10 hover:text-status-fail"
      onClick={() => setIsConfirming(true)}
    >
      <Trash2 className="h-3 w-3" aria-hidden="true" />
      Delete
    </Button>
  );
};
