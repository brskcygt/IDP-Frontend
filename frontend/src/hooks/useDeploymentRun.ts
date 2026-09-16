import { useCallback, useMemo, useState } from 'react';
import type { Project } from './useProjects';
import type { DeploymentStatus } from './useDeploymentLogStream';

/** Static identity for a tracked run — set once at creation, never mutated. */
export type DeploymentRunRecord = {
  runKey: string;
  projectId: string;
  project: Project | null;
  /** 'start' fires a fresh deploy; 'attach' reconnects to one already running. */
  mode: 'start' | 'attach';
  initialParams?: Record<string, unknown>;
  attachDeploymentId?: string;
};

/** Live data reported back by the run's own SSE-backed controller. */
export type DeploymentRunSnapshot = {
  deploymentId: string | null;
  status: DeploymentStatus;
  logs: string[];
  elapsedMs: number;
  abort: () => void;
};

export type DeploymentRunView = DeploymentRunRecord & DeploymentRunSnapshot;

const TERMINAL = new Set<DeploymentStatus>(['succeeded', 'failed', 'aborted']);
const isTerminal = (status: DeploymentStatus) => TERMINAL.has(status);

const IDLE_SNAPSHOT: DeploymentRunSnapshot = {
  deploymentId: null,
  status: 'connecting',
  logs: [],
  elapsedMs: 0,
  abort: () => {},
};

let runCounter = 0;
const nextRunKey = (projectId: string) => `run-${projectId}-${Date.now()}-${runCounter++}`;

/**
 * Tracks every deployment the user has started or attached to this session
 * as an independent entry, keyed by a stable run key — replacing the old
 * single-run model that lost a project's logs the moment a second deploy
 * began (T-71). Each entry's SSE stream is owned by a DeploymentRunController
 * mounted for it via DeploymentRunsHost; this hook only manages identity,
 * ordering, and the merged view the terminal UI reads from.
 */
export const useDeploymentRuns = () => {
  const [records, setRecords] = useState<DeploymentRunRecord[]>([]);
  const [snapshots, setSnapshots] = useState<Map<string, DeploymentRunSnapshot>>(new Map());
  const [activeRunKey, setActiveRunKey] = useState<string | null>(null);
  const [lastFailure, setLastFailure] = useState<string | null>(null);

  const runs = useMemo<DeploymentRunView[]>(
    () => records.map((record) => ({ ...IDLE_SNAPSHOT, ...record, ...snapshots.get(record.runKey) })),
    [records, snapshots],
  );

  const start = useCallback(
    (project: Project, params: Record<string, unknown>) => {
      const existing = records.find(
        (r) => r.projectId === project.id && !isTerminal(snapshots.get(r.runKey)?.status ?? 'connecting'),
      );
      if (existing) {
        setActiveRunKey(existing.runKey);
        return { runKey: existing.runKey, isDuplicate: true };
      }
      const runKey = nextRunKey(project.id);
      setRecords((prev) => [...prev, { runKey, projectId: project.id, project, mode: 'start', initialParams: params }]);
      setActiveRunKey(runKey);
      return { runKey, isDuplicate: false };
    },
    [records, snapshots],
  );

  const attach = useCallback(
    (deploymentId: string, projectId: string, project: Project | null) => {
      const existing = records.find((r) => snapshots.get(r.runKey)?.deploymentId === deploymentId);
      if (existing) {
        setActiveRunKey(existing.runKey);
        return;
      }
      const runKey = nextRunKey(projectId);
      setRecords((prev) => [...prev, { runKey, projectId, project, mode: 'attach', attachDeploymentId: deploymentId }]);
      setActiveRunKey(runKey);
    },
    [records, snapshots],
  );

  const removeRecord = useCallback((runKey: string) => {
    setRecords((prev) => prev.filter((r) => r.runKey !== runKey));
    setSnapshots((prev) => {
      const next = new Map(prev);
      next.delete(runKey);
      return next;
    });
    setActiveRunKey((prev) => (prev === runKey ? null : prev));
  }, []);

  /** Only closable once terminal — an active run must stay tracked. */
  const close = useCallback(
    (runKey: string) => {
      if (!isTerminal(snapshots.get(runKey)?.status ?? 'connecting')) return;
      removeRecord(runKey);
    },
    [snapshots, removeRecord],
  );

  const reportSnapshot = useCallback((runKey: string, snapshot: DeploymentRunSnapshot) => {
    setSnapshots((prev) => new Map(prev).set(runKey, snapshot));
  }, []);

  const reportTriggerFailed = useCallback(
    (runKey: string, message: string) => {
      removeRecord(runKey);
      setLastFailure(message);
    },
    [removeRecord],
  );

  const clearLastFailure = useCallback(() => setLastFailure(null), []);

  return {
    records,
    runs,
    activeRunKey,
    activeRun: runs.find((r) => r.runKey === activeRunKey) ?? null,
    setActiveRunKey,
    start,
    attach,
    close,
    reportSnapshot,
    reportTriggerFailed,
    lastFailure,
    clearLastFailure,
  };
};
