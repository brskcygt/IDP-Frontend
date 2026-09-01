import { useQuery } from '@tanstack/react-query';
import { getTransport } from '../services/transport';
import type { AuditLog } from '../services/transport/types';

export type { AuditLog } from '../services/transport/types';

export const useAuditLogs = () => {
  const transport = getTransport();
  return useQuery<AuditLog[]>({
    queryKey: ['audit-logs'],
    queryFn: () => transport.audit.list(),
    refetchInterval: 10000,
  });
};
