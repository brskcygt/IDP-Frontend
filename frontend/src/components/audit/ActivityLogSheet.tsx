import { useMemo, useState } from "react";
import { Activity } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useAuditLogs, type AuditLog } from "@/hooks/useAuditLogs";
import { auditMeta, type AuditCategory } from "@/lib/auditMeta";
import { formatDayLabel, toDayKey } from "@/lib/format";
import { ActivityLogFilters } from "./ActivityLogFilters";
import { ActivityLogEntry } from "./ActivityLogEntry";
import { Button } from "@/components/ui/button";

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
  const { data: logs, isLoading, isError, refetch, isFetching } = useAuditLogs();
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
        resizeKey="activity-log"
        side="right"
        className="flex w-[min(860px,calc(100vw-3.5rem))] max-w-none flex-col gap-0 border-l-line-strong bg-background p-0 sm:max-w-none"
      >
        <div className="shrink-0 border-b border-line-strong bg-bar px-5 py-4">
          <SheetTitle className="flex items-center gap-2.5 text-[15px] font-bold tracking-tight">
            <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
            Etkinlik kaydı
          </SheetTitle>
          <SheetDescription className="mt-1 text-xs text-muted-foreground">
            Kim neyi ne zaman yaptı. 10 saniyede bir yenilenir.
          </SheetDescription>
        </div>

        <ActivityLogFilters active={category} onChange={setCategory} />

        <div className="min-h-0 flex-grow overflow-y-auto">
          {isError ? (
            <div className="space-y-2 px-5 py-6">
              <p className="text-sm text-status-fail">Etkinlik kaydı yüklenemedi.</p>
              <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>Tekrar dene</Button>
            </div>
          ) : isLoading ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">Etkinlikler yükleniyor…</p>
          ) : groups.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">
              {category ? "Bu kategoride henüz etkinlik yok." : "Henüz etkinlik kaydı yok."}
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
            {logs?.length ?? 0} etkinlikten {shown} gösteriliyor
          </span>
        </div>
      </SheetContent>
    </Sheet>
  );
};
