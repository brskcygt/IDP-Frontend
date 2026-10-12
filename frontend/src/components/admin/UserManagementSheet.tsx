import { useState } from "react";
import { Plus, ShieldCheck, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/useSession";
import { useUsers } from "@/hooks/useUsers";
import { can } from "@/lib/permissions";
import { CreateUserForm } from "./CreateUserForm";
import { UserList } from "./UserList";

type UserManagementSheetProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Admin-only user management panel (T-52 / SEC-09): list users, change
 * roles, reset passwords, create/delete accounts. Opened from the rail's
 * Yönetim → Kullanıcılar, which itself only renders for an admin session —
 * this component re-checks independently so a session downgrade mid-use
 * (e.g. another admin just demoted this one) doesn't leave it usable.
 *
 * UI-level gating only: every mutation still goes through the backend's
 * own `requirePermission('user:manage')` check on each endpoint.
 */
export const UserManagementSheet = ({ isOpen, onOpenChange }: UserManagementSheetProps) => {
  const { data: session } = useSession();
  const isAdmin = can(session?.role, 'user:manage');
  const { data: users, isLoading, isError, refetch, isFetching } = useUsers(isOpen && isAdmin);
  const [isCreating, setIsCreating] = useState(false);

  if (!isAdmin) return null;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l-line-strong bg-background p-0 sm:max-w-[440px]"
      >
        <div className="shrink-0 border-b border-line-strong bg-bar px-5 py-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2.5 text-[15px] font-bold tracking-tight">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
              Kullanıcılar
            </SheetTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 border-line-strong bg-surface px-2 text-xs"
              onClick={() => setIsCreating((v) => !v)}
            >
              {isCreating ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
              {isCreating ? 'Vazgeç' : 'Kullanıcı ekle'}
            </Button>
          </div>
          <SheetDescription className="mt-1 text-xs text-muted-foreground">
            Yönetici her şeyi yönetir; Dağıtımcı derler, kurar ve durdurur; İzleyici yalnız görür.
          </SheetDescription>
        </div>

        {isCreating && <CreateUserForm onCreated={() => setIsCreating(false)} />}

        <div className="min-h-0 flex-grow overflow-y-auto">
          {isError ? (
            <div className="space-y-2 px-5 py-6">
              <p className="text-sm text-status-fail">Kullanıcılar yüklenemedi.</p>
              <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>Tekrar dene</Button>
            </div>
          ) : isLoading ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">Kullanıcılar yükleniyor…</p>
          ) : !users || users.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">Henüz kullanıcı yok.</p>
          ) : (
            <UserList users={users} currentUsername={session?.username} />
          )}
        </div>

        <div className="tabular flex h-[34px] shrink-0 items-center justify-between border-t border-line-strong bg-bar px-5 font-mono text-[10.5px] text-dim">
          <span>{users?.length ?? 0} kullanıcı</span>
        </div>
      </SheetContent>
    </Sheet>
  );
};
