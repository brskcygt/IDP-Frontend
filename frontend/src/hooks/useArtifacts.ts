import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getTransport } from '@/services/transport';
import type { ComposeReleaseInput, CreateReleaseInput, CreateTagInput, DeployTargetInput, TriggerDeployResult } from '@/services/transport/types';

export const useArtifactReleases = (projectId: string | undefined) => useQuery({
  queryKey: ['artifact-releases', projectId],
  queryFn: () => getTransport().artifacts.listReleases(projectId as string),
  enabled: Boolean(projectId),
  refetchInterval: (query) => query.state.data?.some((release) => release.status === 'building') ? 2_000 : false,
});

/**
 * Branches and tags of the project's repository. Not polled: listing them is a
 * round trip to Bitbucket, so the composer offers a manual refresh instead.
 */
export const useRepoRefs = (projectId: string | undefined) => useQuery({
  queryKey: ['artifact-refs', projectId],
  queryFn: () => getTransport().artifacts.listRefs(projectId as string),
  enabled: Boolean(projectId),
  staleTime: 30_000,
  retry: false,
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
  const invalidateRefs = () => queryClient.invalidateQueries({ queryKey: ['artifact-refs', projectId] });
  const afterRun = (_result: TriggerDeployResult) => {
    void queryClient.invalidateQueries({ queryKey: ['projects'] });
    void queryClient.invalidateQueries({ queryKey: ['deployment-sessions'] });
    void queryClient.invalidateQueries({ queryKey: ['deployment-history'] });
  };

  return {
    createRelease: useMutation({ mutationFn: (input: CreateReleaseInput) => getTransport().artifacts.createRelease(projectId, input), onSuccess: (result) => { void invalidateReleases(); afterRun(result); } }),
    // The preview branch it pushes shows up in the ref list, and a deployTo run
    // changes what the chosen test customer is on.
    composeRelease: useMutation({ mutationFn: (input: ComposeReleaseInput) => getTransport().artifacts.composeRelease(projectId, input), onSuccess: (result) => { void invalidateReleases(); void invalidateRefs(); void invalidateTargets(); afterRun(result); } }),
    createTag: useMutation({ mutationFn: (input: CreateTagInput) => getTransport().artifacts.createTag(projectId, input), onSuccess: () => { void invalidateRefs(); } }),
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
    // `components` narrows the run to part of the target (e.g. frontend only);
    // omitted, the target's whole component set is deployed as before.
    deploy: useMutation({ mutationFn: ({ targetId, releaseId, components, confirmation }: { targetId: string; releaseId: string; components?: string[]; confirmation?: string }) => getTransport().artifacts.deploy(targetId, { releaseId, components, confirmation }), onSuccess: afterRun }),
    // Test targets: rebuild the branch and install it, no version to invent.
    buildAndDeploy: useMutation({ mutationFn: ({ targetId, components }: { targetId: string; components?: string[] }) => getTransport().artifacts.buildAndDeploy(targetId, { components }), onSuccess: (result) => { void invalidateReleases(); void invalidateTargets(); afterRun(result); } }),
    rollback: useMutation({ mutationFn: ({ targetId, components, confirmation }: { targetId: string; components?: string[]; confirmation?: string }) => getTransport().artifacts.rollback(targetId, { components, confirmation }), onSuccess: afterRun }),
  };
};
