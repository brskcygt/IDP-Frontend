import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useUpdateUser } from "@/hooks/useUsers";
import type { ManagedUser } from "@/hooks/useUsers";
import { ROLE_LABEL, ROLE_OPTIONS } from "@/lib/permissions";
import { formatRelativeTime } from "@/lib/format";
import { ResetPasswordControl } from "./ResetPasswordControl";
import { DeleteUserControl } from "./DeleteUserControl";
import { formatUserError } from "./userValidation";

type UserRowProps = {
  user: ManagedUser;
  /** Username of the signed-in operator viewing this sheet — can't demote/delete themselves here. */
  currentUsername: string | undefined;
  /** True when `user` is the only admin left — role changes and delete are disabled either way. */
  isLastAdmin: boolean;
};

export const UserRow = ({ user, currentUsername, isLastAdmin }: UserRowProps) => {
  const { toast } = useToast();
  const updateUser = useUpdateUser();
  const isSelf = user.username === currentUsername;
  const roleLocked = isLastAdmin || isSelf;

  const handleRoleChange = (role: string) => {
    if (role === user.role) return;
    updateUser.mutate(
      { id: user.id, data: { role } },
      {
        onSuccess: () => toast({ title: 'Role updated', description: `${user.username} is now ${ROLE_LABEL[role as keyof typeof ROLE_LABEL]}.` }),
        onError: (err) => toast({ title: 'Role could not be updated', description: formatUserError(err), variant: 'destructive' }),
      },
    );
  };

  return (
    <li className="flex flex-col gap-2.5 border-b border-line px-5 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-semibold">{user.username}</span>
            {isSelf && (
              <span className="rounded-sm bg-accent px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.09em] text-dim">
                you
              </span>
            )}
          </div>
          <p className="mt-0.5 font-mono text-[10px] text-faint">
            joined {formatRelativeTime(user.createdAt)}
          </p>
        </div>

        <Select value={user.role} onValueChange={handleRoleChange} disabled={roleLocked}>
          <SelectTrigger
            className="h-7 w-[112px] border-line-strong bg-surface text-xs"
            title={roleLocked ? "Can't change the last admin's or your own role here." : undefined}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((role) => (
              <SelectItem key={role} value={role} className="text-xs">
                {ROLE_LABEL[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between gap-2">
        <ResetPasswordControl userId={user.id} username={user.username} />
        <DeleteUserControl
          userId={user.id}
          username={user.username}
          disabled={roleLocked}
          disabledReason={
            isLastAdmin
              ? 'The last remaining admin cannot be deleted.'
              : "You can't delete your own account here."
          }
        />
      </div>
    </li>
  );
};
