import { useState, type FocusEvent, type ReactNode } from "react";
import {
  Activity,
  BookOpenText,
  History,
  KeyRound,
  LayoutGrid,
  LifeBuoy,
  LogOut,
  Network,
  PackageOpen,
  PackagePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Server,
  Settings2,
  Terminal,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ModeToggle } from "@/components/mode-toggle";

export type AppRailItem =
  | "projects"
  | "activity"
  | "guide"
  | "troubleshooting"
  | "agents"
  | "agent-builder"
  | "allowlist"
  | "host-keys"
  | "users"
  | "transfer"
  | "settings"
  | "deployments";

/** What the signed-in role may open in the Yönetim section; each flag mirrors the permission its sheet's endpoints need. */
export type AppRailAdminAccess = {
  agents: boolean;
  hostKeys: boolean;
  users: boolean;
  transfer: boolean;
  serverSettings: boolean;
};

type AppRailProps = {
  onOpen: (item: Exclude<AppRailItem, "projects">) => void;
  onLogout?: () => void;
  admin: AppRailAdminAccess;
  activeItem?: AppRailItem;
};

const COLLAPSED_STORAGE_KEY = "idp-rail-collapsed";

const readCollapsed = (): boolean => {
  try {
    return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

type RailButtonProps = {
  icon: LucideIcon;
  label: string;
  expanded: boolean;
  active?: boolean;
  status?: ReactNode;
  onClick?: () => void;
};

const RailButton = ({
  icon: Icon,
  label,
  expanded,
  active = false,
  status,
  onClick,
}: RailButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-current={active ? "page" : undefined}
    aria-label={label}
    title={expanded ? undefined : label}
    className={cn(
      "group relative flex h-10 w-full shrink-0 items-center rounded-md text-sm font-medium text-muted-foreground transition-colors",
      "hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
      active && "bg-accent text-foreground before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary",
    )}
  >
    <span className="flex h-10 w-14 shrink-0 items-center justify-center">
      <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
    </span>
    <span
      aria-hidden={!expanded}
      className={cn(
        "min-w-0 flex-1 truncate pr-2 text-left transition-[opacity,transform] duration-150 motion-reduce:transition-none",
        expanded ? "translate-x-0 opacity-100" : "-translate-x-1 opacity-0",
      )}
    >
      {label}
    </span>
    {expanded && status}
  </button>
);

const RailSectionLabel = ({ label, expanded }: { label: string; expanded: boolean }) => (
  <div className="relative my-1 h-5 shrink-0" aria-hidden="true">
    <span
      className={cn(
        "absolute inset-x-4 top-1/2 h-px bg-line transition-opacity duration-150 motion-reduce:transition-none",
        expanded ? "opacity-0" : "opacity-100",
      )}
    />
    <span
      className={cn(
        "absolute inset-x-4 top-0 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-faint transition-opacity duration-150 motion-reduce:transition-none",
        expanded ? "opacity-100" : "opacity-0",
      )}
    >
      {label}
    </span>
  </div>
);

/**
 * Persistent navigation rail. Open with labels by default; the brand button
 * collapses it to icons and the choice is remembered. While collapsed it
 * still expands as an overlay on pointer hover or keyboard focus, so labels
 * stay discoverable without shifting dashboard content.
 */
export const AppRail = ({ onOpen, onLogout, admin, activeItem = "projects" }: AppRailProps) => {
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const expanded = !collapsed || hovered || focusWithin;
  const overlaying = collapsed && expanded;
  const showAdmin = Object.values(admin).some(Boolean);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
    } catch {
      // Private mode or storage full: the choice simply lasts for this session.
    }
  };

  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocusWithin(false);
  };

  const item = (id: Exclude<AppRailItem, "projects">, icon: LucideIcon, label: string) => (
    <RailButton icon={icon} label={label} expanded={expanded} active={activeItem === id} onClick={() => onOpen(id)} />
  );

  return (
    <div
      className={cn(
        "relative z-40 shrink-0 transition-[width] duration-200 ease-out motion-reduce:transition-none",
        collapsed ? "w-14" : "w-56",
      )}
    >
      <nav
        aria-label="Ana gezinme"
        data-expanded={expanded ? "true" : "false"}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocusCapture={() => setFocusWithin(true)}
        onBlurCapture={handleBlur}
        className={cn(
          "absolute inset-y-0 left-0 flex w-56 flex-col gap-1 overflow-y-auto overflow-x-hidden border-r border-line bg-bar py-3",
          "transition-[clip-path,box-shadow] duration-200 ease-out motion-reduce:transition-none",
          expanded ? "[clip-path:inset(0_0_0_0)]" : "[clip-path:inset(0_10.5rem_0_0)]",
          overlaying && "shadow-[14px_0_28px_-20px_hsl(var(--foreground)/0.45)]",
        )}
      >
        <button
          type="button"
          onClick={(event) => {
            toggleCollapsed();
            // Collapsing with the mouse should not leave the overlay open on focus.
            if (!collapsed && event.detail > 0) event.currentTarget.blur();
          }}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Menüyü genişlet" : "Menüyü daralt"}
          title={collapsed ? "Menüyü genişlet" : "Menüyü daralt"}
          className="mb-3 flex h-10 w-full shrink-0 items-center rounded-md text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <span className="flex h-10 w-14 shrink-0 items-center justify-center">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Terminal className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
          </span>
          <span className="min-w-0 flex-1 truncate">IDP Console</span>
          {collapsed ? (
            <PanelLeftOpen className="mr-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="mr-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          )}
        </button>

        <RailSectionLabel label="Çalışma alanı" expanded={expanded} />
        <RailButton icon={LayoutGrid} label="Projeler" expanded={expanded} active={activeItem === "projects"} />
        {item("activity", Activity, "Etkinlik kaydı")}
        {item("deployments", History, "Dağıtım geçmişi")}
        {item("guide", BookOpenText, "Kullanım kılavuzu")}
        {item("troubleshooting", LifeBuoy, "Sorun giderme")}

        {showAdmin && (
          <>
            <RailSectionLabel label="Yönetim" expanded={expanded} />
            {admin.agents && item("agents", Server, "Agent'lar")}
            {admin.agents && item("agent-builder", PackagePlus, "Agent oluştur")}
            {admin.agents && item("allowlist", Network, "Agent erişim listesi")}
            {admin.hostKeys && item("host-keys", KeyRound, "Bilinen host anahtarları")}
            {admin.users && item("users", Users, "Kullanıcılar")}
            {admin.transfer && item("transfer", PackageOpen, "İçe/dışa aktar")}
            {admin.serverSettings && item("settings", Settings2, "Sunucu ayarları")}
          </>
        )}

        <div className="flex-grow" />
        <ModeToggle expanded={expanded} />

        {onLogout && (
          <RailButton icon={LogOut} label="Çıkış yap" expanded={expanded} onClick={onLogout} />
        )}
      </nav>
    </div>
  );
};
