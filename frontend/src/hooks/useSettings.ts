import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getTransport } from '../services/transport';
import type { BuildParametersSettings } from '../services/transport/types';

export type { BuildParametersSettings } from '../services/transport/types';

const QUERY_KEY = ['settings', 'build-parameters'];

export const useBuildParameters = () => {
  const transport = getTransport();
  return useQuery<BuildParametersSettings>({
    queryKey: QUERY_KEY,
    queryFn: () => transport.settings.getBuildParameters(),
  });
};

export const useUpdateBuildParameters = () => {
  const transport = getTransport();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (parameters: Record<string, string>) => transport.settings.updateBuildParameters(parameters),
    // The server normalizes what it stored (empty values dropped), so take its
    // answer as the truth rather than assuming the sent map was kept verbatim.
    onSuccess: (saved) => queryClient.setQueryData(QUERY_KEY, saved),
  });
};
