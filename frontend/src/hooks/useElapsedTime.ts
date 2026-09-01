import { useEffect, useState } from 'react';

/**
 * Ticks once a second while `startedAt` is set, so the live panel can show a
 * running clock. Returns 0 when nothing is running; the interval is torn down
 * as soon as the deployment stops.
 */
export const useElapsedTime = (startedAt: number | null): number => {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (startedAt === null) {
      setElapsedMs(0);
      return;
    }

    setElapsedMs(Date.now() - startedAt);
    const id = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  return elapsedMs;
};
