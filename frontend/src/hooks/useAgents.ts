import { useQuery } from '@tanstack/react-query';
import { getTransport } from '@/services/transport';

/**
 * Connected IDP agents from `GET /api/agents` (backend proxies the gateway's
 * `/agent/all`). Polls while the panel is open so online/offline and last-ping
 * stay fresh; stops when closed.
 */
export const useAgents = (enabled: boolean) => useQuery({
  queryKey: ['agents'],
  queryFn: () => getTransport().agents.list(),
  enabled,
  refetchInterval: enabled ? 5_000 : false,
});
