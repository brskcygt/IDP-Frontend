import { useQuery } from '@tanstack/react-query';
import { getTransport } from '../services/transport';
import type { DeploymentSession } from '../services/transport/types';

export type { DeploymentSession } from '../services/transport/types';

export const useDeploymentSessions = () => {
  const transport = getTransport();
  return useQuery<DeploymentSession[]>({
    queryKey: ['deployment-sessions'],
    queryFn: () => transport.deploy.sessions(),
    refetchInterval: 2000, // Poll every 2 seconds for live updates
  });
};
