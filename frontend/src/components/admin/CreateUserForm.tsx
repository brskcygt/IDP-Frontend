import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCreateUser } from "@/hooks/useUsers";
import { ROLE_LABEL, ROLE_OPTIONS, type Role } from "@/lib/permissions";
import {
  formatUserError,
  isValidUsername,
  MIN_PASSWORD_LENGTH,
  MIN_USERNAME_LENGTH,
} from "./userValidation";

type CreateUserFormProps = {
  onCreated: () => void;
};

/** Inline "new user" form shown at the top of UserManagementSheet. */
export const CreateUserForm = ({ onCreated }: CreateUserFormProps) => {
  const { toast } = useToast();
  const createUser = useCreateUser();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('viewer');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!isValidUsername(username)) {
      toast({
        title: 'Geçersiz kullanıcı adı',
        description: `${MIN_USERNAME_LENGTH}–64 karakter; harf, rakam, nokta, alt çizgi ya da tire kullanın.`,
        variant: 'destructive',
      });
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      toast({
        title: 'Parola çok kısa',
        description: `En az ${MIN_PASSWORD_LENGTH} karakter olmalı.`,
        variant: 'destructive',
      });
      return;
    }

    createUser.mutate(
      { username: username.trim(), password, role },
      {
        onSuccess: (created) => {
          toast({ title: 'Kullanıcı eklendi', description: `${created.username}, ${ROLE_LABEL[created.role]} rolüyle eklendi.` });
          setUsername('');
          setPassword('');
          setRole('viewer');
          onCreated();
        },
        onError: (err) => toast({ title: 'Kullanıcı eklenemedi', description: formatUserError(err), variant: 'destructive' }),
      },
    );
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2.5 border-b border-line-strong bg-bar px-5 py-4">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="create-user-username" className="text-xs">Kullanıcı adı</Label>
          <Input
            id="create-user-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="ad.soyad"
            minLength={MIN_USERNAME_LENGTH}
            maxLength={64}
            pattern="[a-zA-Z0-9._-]+"
            autoComplete="off"
            className="h-8 border-line-strong bg-surface text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="create-user-password" className="text-xs">Parola</Label>
          <div className="relative">
            <Input
              id="create-user-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={`en az ${MIN_PASSWORD_LENGTH} karakter`}
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              className="h-8 border-line-strong bg-surface pr-12 text-xs"
            />
            <span
              className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[9px] ${
                password.length >= MIN_PASSWORD_LENGTH ? 'text-status-success' : 'text-faint'
              }`}
            >
              {password.length}/{MIN_PASSWORD_LENGTH}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor="create-user-role" className="text-xs">Rol</Label>
          <Select value={role} onValueChange={(v) => setRole(v as Role)}>
            <SelectTrigger id="create-user-role" className="h-8 border-line-strong bg-surface text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option} className="text-xs">
                  {ROLE_LABEL[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="submit"
          size="sm"
          className="h-8 px-3 text-xs"
          disabled={createUser.isPending || !isValidUsername(username) || password.length < MIN_PASSWORD_LENGTH}
        >
          {createUser.isPending ? 'Ekleniyor…' : 'Ekle'}
        </Button>
      </div>
    </form>
  );
};
