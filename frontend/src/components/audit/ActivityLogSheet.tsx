import { useMemo, useState } from "react";
import { Activity } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useAuditLogs, type AuditLog } from "@/hooks/useAuditLogs";
import { auditMeta, type AuditCategory } from "@/lib/auditMeta";
import { formatDayLabel, toDayKey } from "@/lib/format";
import { ActivityLogFilters } from "./ActivityLogFilters";
import { ActivityLogEntry } from "./ActivityLogEntry";

type ActivityLogSheetProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

type DayGroup = { key: string; label: string; logs: AuditLog[] };

const groupByDay = (logs: AuditLog[]): DayGroup[] => {
  const groups = new Map<string, DayGroup>();
  for (const log of logs) {
    const key = toDayKey(log.timestamp);
    const group = groups.get(key);
    if (group) group.logs.push(log);
    else groups.set(key, { key, label: formatDayLabel(log.timestamp), logs: [log] });
  }
  return [...groups.values()];
};

export const ActivityLogSheet = ({ isOpen, onOpenChange }: ActivityLogSheetProps) => {
  const { data: logs, isLoading, isError } = useAuditLogs();
  const [category, setCategory] = useState<AuditCategory | null>(null);

  const groups = useMemo(() => {
    const filtered = (logs ?? []).filter(
      (log) => !category || auditMeta(log.action).category === category,
    );
    return groupByDay(filtered);
  }, [logs, category]);

  const shown = groups.reduce((sum, group) => sum + group.logs.length, 0);

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l-line-strong bg-background p-0 sm:max-w-[480px]"
      >
        <div className="shrink-0 border-b border-line-strong bg-bar px-5 py-4">
          <SheetTitle className="flex items-center gap-2.5 text-[15px] font-bold tracking-tight">
            <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
            Activity log
          </SheetTitle>
          <SheetDescription className="mt-1 font-mono text-[10.5px] tracking-[0.04em] text-dim">
            AUDIT TRAIL · REFRESHES EVERY 10S
          </SheetDescription>
        </div>

        <ActivityLogFilters active={category} onChange={setCategory} />

        <div className="min-h-0 flex-grow overflow-y-auto">
          {isError ? (
            <p className="px-5 py-6 text-sm text-status-fail">Could not load the audit trail.</p>
          ) : isLoading ? (
            <p className="px-5 py-6 font-mono text-[11px] text-dim">Loading events…</p>
          ) : groups.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">
              {category ? "No events in this category yet." : "No activity recorded yet."}
            </p>
          ) : (
            groups.map((group) => (
              <section key={group.key}>
                <h3 className="border-b border-line bg-bar px-5 pb-2 pt-2.5 font-mono text-[9.5px] tracking-[0.12em] text-faint">
                  {group.label}
                </h3>
                <ul>
                  {group.logs.map((log) => (
                    <ActivityLogEntry key={log.id} log={log} />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>

        <div className="tabular flex h-[34px] shrink-0 items-center justify-between border-t border-line-strong bg-bar px-5 font-mono text-[10.5px] text-dim">
          <span>
            {shown} of {logs?.length ?? 0} events
          </span>
        </div>
      </SheetContent>
    </Sheet>
  );
};
