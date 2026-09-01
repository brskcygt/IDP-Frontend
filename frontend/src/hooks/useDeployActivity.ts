import { useMemo } from 'react';
import { useAuditLogs } from './useAuditLogs';
import { formatShortDay, toDayKey } from '@/lib/format';

export type ActivityDay = {
  key: string;
  date: Date;
  label: string;
  triggered: number;
  aborted: number;
};

export type DeployActivity = {
  days: ActivityDay[];
  triggered: number;
  aborted: number;
  peak: number;
  isLoading: boolean;
  isError: boolean;
};

const DAY_MS = 86_400_000;

/**
 * Deploy activity per day, derived from the audit trail we already poll.
 *
 * The backend records DEPLOY_TRIGGERED and DEPLOY_ABORTED but not deployment
 * outcomes, so this is deliberately an activity chart — not a success rate.
 * Add SUCCEEDED/FAILED audit entries server-side and this hook can report both.
 */
export const useDeployActivity = (dayCount = 14): DeployActivity => {
  const { data: logs, isLoading, isError } = useAuditLogs();

  return useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const days: ActivityDay[] = Array.from({ length: dayCount }, (_, index) => {
      const date = new Date(startOfToday.getTime() - (dayCount - 1 - index) * DAY_MS);
      return { key: toDayKey(date), date, label: formatShortDay(date), triggered: 0, aborted: 0 };
    });

    const byKey = new Map(days.map((day) => [day.key, day]));

    for (const log of logs ?? []) {
      const day = byKey.get(toDayKey(log.timestamp));
      if (!day) continue;
      if (log.action === 'DEPLOY_TRIGGERED') day.triggered += 1;
      else if (log.action === 'DEPLOY_ABORTED') day.aborted += 1;
    }

    const triggered = days.reduce((sum, day) => sum + day.triggered, 0);
    const aborted = days.reduce((sum, day) => sum + day.aborted, 0);
    const peak = days.reduce((max, day) => Math.max(max, day.triggered + day.aborted), 0);

    return { days, triggered, aborted, peak, isLoading, isError };
  }, [logs, dayCount, isLoading, isError]);
};
