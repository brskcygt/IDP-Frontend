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
import { formatRelativeTimeTr } from "@/lib/format";
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
        onSuccess: () => toast({ title: 'Rol değişti', description: `${user.username} artık ${ROLE_LABEL[role as keyof typeof ROLE_LABEL]}.` }),
        onError: (err) => toast({ title: 'Rol değiştirilemedi', description: formatUserError(err), variant: 'destructive' }),
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
              <span className="rounded-sm bg-accent px-1.5 py-0.5 text-[10px] text-dim">
                siz
              </span>
            )}
          </div>
          <p className="mt-0.5 font-mono text-[10px] text-faint">
            eklendi: {formatRelativeTimeTr(user.createdAt)}
          </p>
        </div>

        <Select value={user.role} onValueChange={handleRoleChange} disabled={roleLocked}>
          <SelectTrigger
            className="h-7 w-[120px] border-line-strong bg-surface text-xs"
            aria-label={`${user.username} rolü`}
            title={roleLocked ? (isLastAdmin ? "Son yöneticinin rolü değiştirilemez." : "Kendi rolünüzü buradan değiştiremezsiniz.") : undefined}
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
              ? 'Son yönetici silinemez.'
              : 'Kendi hesabınızı buradan silemezsiniz.'
          }
        />
      </div>
    </li>
  );
};
