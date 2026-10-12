import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useDeleteUser } from "@/hooks/useUsers";
import { ConfirmActionDialog } from "@/components/artifacts/ConfirmActionDialog";
import { formatUserError } from "./userValidation";

type DeleteUserControlProps = {
  userId: string;
  username: string;
  /** Disables the control (e.g. the row is the caller's own account, or the sole admin). */
  disabled?: boolean;
  disabledReason?: string;
};

/** "Sil" for one row of UserManagementSheet, confirmed by typing the username. */
export const DeleteUserControl = ({ userId, username, disabled, disabledReason }: DeleteUserControlProps) => {
  const { toast } = useToast();
  const deleteUser = useDeleteUser();
  const [isConfirming, setIsConfirming] = useState(false);

  const handleDelete = () => {
    deleteUser.mutate(userId, {
      onSuccess: () => {
        toast({ title: 'Kullanıcı silindi', description: `${username} artık oturum açamaz.` });
        setIsConfirming(false);
      },
      onError: (err) => toast({ title: 'Kullanıcı silinemedi', description: formatUserError(err), variant: 'destructive' }),
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        aria-label={`${username} kullanıcısını sil`}
        className={disabled
          ? "h-7 gap-1.5 px-2 text-xs text-faint"
          : "h-7 gap-1.5 px-2 text-xs text-status-fail hover:bg-status-fail/10 hover:text-status-fail"}
        onClick={() => setIsConfirming(true)}
      >
        <Trash2 className="h-3 w-3" aria-hidden="true" />
        Sil
      </Button>
      <ConfirmActionDialog
        open={isConfirming}
        onOpenChange={setIsConfirming}
        title={`${username} silinsin mi?`}
        description="Hesap silinir; bu kullanıcı bir daha oturum açamaz. Etkinlik kaydındaki geçmiş işlemleri kalır."
        confirmLabel="Kullanıcıyı sil"
        destructive
        typedConfirmation={username}
        typedConfirmationLabel="Kullanıcı adı"
        pending={deleteUser.isPending}
        onConfirm={handleDelete}
      />
    </>
  );
};
