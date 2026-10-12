import { useArtifactReleases, useArtifactTargets } from './useArtifacts';
import { useDeploymentRecord } from './useDeploymentHistory';
import type { Project } from './useProjects';

export type RunContext = {
  /** Who started the run, from the persisted record; null while unknown. */
  triggeredBy: string | null;
  /** Artifact runs: the customer's name and the version being installed. */
  customer: string | null;
  version: string | null;
};

/**
 * Who started a run and, for artifact projects, which customer and version it
 * is about — everything the live session itself does not carry.
 */
export const useRunContext = (project: Project | null, deploymentId: string | null | undefined): RunContext => {
  const record = useDeploymentRecord(project?.id, deploymentId).data ?? null;
  const isArtifact = Boolean(project?.config?.artifactDeploy);
  const targets = useArtifactTargets(isArtifact && record?.targetId ? project?.id : undefined).data;
  const releases = useArtifactReleases(isArtifact && record?.releaseId ? project?.id : undefined).data;

  return {
    triggeredBy: record?.triggeredBy ?? null,
    customer: record?.targetId ? targets?.find((target) => target.id === record.targetId)?.name ?? null : null,
    version: record?.releaseId ? releases?.find((release) => release.id === record.releaseId)?.version ?? null : null,
  };
};
