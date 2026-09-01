import { useQuery } from '@tanstack/react-query';
import { getTransport } from '../services/transport';
import type { TelemetryData } from '../services/transport/types';

export type { TelemetryData } from '../services/transport/types';

/**
 * Every poll opens a real SSH/WinRM session against the target server, and for
 * PMP-backed projects it also resolves a credential from the vault. At one
 * minute per project that was a meaningful load on both — and it kept polling
 * against servers nobody was looking at. Five minutes is still fresh enough for
 * a health badge.
 */
const TELEMETRY_POLL_MS = 5 * 60 * 1000;

/**
 * `enabled` is the caller's own gate (e.g. "is this a host-backed
 * provider?") — callers should additionally fold the project's own
 * `config.telemetryEnabled` (T-18b, default `false`) into it before passing
 * it here, so a project with telemetry turned off never fires the initial
 * request either, not just the recurring poll. See HostLoadCell.tsx.
 */
export const useTelemetry = (projectId: string, enabled: boolean = true) => {
  const transport = getTransport();
  return useQuery<TelemetryData>({
    queryKey: ['telemetry', projectId],
    queryFn: () => transport.projects.telemetry(projectId),
    enabled,
    // T-18b: once a poll comes back 'disabled' (telemetry turned off for
    // this project), stop the recurring refetch entirely rather than
    // hitting the endpoint every 5 minutes just to get the same answer —
    // belt-and-suspenders alongside the `enabled` gate above, in case the
    // caller's own flag lags a settings change until its next re-render.
    refetchInterval: (query) => (query.state.data?.status === 'disabled' ? false : TELEMETRY_POLL_MS),
    // Don't keep hammering servers while the dashboard sits in a background tab.
    refetchIntervalInBackground: false,
    staleTime: TELEMETRY_POLL_MS,
    // An unreachable server is a normal, expected state here — it's rendered as
    // an "offline" badge. Retrying multiplies connection attempts for no gain.
    retry: false,
  });
};
