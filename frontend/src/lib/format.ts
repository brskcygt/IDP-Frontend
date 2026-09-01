const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** "just now" / "12m ago" / "3h ago" / "2d ago" / locale date beyond a month. */
export const formatRelativeTime = (value: string | Date): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';

  const diffMs = Date.now() - date.getTime();
  if (diffMs < MINUTE_MS) return 'just now';
  if (diffMs < HOUR_MS) return `${Math.floor(diffMs / MINUTE_MS)}m ago`;
  if (diffMs < DAY_MS) return `${Math.floor(diffMs / HOUR_MS)}h ago`;

  const days = Math.floor(diffMs / DAY_MS);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
};

/** Elapsed clock for a running deployment: "04:12", or "1:04:12" past an hour. */
export const formatDuration = (ms: number): string => {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.floor(safeMs / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);

  const pad = (n: number) => n.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
};

/** "14:02" — wall clock, used down the left edge of the activity log. */
export const formatClock = (value: string | Date): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
};

/** Stable per-day bucket key in local time, for grouping and charting. */
export const toDayKey = (value: string | Date): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'invalid';
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
};

/** "TODAY · 18 AUG" / "YESTERDAY · 17 AUG" / "16 AUG" — activity log day rules. */
export const formatDayLabel = (value: string | Date): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'UNKNOWN';

  const stamp = date
    .toLocaleDateString([], { day: '2-digit', month: 'short' })
    .toUpperCase()
    .replace(',', '');

  const today = toDayKey(new Date());
  const yesterday = toDayKey(new Date(Date.now() - DAY_MS));
  const key = toDayKey(date);

  if (key === today) return `TODAY · ${stamp}`;
  if (key === yesterday) return `YESTERDAY · ${stamp}`;
  return stamp;
};

/** Short axis label for the activity chart: "18/08". */
export const formatShortDay = (date: Date): string =>
  `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;

/**
 * Finished-run duration for a completed deployment: "45s" / "1m 12s" / "1h 5m".
 * Unlike formatDuration() (a live "MM:SS" clock for a run in progress), this
 * reads as a compact summary of something that already happened.
 */
export const formatDeployDuration = (ms: number): string => {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.round(safeMs / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};
