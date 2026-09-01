import { useProjects } from "@/hooks/useProjects";
import { useTelemetry } from "@/hooks/useTelemetry";
import { isHostBacked } from "@/lib/projectMeta";
import { cn } from "@/lib/utils";

type HostLoadCellProps = {
  projectId: string;
  provider: string;
};

const loadTone = (cpu: number): string => {
  if (cpu >= 85) return "bg-status-fail";
  if (cpu >= 55) return "bg-status-warn";
  return "bg-status-ok";
};

/**
 * CPU/RAM for providers that run against a reachable host. Providers without a
 * host (pipelines), hosts we cannot reach, and projects with telemetry turned
 * off (T-18b, `config.telemetryEnabled` defaults to `false`) all render a
 * dash rather than a zeroed bar or an "offline" badge — "not being measured"
 * must never be mistaken for "measured and unreachable".
 *
 * Reads `config.telemetryEnabled` off the shared `['projects']` query cache
 * (already populated by whatever list view renders this row) rather than a
 * prop, so this stays a drop-in for the existing `<HostLoadCell projectId
 * provider />` call site.
 */
export const HostLoadCell = ({ projectId, provider }: HostLoadCellProps) => {
  const { data: projects } = useProjects();
  const telemetryEnabled = projects?.find((p) => p.id === projectId)?.config?.telemetryEnabled === true;

  const hostBacked = isHostBacked(provider);
  const enabled = hostBacked && telemetryEnabled;
  const { data: telemetry, isLoading } = useTelemetry(projectId, enabled);

  if (!hostBacked || !telemetryEnabled) return <span className="font-mono text-[11px] text-faint">—</span>;
  if (isLoading) return <span className="font-mono text-[11px] text-faint">···</span>;

  if (!telemetry || telemetry.status !== "online" || telemetry.cpu === undefined) {
    return (
      <span className="flex items-center gap-2 font-mono text-[11px] text-dim">
        <span className="h-1.5 w-1.5 rounded-full bg-status-fail" aria-hidden="true" />
        offline
      </span>
    );
  }

  const cpu = telemetry.cpu;
  const ram = telemetry.ramPercent;

  return (
    <div className="flex items-center gap-2" title={`CPU ${cpu}% · RAM ${ram ?? "?"}%`}>
      <div className="h-1 w-14 overflow-hidden rounded-sm bg-line-strong">
        <div className={cn("h-1", loadTone(cpu))} style={{ width: `${Math.min(100, cpu)}%` }} />
      </div>
      <span className="tabular font-mono text-[11px] text-muted-foreground">
        {cpu.toString().padStart(2, "0")}/{(ram ?? 0).toString().padStart(2, "0")}
      </span>
    </div>
  );
};
