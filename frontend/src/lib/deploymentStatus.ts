import { CheckCircle2, XCircle, TriangleAlert, Loader2, Circle, type LucideIcon } from 'lucide-react';

/**
 * Status vocabulary for a single `deployments` table row (T-54), as
 * returned by `transport.deploy.history()` / `logsArchive()`'s parent
 * record. Distinct from `Project['status']` ("Deploying" / "Succeeded" /
 * "Failed" / "Idle") — that's the project's current state; this is one
 * historical run's terminal (or in-flight) outcome, lower-cased to match
 * the backend's `deployments.status` column values verbatim.
 */
export type DeployRecordStatus =
  | 'pending'
  | 'connecting'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'aborted'
  | string;

const STATUS_ICON: Readonly<Record<string, LucideIcon>> = {
  succeeded: CheckCircle2,
  failed: XCircle,
  aborted: TriangleAlert,
  running: Loader2,
  connecting: Loader2,
  pending: Loader2,
};

const STATUS_CLASS: Readonly<Record<string, string>> = {
  succeeded: 'text-status-ok',
  failed: 'text-status-fail',
  aborted: 'text-status-warn',
  running: 'text-status-run',
  connecting: 'text-status-run',
  pending: 'text-status-run',
};

export const deployStatusIcon = (status: DeployRecordStatus): LucideIcon =>
  STATUS_ICON[status] ?? Circle;

export const deployStatusClass = (status: DeployRecordStatus): string =>
  STATUS_CLASS[status] ?? 'text-muted-foreground';

/** "succeeded" -> "Succeeded" — the raw column value, title-cased for display. */
export const deployStatusLabel = (status: DeployRecordStatus): string =>
  status.length > 0 ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
