import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getTransport } from '../services/transport';
import type { AgentAllowlist } from '../services/transport/types';

const QUERY_KEY = ['agent-allowlist'];

/**
 * Source-IP allowlist for the agent listener (admin-only).
 *
 * `enabled` lets the sheet skip the request for a non-admin session instead
 * of firing one the backend will 403 anyway.
 */
export const useAgentAllowlist = (enabled: boolean) => {
  const transport = getTransport();
  return useQuery<AgentAllowlist>({
    queryKey: QUERY_KEY,
    queryFn: () => transport.agents.allowlist(),
    enabled,
  });
};

/**
 * Both mutations write the response straight into the cache rather than only
 * invalidating: the backend returns the list after the change, so the entry
 * appears without a second round trip — and `enforcing` flips in the same
 * frame as the row it depends on.
 */
export const useAddAllowlistEntry = () => {
  const transport = getTransport();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ entry, note }: { entry: string; note?: string }) =>
      transport.agents.addAllowlistEntry(entry, note),
    onSuccess: (data) => queryClient.setQueryData(QUERY_KEY, data),
  });
};

export const useRemoveAllowlistEntry = () => {
  const transport = getTransport();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entry: string) => transport.agents.removeAllowlistEntry(entry),
    onSuccess: (data) => queryClient.setQueryData(QUERY_KEY, data),
  });
};
