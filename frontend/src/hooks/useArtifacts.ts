import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getTransport } from '@/services/transport';
import type { DeployTargetInput, TriggerDeployResult } from '@/services/transport/types';

export const useArtifactReleases = (projectId: string | undefined) => useQuery({
  queryKey: ['artifact-releases', projectId],
  queryFn: () => getTransport().artifacts.listReleases(projectId as string),
  enabled: Boolean(projectId),
  refetchInterval: (query) => query.state.data?.some((release) => release.status === 'building') ? 2_000 : false,
});

export const useArtifactTargets = (projectId: string | undefined) => useQuery({
  queryKey: ['artifact-targets', projectId],
  queryFn: () => getTransport().artifacts.listTargets(projectId as string),
  enabled: Boolean(projectId),
});

export const useArtifactAgents = (enabled: boolean) => useQuery({
  queryKey: ['agents'],
  queryFn: () => getTransport().agents.list(),
  enabled,
  refetchInterval: enabled ? 10_000 : false,
});

export const useArtifactActions = (projectId: string) => {
  const queryClient = useQueryClient();
  const invalidateReleases = () => queryClient.invalidateQueries({ queryKey: ['artifact-releases', projectId] });
  const invalidateTargets = () => queryClient.invalidateQueries({ queryKey: ['artifact-targets', projectId] });
  const afterRun = (_result: TriggerDeployResult) => {
    void queryClient.invalidateQueries({ queryKey: ['projects'] });
    void queryClient.invalidateQueries({ queryKey: ['deployment-sessions'] });
    void queryClient.invalidateQueries({ queryKey: ['deployment-history'] });
  };

  return {
    createRelease: useMutation({ mutationFn: (input: { version: string; ref?: string }) => getTransport().artifacts.createRelease(projectId, input), onSuccess: (result) => { void invalidateReleases(); afterRun(result); } }),
    importRelease: useMutation({ mutationFn: (version: string) => getTransport().artifacts.importRelease(projectId, version), onSuccess: () => { void invalidateReleases(); } }),
    deleteRelease: useMutation({ mutationFn: (id: string) => getTransport().artifacts.deleteRelease(id), onSuccess: () => { void invalidateReleases(); } }),
    createTarget: useMutation({ mutationFn: (input: DeployTargetInput) => getTransport().artifacts.createTarget(projectId, input), onSuccess: () => { void invalidateTargets(); } }),
    updateTarget: useMutation({ mutationFn: ({ id, input }: { id: string; input: Partial<DeployTargetInput> }) => getTransport().artifacts.updateTarget(id, input), onSuccess: () => { void invalidateTargets(); } }),
    deleteTarget: useMutation({ mutationFn: (id: string) => getTransport().artifacts.deleteTarget(id), onSuccess: () => { void invalidateTargets(); } }),
    refreshTarget: useMutation({ mutationFn: (id: string) => getTransport().artifacts.refreshTarget(id), onSuccess: () => { void invalidateTargets(); } }),
    applyConfig: useMutation({
      mutationFn: ({ targetId, confirmation }: { targetId: string; confirmation?: string }) =>
        getTransport().artifacts.applyConfig(targetId, { confirmation }),
      onSuccess: afterRun,
    }),
    deploy: useMutation({ mutationFn: ({ targetId, releaseId, confirmation }: { targetId: string; releaseId: string; confirmation?: string }) => getTransport().artifacts.deploy(targetId, { releaseId, confirmation }), onSuccess: afterRun }),
    rollback: useMutation({ mutationFn: ({ targetId, confirmation }: { targetId: string; confirmation?: string }) => getTransport().artifacts.rollback(targetId, { confirmation }), onSuccess: afterRun }),
  };
};
