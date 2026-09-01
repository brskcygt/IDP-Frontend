import { Terminal, Square } from "lucide-react";
import type { Project } from "@/hooks/useProjects";
import type { DeploymentStatus } from "@/hooks/useDeploymentLogStream";
import { useSession } from "@/hooks/useSession";
import { formatDuration } from "@/lib/format";
import { providerClass } from "@/lib/projectMeta";
import { DeployProgressBar } from "./DeployProgressBar";
import { MetaChip } from "./MetaChip";
import { LogTail } from "./LogTail";
import { cn } from "@/lib/utils";
import { TerminalActivityIndicator } from "./TerminalActivityIndicator";
import { can } from "@/lib/permissions";

type LiveDeploymentPanelProps = {
  project: Project | null;
  status: DeploymentStatus;
  logs: string[];
  elapsedMs: number;
  onOpenStream: () => void;
  onAbort: () => void;
};

const STATUS_LABEL: Record<DeploymentStatus, string> = {
  idle: "NO ACTIVE DEPLOYMENT",
  connecting: "CONNECTING",
  running: "LIVE DEPLOYMENT",
  succeeded: "LAST DEPLOYMENT — SUCCEEDED",
  failed: "LAST DEPLOYMENT — FAILED",
  aborted: "LAST DEPLOYMENT — ABORTED",
};

const STATUS_TONE: Record<DeploymentStatus, string> = {
  idle: "text-dim",
  connecting: "text-status-run",
  running: "text-status-run",
  succeeded: "text-status-ok",
  failed: "text-status-fail",
  aborted: "text-status-warn",
};

const DOT_TONE: Record<DeploymentStatus, string> = {
  idle: "bg-faint",
  connecting: "bg-status-run",
  running: "bg-status-run",
  succeeded: "bg-status-ok",
  failed: "bg-status-fail",
  aborted: "bg-status-warn",
};

/**
 * The run in flight, given the top of the console.
 *
 * Falls back to a plain idle state rather than a skeleton pretending to be a
 * deployment — most of the time nothing is deploying, and that is fine.
 */
export const LiveDeploymentPanel = ({
  project,
  status,
  logs,
  elapsedMs,
  onOpenStream,
  onAbort,
}: LiveDeploymentPanelProps) => {
  const { data: session } = useSession();
  const isActive = status === "running" || status === "connecting";
  const canAbort = can(session?.role, 'deploy:abort');

  if (!project || status === "idle") {
    return (
      <section
        aria-label="Live deployment"
        className="flex min-w-0 flex-grow flex-col justify-center border-r border-line px-5 py-4"
      >
        <p className="mb-2 flex items-center gap-2 font-mono text-[10px] tracking-[0.14em] text-dim">
          <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-faint" />
          {STATUS_LABEL.idle}
        </p>
        <p className="max-w-md text-sm text-muted-foreground">
          Deploy a project from the table and its output streams here.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="Live deployment"
      aria-live="polite"
      className="relative flex min-w-0 flex-grow flex-col overflow-hidden border-r border-line px-5 py-4"
    >
      {isActive && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-16 -top-36 h-72 w-[520px] rounded-full bg-status-run/[0.09] blur-3xl"
        />
      )}

      <div className="relative flex items-start justify-between">
        <div className="min-w-0">
          <p
            className={cn(
              "mb-2 flex items-center gap-2 font-mono text-[10px] tracking-[0.14em]",
              STATUS_TONE[status],
            )}
          >
            <span
              aria-hidden="true"
              className={cn("h-[7px] w-[7px] rounded-full", DOT_TONE[status], isActive && "animate-pulse")}
            />
            {STATUS_LABEL[status]}
          </p>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="truncate text-xl font-bold tracking-tight">{project.name}</h2>
            <MetaChip className="text-muted-foreground">{project.tenant}</MetaChip>
            <MetaChip className={providerClass(project.provider)}>{project.provider}</MetaChip>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="tabular font-mono text-[22px] font-medium leading-none">
            {formatDuration(elapsedMs)}
          </p>
          <p className="mt-0.5 font-mono text-[10px] tracking-[0.08em] text-dim">ELAPSED</p>
        </div>
      </div>

      <DeployProgressBar status={status} className="relative my-3" />

      <div className="relative mb-3 flex items-center justify-between font-mono text-[11px] text-muted-foreground">
        <span>{logs.length} lines streamed</span>
        {session?.username && <span className="text-faint">triggered by {session.username}</span>}
      </div>

      {isActive && <div className="relative mb-2"><TerminalActivityIndicator elapsedMs={elapsedMs} compact /></div>}

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <LogTail logs={logs} />
      </div>

      <div className="relative mt-3 flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onOpenStream}
          className="inline-flex h-[30px] items-center gap-1.5 rounded-md bg-foreground px-3.5 text-xs font-semibold text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
          Open stream
        </button>
        {isActive && canAbort && (
          <button
            type="button"
            onClick={onAbort}
            className="inline-flex h-[30px] items-center gap-1.5 rounded-md border border-status-fail/40 bg-status-fail/[0.07] px-3.5 text-xs font-semibold text-status-fail transition-colors hover:bg-status-fail/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Square className="h-3 w-3" aria-hidden="true" />
            Abort
          </button>
        )}
      </div>
    </section>
  );
};
