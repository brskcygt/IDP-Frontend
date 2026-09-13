import { useState } from "react";
import { KeyRound, Plus, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSession } from "@/hooks/useSession";
import { can } from "@/lib/permissions";
import { UserManagementSheet } from "@/components/admin/UserManagementSheet";
import { KnownHostKeysSheet } from "@/components/admin/KnownHostKeysSheet";

type TopBarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  onCreateProject: () => void;
};

export const TopBar = ({
  search,
  onSearchChange,
  onCreateProject,
}: TopBarProps) => {
  const { data: session } = useSession();
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
  const [isHostKeysOpen, setIsHostKeysOpen] = useState(false);
  const isAdmin = can(session?.role, 'user:manage');
  const canCreateProject = can(session?.role, 'project:write');
  const canManageHostKeys = can(session?.role, 'vpn:manage');

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-bar px-5">
      <div className="flex items-center gap-2.5">
        <span className="font-mono text-xs tracking-[0.04em] text-muted-foreground">
          INTERNAL DEVELOPER PLATFORM
        </span>
        <span aria-hidden="true" className="text-faint">/</span>
        <h1 className="text-[13px] font-semibold">Projects</h1>
      </div>

      <div className="flex items-center gap-2.5">
        <div className="relative w-[260px]">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dim"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Filter projects"
            aria-label="Filter projects"
            className="h-[30px] rounded-md border-line-strong bg-surface pl-8 text-xs md:text-xs"
          />
        </div>

        {canCreateProject && (
          <Button
            variant="outline"
            onClick={onCreateProject}
            className="h-[30px] gap-1.5 border-line-strong bg-surface px-3 text-xs"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            New
          </Button>
        )}

        {session && (
          <div className="flex items-center gap-2 border-l border-line pl-2.5">
            <span className="text-xs font-medium text-foreground">{session.username}</span>
            <span className="rounded-sm border border-line-strong bg-accent px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.09em] text-dim">
              {session.role}
            </span>
            {canManageHostKeys && (
              <Button
                variant="ghost"
                size="icon"
                title="Known host keys"
                aria-label="Known host keys"
                className="h-[30px] w-[30px] text-dim hover:bg-accent hover:text-foreground"
                onClick={() => setIsHostKeysOpen(true)}
              >
                <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="ghost"
                size="icon"
                title="Manage users"
                aria-label="Manage users"
                className="h-[30px] w-[30px] text-dim hover:bg-accent hover:text-foreground"
                onClick={() => setIsUserManagementOpen(true)}
              >
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            )}
          </div>
        )}
      </div>

      {isAdmin && (
        <UserManagementSheet isOpen={isUserManagementOpen} onOpenChange={setIsUserManagementOpen} />
      )}
      {canManageHostKeys && (
        <KnownHostKeysSheet isOpen={isHostKeysOpen} onOpenChange={setIsHostKeysOpen} />
      )}
    </header>
  );
};
