import { useMemo } from 'react';
import { useAuditLogs, type AuditLog } from './useAuditLogs';

/**
 * What happened to the builds CI made on its own (a push), newest first.
 *
 * Read from the audit trail the dashboard already polls: the backend writes
 * RELEASE_UPLOADED (with `ciInitiated` + `ref`) when such a build arrives,
 * RELEASE_AUTO_DEPLOY_STARTED | SKIPPED | FAILED per target that asked for it,
 * and the install itself ends as ARTIFACT_DEPLOY_SUCCEEDED | FAILED | CANCELLED
 * under the same deploymentId.
 */
export type AutoDeployState = 'installing' | 'installed' | 'failed' | 'skipped' | 'unmatched';

/** Label and colours per state: the dashboard panel and its toasts. */
export const AUTO_DEPLOY_STATE: Record<AutoDeployState, { label: string; border: string; text: string }> = {
  installing: { label: 'KURULUYOR', border: 'border-status-run', text: 'text-status-run' },
  installed: { label: 'KURULDU', border: 'border-status-ok', text: 'text-status-ok' },
  failed: { label: 'BAŞARISIZ', border: 'border-status-fail', text: 'text-status-fail' },
  skipped: { label: 'ATLANDI', border: 'border-status-warn', text: 'text-status-warn' },
  unmatched: { label: 'EŞLEŞEN MÜŞTERİ YOK', border: 'border-status-warn', text: 'text-status-warn' },
};

export type AutoDeployItem = {
  /** Stable per attempt: the audit id of the entry that started it. */
  id: string;
  at: string;
  projectId: string;
  version: string;
  ref: string | null;
  targetName: string | null;
  state: AutoDeployState;
  /** Why it was skipped or failed, as the backend put it. */
  detail: string | null;
  deploymentId: string | null;
};

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

const OUTCOMES: Record<string, AutoDeployState> = {
  ARTIFACT_DEPLOY_SUCCEEDED: 'installed',
  ARTIFACT_DEPLOY_FAILED: 'failed',
  ARTIFACT_DEPLOY_CANCELLED: 'failed',
};

export const buildAutoDeployFeed = (logs: AuditLog[]): AutoDeployItem[] => {
  const outcomes = new Map<string, AuditLog>();
  const attemptedReleases = new Set<string>();
  for (const log of logs) {
    const deploymentId = text(log.metadata?.deploymentId);
    if (deploymentId && OUTCOMES[log.action] && !outcomes.has(deploymentId)) outcomes.set(deploymentId, log);
    if (log.action.startsWith('RELEASE_AUTO_DEPLOY_')) {
      const releaseId = text(log.metadata?.releaseId);
      if (releaseId) attemptedReleases.add(releaseId);
    }
  }

  const items: AutoDeployItem[] = [];
  for (const log of logs) {
    const meta = log.metadata ?? {};
    const base = {
      id: log.id,
      at: log.timestamp,
      projectId: text(meta.projectId) ?? '',
      version: text(meta.version) ?? '',
      ref: text(meta.ref),
      targetName: text(meta.targetName),
      deploymentId: text(meta.deploymentId),
    };
    if (log.action === 'RELEASE_AUTO_DEPLOY_STARTED') {
      const outcome = base.deploymentId ? outcomes.get(base.deploymentId) : undefined;
      const state = outcome ? OUTCOMES[outcome.action] : 'installing';
      items.push({ ...base, state, detail: state === 'failed' && outcome ? outcome.description : null });
    } else if (log.action === 'RELEASE_AUTO_DEPLOY_SKIPPED' || log.action === 'RELEASE_AUTO_DEPLOY_FAILED') {
      items.push({
        ...base,
        state: log.action === 'RELEASE_AUTO_DEPLOY_SKIPPED' ? 'skipped' : 'failed',
        detail: text(meta.error) ?? log.description,
      });
    } else if (log.action === 'RELEASE_UPLOADED' && meta.ciInitiated === true && base.ref
      && !attemptedReleases.has(text(meta.releaseId) ?? '')) {
      // A push build arrived and no target took it: the most likely surprise.
      items.push({ ...base, state: 'unmatched', detail: null });
    }
  }
  return items.sort((a, b) => b.at.localeCompare(a.at));
};

export const useAutoDeployFeed = () => {
  const { data: logs, isLoading, isError } = useAuditLogs();
  const items = useMemo(() => buildAutoDeployFeed(logs ?? []), [logs]);
  return { items, isLoading, isError };
};
