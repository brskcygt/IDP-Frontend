import { useState } from "react";
import { KeyRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useUpdateUser } from "@/hooks/useUsers";
import { formatUserError, MIN_PASSWORD_LENGTH } from "./userValidation";

type ResetPasswordControlProps = {
  userId: string;
  username: string;
};

/** Inline "reset password" affordance for one row of UserManagementSheet. */
export const ResetPasswordControl = ({ userId, username }: ResetPasswordControlProps) => {
  const { toast } = useToast();
  const updateUser = useUpdateUser();
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState('');

  const close = () => {
    setIsOpen(false);
    setPassword('');
  };

  const handleSubmit = () => {
    if (password.length < MIN_PASSWORD_LENGTH) {
      toast({
        title: 'Password too short',
        description: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
        variant: 'destructive',
      });
      return;
    }
    updateUser.mutate(
      { id: userId, data: { password } },
      {
        onSuccess: () => {
          toast({ title: 'Password reset', description: `New password set for ${username}.` });
          close();
        },
        onError: (err) => toast({ title: 'Password could not be changed', description: formatUserError(err), variant: 'destructive' }),
      },
    );
  };

  if (!isOpen) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setIsOpen(true)}
      >
        <KeyRound className="h-3 w-3" aria-hidden="true" />
        Reset password
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative">
        <Input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={`Min. ${MIN_PASSWORD_LENGTH} characters`}
          minLength={MIN_PASSWORD_LENGTH}
          className="h-7 w-48 border-line-strong bg-surface pr-12 text-xs"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
            if (e.key === 'Escape') close();
          }}
        />
        <span
          className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[9px] ${
            password.length >= MIN_PASSWORD_LENGTH ? 'text-status-success' : 'text-faint'
          }`}
        >
          {password.length}/{MIN_PASSWORD_LENGTH}
        </span>
      </div>
      <Button
        type="button"
        size="sm"
        className="h-7 px-2 text-xs"
        disabled={updateUser.isPending || password.length < MIN_PASSWORD_LENGTH}
        onClick={handleSubmit}
      >
        Set
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground"
        onClick={close}
        aria-label="Cancel password reset"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
};
