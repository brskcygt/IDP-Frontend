import { Square } from "lucide-react";
import { SheetTitle } from "@/components/ui/sheet";
import type { Project } from "@/hooks/useProjects";
import { formatDuration } from "@/lib/format";
import { providerClass } from "@/lib/projectMeta";
import { MetaChip } from "./MetaChip";
import { cn } from "@/lib/utils";

type TerminalStreamHeaderProps = {
  project: Project | null;
  deploymentId: string | null;
  elapsedMs: number;
  isActive: boolean;
  accentClass: string;
  onAbort: () => void;
};

export const TerminalStreamHeader = ({
  project,
  deploymentId,
  elapsedMs,
  isActive,
  accentClass,
  onAbort,
}: TerminalStreamHeaderProps) => (
  <div className="flex h-[58px] shrink-0 items-center justify-between border-b border-line bg-bar px-5">
    <div className="flex min-w-0 items-center gap-3.5">
      <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", accentClass, isActive && "animate-pulse")} />
      <SheetTitle className="truncate text-[15px] font-bold tracking-tight">
        {project?.name ?? "Deployment stream"}
      </SheetTitle>
      {project && (
        <>
          <MetaChip className="text-muted-foreground">{project.tenant}</MetaChip>
          <MetaChip className={providerClass(project.provider)}>{project.provider}</MetaChip>
        </>
      )}
      {deploymentId && <span className="truncate font-mono text-[11px] text-faint">run {deploymentId}</span>}
    </div>

    <div className="flex shrink-0 items-center gap-3">
      <div className="text-right">
        <p className="tabular font-mono text-[17px] font-medium leading-none">{formatDuration(elapsedMs)}</p>
        <p className="mt-0.5 font-mono text-[9.5px] tracking-[0.1em] text-dim">ELAPSED</p>
      </div>
      {isActive && (
        <button
          type="button"
          onClick={onAbort}
          className="inline-flex h-[30px] items-center gap-1.5 rounded-md border border-status-fail/40 bg-status-fail/[0.07] px-3.5 text-xs font-semibold text-status-fail transition-colors hover:bg-status-fail/15"
        >
          <Square className="h-3 w-3" aria-hidden="true" />
          Abort deployment
        </button>
      )}
    </div>
  </div>
);
