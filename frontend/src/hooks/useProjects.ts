import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTransport } from '../services/transport';
import type { ProjectConfig } from '../types/project';
import type { Project } from '../services/transport/types';

export type { Project } from '../services/transport/types';

export const useProjects = () => {
  const transport = getTransport();
  return useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => transport.projects.list(),
  });
};

export const useUpdateProjectSettings = () => {
  const transport = getTransport();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, config }: { id: string; config: ProjectConfig }) => transport.projects.updateConfig(id, config),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      // Environment overrides may have just changed — refresh TriggerModal's view of them.
      queryClient.invalidateQueries({ queryKey: ['project-environments', variables.id] });
    },
  });
};

export const useCreateProject = () => {
  const transport = getTransport();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectData: { name: string; tenant: string; environment: string; provider: string }) =>
      transport.projects.create(projectData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
};

export const useDeleteProject = () => {
  const transport = getTransport();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => transport.projects.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
};

/**
 * Which environments actually have a configured override for this project
 * (T-50). Drives the TriggerModal's "this doesn't really go anywhere
 * different" warning — disabled while `projectId` is falsy since the modal
 * can be mounted before a project is selected.
 */
export const useProjectEnvironments = (projectId: string | undefined) => {
  const transport = getTransport();
  return useQuery({
    queryKey: ['project-environments', projectId],
    queryFn: () => transport.projects.environments(projectId as string),
    enabled: Boolean(projectId),
  });
};
