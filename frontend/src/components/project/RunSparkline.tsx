import { cn } from "@/lib/utils";

export type RunOutcome = {
  id: string;
  succeeded: boolean;
  /** Duration in ms, used for the bar height when several runs are known. */
  durationMs: number;
};

type RunSparklineProps = {
  runs?: ReadonlyArray<RunOutcome>;
  max?: number;
};

/**
 * Recent run outcomes as a micro bar chart: height is duration, colour is
 * outcome. Renders an explicit "no history" dash when the platform has no run
 * history to show — it never fabricates bars.
 */
export const RunSparkline = ({ runs, max = 8 }: RunSparklineProps) => {
  if (!runs || runs.length === 0) {
    return (
      <span className="font-mono text-[11px] text-faint" title="No run history recorded yet">
        —
      </span>
    );
  }

  const visible = runs.slice(-max);
  const longest = Math.max(...visible.map((run) => run.durationMs), 1);

  return (
    <div className="flex h-4 items-end gap-[3px]" role="img" aria-label={`Last ${visible.length} runs`}>
      {visible.map((run, index) => (
        <span
          key={run.id}
          className={cn(
            "w-1 rounded-[1px]",
            run.succeeded ? "bg-status-ok" : "bg-status-fail",
            index === visible.length - 1 ? "opacity-100" : "opacity-70",
          )}
          style={{ height: `${Math.max(25, (run.durationMs / longest) * 100)}%` }}
        />
      ))}
    </div>
  );
};
