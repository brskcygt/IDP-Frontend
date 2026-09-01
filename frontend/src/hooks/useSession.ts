import { useQuery } from '@tanstack/react-query';
import { getTransport } from '../services/transport';
import type { SessionUser } from '../services/transport/types';

export type { Role, SessionUser } from '../services/transport/types';

/**
 * The signed-in operator. Deployments are attributed in the audit trail, so the
 * UI names who is about to act wherever that matters (trigger, live stream).
 *
 * `role` (T-52 / SEC-09) drives client-side permission gating via
 * `@/lib/permissions` — purely a UX nicety (hide/disable what the backend
 * would reject anyway). The backend is the real enforcement point; see
 * `backend/src/auth/permissions.js`.
 */
export const useSession = () => {
  const transport = getTransport();
  return useQuery<SessionUser | null>({
    queryKey: ['session'],
    queryFn: () => transport.auth.me(),
    retry: false,
    staleTime: 5 * 60_000,
  });
};
