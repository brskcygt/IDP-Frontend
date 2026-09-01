import { LayoutGrid, Activity, ShieldCheck, LogOut, Terminal, PackageOpen, PackagePlus, FileUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { ModeToggle } from "@/components/mode-toggle";

type AppRailProps = {
  onOpenActivityLog: () => void;
  onOpenVpnSessions: () => void;
  onOpenTransfer: () => void;
  onOpenAgentBuilder: () => void;
  onOpenFileTransfer: () => void;
  onLogout?: () => void;
  vpnActive: boolean;
  canManageProjects: boolean;
  canManageVpn: boolean;
};

const ITEM_CLASS =
  "flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Persistent icon rail. Only destinations that exist are listed — the rail is
 * navigation, not a placeholder for screens the platform does not have yet.
 */
export const AppRail = ({
  onOpenActivityLog,
  onOpenVpnSessions,
  onOpenTransfer,
  onOpenAgentBuilder,
  onOpenFileTransfer,
  onLogout,
  vpnActive,
  canManageProjects,
  canManageVpn,
}: AppRailProps) => (
  <nav
    aria-label="Main navigation"
    className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-line bg-bar py-3"
  >
    <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
      <Terminal className="h-[18px] w-[18px]" aria-hidden="true" />
      <span className="sr-only">Internal Developer Platform</span>
    </div>

    <button
      type="button"
      aria-current="page"
      title="Projects"
      className={cn(ITEM_CLASS, "bg-accent text-foreground")}
    >
      <LayoutGrid className="h-[18px] w-[18px]" aria-hidden="true" />
      <span className="sr-only">Projects</span>
    </button>

    <button type="button" onClick={onOpenActivityLog} title="Activity log" className={ITEM_CLASS}>
      <Activity className="h-[18px] w-[18px]" aria-hidden="true" />
      <span className="sr-only">Activity log</span>
    </button>

    {canManageProjects && (
      <>
        <button type="button" onClick={onOpenAgentBuilder} title="IDP Agent oluştur" className={ITEM_CLASS}>
          <PackagePlus className="h-[18px] w-[18px]" aria-hidden="true" />
          <span className="sr-only">IDP Agent oluştur</span>
        </button>

        <button type="button" onClick={onOpenFileTransfer} title="Sunucuya dosya gönder" className={ITEM_CLASS}>
          <FileUp className="h-[18px] w-[18px]" aria-hidden="true" />
          <span className="sr-only">Sunucuya dosya gönder</span>
        </button>

        <button type="button" onClick={onOpenTransfer} title="Import / export" className={ITEM_CLASS}>
          <PackageOpen className="h-[18px] w-[18px]" aria-hidden="true" />
          <span className="sr-only">Import / export</span>
        </button>
      </>
    )}

    {canManageVpn && (
      <button
        type="button"
        onClick={onOpenVpnSessions}
        title="VPN sessions"
        className={cn(ITEM_CLASS, vpnActive && "text-status-ok")}
      >
        <ShieldCheck className="h-[18px] w-[18px]" aria-hidden="true" />
        <span className="sr-only">VPN sessions</span>
      </button>
    )}

    <div className="flex-grow" />

    <ModeToggle />

    {onLogout && (
      <button type="button" onClick={onLogout} title="Sign out" className={ITEM_CLASS}>
        <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
        <span className="sr-only">Sign out</span>
      </button>
    )}
  </nav>
);
