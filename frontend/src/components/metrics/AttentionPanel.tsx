import { CheckCircle2 } from "lucide-react";
import type { Project } from "@/hooks/useProjects";
import { useVpnSessions } from "@/hooks/useVpnSessions";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type AttentionPanelProps = {
  failed: Project[];
  onRetry?: (project: Project) => void;
};

const VISIBLE_LIMIT = 3;

/** Failed deployments first, VPN reachability underneath — both real state. */
export const AttentionPanel = ({ failed, onRetry }: AttentionPanelProps) => {
  const { data: sessions } = useVpnSessions();
  const activeSessions = sessions?.length ?? 0;
  const visible = failed.slice(0, VISIBLE_LIMIT);

  return (
    <section aria-label="Needs attention" className="flex w-[320px] shrink-0 flex-col px-5 py-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-mono text-[10px] tracking-[0.1em] text-dim">NEEDS ATTENTION</h2>
        <span
          className={cn(
            "tabular font-mono text-xl font-medium leading-none",
            failed.length > 0 ? "text-status-fail" : "text-status-ok",
          )}
        >
          {failed.length}
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-grow items-center gap-2.5 text-xs text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-status-ok" aria-hidden="true" />
          No failed deployments.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((project) => (
            <li
              key={project.id}
              className="flex items-center justify-between rounded-md border-l-2 border-status-fail bg-surface px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold">{project.name}</p>
                <p className="font-mono text-[10px] text-dim">
                  {formatRelativeTime(project.lastDeploy)}
                </p>
              </div>
              {onRetry && (
                <button
                  type="button"
                  onClick={() => onRetry(project)}
                  className="font-mono text-[11px] font-semibold tracking-[0.06em] text-primary hover:underline"
                >
                  RETRY
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex-grow" />

      <div className="flex items-center justify-between border-t border-line pt-2.5">
        <span className="font-mono text-[10px] tracking-[0.1em] text-dim">VPN SESSIONS</span>
        <span
          className={cn(
            "flex items-center gap-1.5 font-mono text-xs",
            activeSessions > 0 ? "text-status-ok" : "text-dim",
          )}
        >
          <span
            aria-hidden="true"
            className={cn("h-1.5 w-1.5 rounded-full", activeSessions > 0 ? "bg-status-ok" : "bg-faint")}
          />
          {activeSessions > 0 ? `${activeSessions} active` : "none"}
        </span>
      </div>
    </section>
  );
};
