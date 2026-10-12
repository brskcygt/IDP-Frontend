import { useQuery } from '@tanstack/react-query';
import { getTransport } from '../services/transport';
import type { DeploymentHistoryEntry } from '../services/transport/types';

/**
 * `DeploymentHistoryEntry` (transport/types.ts) only types the fields every
 * caller needs (`id` / `projectId` / `status` / `startedAt`) and leaves the
 * rest to its `[key: string]: unknown` index signature — this hook is the
 * one place that knows the backend's `deployments` row also carries
 * `finishedAt` / `durationMs` / `triggeredBy` / `environment` / `error`
 * (see `backend/src/store/deploymentRepository.js` `rowToSummary()`), typed
 * here rather than widening the shared transport type.
 */
export interface DeploymentHistoryRecord extends DeploymentHistoryEntry {
  finishedAt?: string | null;
  durationMs?: number | null;
  triggeredBy?: string | null;
  environment?: string | null;
  error?: string | null;
  /** Artifact runs: 'deploy' / 'build' / 'rollback' / … and what they installed where. */
  kind?: string | null;
  releaseId?: string | null;
  targetId?: string | null;
}

/** This data only changes when a deployment finishes; no reason to poll it. */
const HISTORY_STALE_TIME_MS = 30_000;

/**
 * Most recent deployment for a single project — drives the enriched "last
 * run" summary on the project row. `null` once loaded with no history yet
 * (a project that has never deployed).
 */
export const useProjectLastDeployment = (projectId: string | undefined) => {
  const transport = getTransport();
  return useQuery<DeploymentHistoryEntry[], Error, DeploymentHistoryRecord | null>({
    queryKey: ['deployment-history', projectId, 'last'],
    queryFn: () => transport.deploy.history(projectId, 1),
    enabled: Boolean(projectId),
    staleTime: HISTORY_STALE_TIME_MS,
    select: (entries) => (entries[0] as DeploymentHistoryRecord | undefined) ?? null,
  });
};

/** The last `limit` deployments for a project, newest first — for the history panel. */
export const useProjectDeploymentHistory = (projectId: string | undefined, limit: number) => {
  const transport = getTransport();
  return useQuery<DeploymentHistoryEntry[], Error, DeploymentHistoryRecord[]>({
    queryKey: ['deployment-history', projectId, limit],
    queryFn: () => transport.deploy.history(projectId, limit),
    enabled: Boolean(projectId),
    staleTime: HISTORY_STALE_TIME_MS,
    select: (entries) => entries as DeploymentHistoryRecord[],
  });
};

/** How far back to look for a run that is live or just finished. */
const RUN_LOOKUP_LIMIT = 20;

/**
 * The persisted record of one run, which unlike the live session carries who
 * started it and, for artifact runs, the customer and release. The record is
 * written when the run is created, so it exists by the time a deployment id is
 * known; keyed by that id so each new run reads it fresh.
 */
export const useDeploymentRecord = (projectId: string | undefined, deploymentId: string | null | undefined) => {
  const transport = getTransport();
  return useQuery<DeploymentHistoryEntry[], Error, DeploymentHistoryRecord | null>({
    queryKey: ['deployment-history', projectId, 'run', deploymentId],
    queryFn: () => transport.deploy.history(projectId, RUN_LOOKUP_LIMIT),
    enabled: Boolean(projectId && deploymentId),
    staleTime: HISTORY_STALE_TIME_MS,
    select: (entries) => (entries.find((entry) => entry.id === deploymentId) as DeploymentHistoryRecord | undefined) ?? null,
  });
};

/**
 * Archived log body for one finished deployment. Immutable once a
 * deployment is terminal, so it's cached indefinitely — no reason to ever
 * refetch the same `deploymentId` twice.
 */
export const useDeploymentLogsArchive = (deploymentId: string | undefined) => {
  const transport = getTransport();
  return useQuery<string>({
    queryKey: ['deployment-logs-archive', deploymentId],
    queryFn: () => transport.deploy.logsArchive(deploymentId as string),
    enabled: Boolean(deploymentId),
    staleTime: Infinity,
  });
};
