import { useDeployActivity } from "@/hooks/useDeployActivity";
import { cn } from "@/lib/utils";

/**
 * Deploy volume over the last two weeks, read off the audit trail.
 *
 * Deliberately labelled "activity" and not "success rate": the backend records
 * triggers and aborts but not deployment outcomes, so a rate would be a guess.
 */
export const DeployActivityPanel = ({ dayCount = 14 }: { dayCount?: number }) => {
  const { days, triggered, aborted, peak, isLoading, isError } = useDeployActivity(dayCount);

  return (
    <section
      aria-label="Deploy activity"
      className="flex w-[320px] shrink-0 flex-col border-r border-line px-5 py-4"
    >
      <h2 className="mb-2.5 font-mono text-[10px] tracking-[0.1em] text-dim">
        DEPLOY ACTIVITY · {dayCount}D
      </h2>

      {isError ? (
        <p className="text-xs text-status-fail">Audit trail unavailable.</p>
      ) : (
        <>
          <div className="mb-3.5 flex items-baseline gap-2.5">
            <span className="tabular font-mono text-[32px] font-medium leading-none">
              {isLoading ? "··" : triggered}
            </span>
            <span className="font-mono text-[11px] text-dim">runs triggered</span>
          </div>

          <div className="mb-2.5 flex h-[76px] items-end gap-1" aria-hidden="true">
            {days.map((day) => {
              const total = day.triggered + day.aborted;
              const height = peak === 0 ? 0 : Math.round((total / peak) * 100);
              return (
                <div
                  key={day.key}
                  title={`${day.label} — ${day.triggered} triggered, ${day.aborted} aborted`}
                  className="flex flex-grow flex-col justify-end gap-px"
                  style={{ height: "100%" }}
                >
                  {day.aborted > 0 && (
                    <div
                      className="w-full bg-status-fail"
                      style={{ height: `${Math.max(6, (day.aborted / Math.max(total, 1)) * height)}%` }}
                    />
                  )}
                  <div
                    className={cn("w-full", total === 0 ? "bg-line" : "bg-status-ok")}
                    style={{ height: `${total === 0 ? 4 : Math.max(6, height)}%` }}
                  />
                </div>
              );
            })}
          </div>

          <div className="tabular flex justify-between font-mono text-[10.5px] text-faint">
            <span>{days[0]?.label} — {days[days.length - 1]?.label}</span>
            <span className={cn(aborted > 0 && "text-status-fail")}>{aborted} aborted</span>
          </div>
        </>
      )}
    </section>
  );
};
