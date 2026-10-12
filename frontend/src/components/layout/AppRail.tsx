import { useState, type FocusEvent, type ReactNode } from "react";
import {
  Activity,
  BookOpenText,
  History,
  LayoutGrid,
  LifeBuoy,
  LogOut,
  PackageOpen,
  PackagePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Server,
  Settings2,
  Terminal,
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
  | "transfer"
  | "settings"
  | "deployments";

type AppRailProps = {
  onOpenActivityLog: () => void;
  onOpenTransfer: () => void;
  onOpenAgents: () => void;
  onOpenAgentBuilder: () => void;
  onOpenGuide: () => void;
  onOpenTroubleshooting: () => void;
  onOpenSettings: () => void;
  onOpenDeployments: () => void;
  onLogout?: () => void;
  canManageProjects: boolean;
  activeItem?: AppRailItem;
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
 * Persistent navigation rail. It expands as an overlay on pointer hover or
 * keyboard focus, so labels become discoverable without shifting dashboard
 * content. The brand control also lets touch/pointer users pin it open.
 */
export const AppRail = ({
  onOpenActivityLog,
  onOpenTransfer,
  onOpenAgents,
  onOpenAgentBuilder,
  onOpenGuide,
  onOpenTroubleshooting,
  onOpenSettings,
  onOpenDeployments,
  onLogout,
  canManageProjects,
  activeItem = "projects",
}: AppRailProps) => {
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [pinned, setPinned] = useState(false);
  const expanded = hovered || focusWithin || pinned;

  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocusWithin(false);
  };

  return (
    <div className="relative z-40 w-14 shrink-0">
      <nav
        aria-label="Ana gezinme"
        data-expanded={expanded ? "true" : "false"}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocusCapture={() => setFocusWithin(true)}
        onBlurCapture={handleBlur}
        className={cn(
          "absolute inset-y-0 left-0 flex w-56 flex-col gap-1 overflow-hidden border-r border-line bg-bar py-3",
          "transition-[clip-path,box-shadow] duration-200 ease-out motion-reduce:transition-none",
          expanded
            ? "[clip-path:inset(0_0_0_0)] shadow-[14px_0_28px_-20px_hsl(var(--foreground)/0.45)]"
            : "[clip-path:inset(0_10.5rem_0_0)]",
        )}
      >
        <button
          type="button"
          onClick={(event) => {
            const shouldUnpin = pinned;
            setPinned(!pinned);
            if (shouldUnpin && event.detail > 0) event.currentTarget.blur();
          }}
          aria-expanded={expanded}
          aria-label={pinned ? "Gezinmeyi serbest bırak" : "Gezinmeyi açık sabitle"}
          title={expanded ? undefined : "Internal Deployment Platform"}
          className="mb-3 flex h-10 w-full shrink-0 items-center rounded-md text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <span className="flex h-10 w-14 shrink-0 items-center justify-center">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Terminal className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
          </span>
          <span className="min-w-0 flex-1 truncate">IDP Console</span>
          {pinned ? (
            <PanelLeftClose className="mr-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          ) : (
            <PanelLeftOpen className="mr-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          )}
        </button>

        <RailSectionLabel label="Çalışma alanı" expanded={expanded} />
        <RailButton icon={LayoutGrid} label="Projeler" expanded={expanded} active={activeItem === "projects"} />
        <RailButton icon={History} label="Dağıtım geçmişi" expanded={expanded} active={activeItem === "deployments"} onClick={onOpenDeployments} />
        <RailButton icon={Activity} label="Etkinlik kaydı" expanded={expanded} active={activeItem === "activity"} onClick={onOpenActivityLog} />
        <RailButton icon={BookOpenText} label="Dağıtım kılavuzu" expanded={expanded} active={activeItem === "guide"} onClick={onOpenGuide} />
        <RailButton icon={LifeBuoy} label="Sorun giderme" expanded={expanded} active={activeItem === "troubleshooting"} onClick={onOpenTroubleshooting} />

        <RailSectionLabel label="Yönetim" expanded={expanded} />
        {canManageProjects && (
          <>
            <RailButton icon={Server} label="Agent'lar" expanded={expanded} active={activeItem === "agents"} onClick={onOpenAgents} />
            <RailButton icon={PackagePlus} label="IDP agent oluştur" expanded={expanded} active={activeItem === "agent-builder"} onClick={onOpenAgentBuilder} />
            <RailButton icon={PackageOpen} label="İçe / dışa aktar" expanded={expanded} active={activeItem === "transfer"} onClick={onOpenTransfer} />
            <RailButton icon={Settings2} label="Sunucu ayarları" expanded={expanded} active={activeItem === "settings"} onClick={onOpenSettings} />
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
