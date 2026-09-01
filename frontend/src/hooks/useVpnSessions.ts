import { useQuery } from '@tanstack/react-query';
import { getTransport } from '../services/transport';
import type { VpnSession } from '../services/transport/types';
import { useSession } from './useSession';
import { can } from '../lib/permissions';

export type { VpnSession } from '../services/transport/types';

export const useVpnSessions = () => {
  const transport = getTransport();
  const { data: session } = useSession();
  const enabled = can(session?.role, 'vpn:manage');
  return useQuery<VpnSession[]>({
    queryKey: ['vpn-sessions'],
    queryFn: () => transport.vpn.sessions(),
    enabled,
    refetchInterval: 10000, // Poll every 10 seconds
  });
};
