import type { AuditLog } from "@/hooks/useAuditLogs";
import { auditMeta, formatMetadata } from "@/lib/auditMeta";
import { formatClock, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

/** "ip · 240ms" / "ip" / "240ms" — omitted entirely when neither is known (pre-T-55 rows). */
const formatContext = (log: AuditLog): string => {
  const parts: string[] = [];
  if (log.ip) parts.push(log.ip);
  if (typeof log.durationMs === 'number') parts.push(formatDuration(log.durationMs));
  return parts.join(' · ');
};

export const ActivityLogEntry = ({ log }: { log: AuditLog }) => {
  const { icon: Icon, tone } = auditMeta(log.action);
  const metadata = formatMetadata(log.metadata);
  const context = formatContext(log);
  const isFailure = log.outcome === 'failure';

  return (
    <li className="grid grid-cols-[56px_1fr] gap-3 border-b border-line px-5 py-3.5">
      <span className="tabular pt-px font-mono text-[11px] text-dim">
        {formatClock(log.timestamp)}
      </span>
      <div className="min-w-0">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <Icon className={cn("h-3.5 w-3.5 shrink-0", tone)} aria-hidden="true" />
          <span className="text-[13px] font-semibold">{log.user}</span>
          <span
            className={cn(
              "rounded-sm bg-accent px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.09em]",
              tone,
            )}
          >
            {log.action}
          </span>
          {log.outcome && (
            <span
              className={cn(
                "rounded-sm px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.09em]",
                isFailure ? "bg-status-fail/10 text-status-fail" : "bg-status-ok/10 text-status-ok",
              )}
            >
              {log.outcome}
            </span>
          )}
        </div>
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">{log.description}</p>
        {metadata && <p className="mt-1.5 break-all font-mono text-[10px] text-faint">{metadata}</p>}
        {context && <p className="mt-1 font-mono text-[10px] text-faint">{context}</p>}
      </div>
    </li>
  );
};
