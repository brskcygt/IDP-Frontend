import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getTransport } from '../services/transport';
import type { HostKeyRecord } from '../services/transport/types';

export type KnownHostKey = HostKeyRecord;

/**
 * Known SSH host keys backing KnownHostKeysSheet (T-17b, admin-only —
 * requires `vpn:manage`). `enabled` lets the sheet skip the request
 * entirely for a non-admin session instead of firing a request the backend
 * would 403 anyway, mirroring useUsers.
 */
export const useHostKeys = (enabled: boolean) => {
  const transport = getTransport();
  return useQuery<KnownHostKey[]>({
    queryKey: ['host-keys'],
    queryFn: () => transport.hostKeys.list(),
    enabled,
  });
};

export const useForgetHostKey = () => {
  const transport = getTransport();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ host, port }: { host: string; port: number }) => transport.hostKeys.forget(host, port),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['host-keys'] });
    },
  });
};
