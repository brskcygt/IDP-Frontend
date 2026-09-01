import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getTransport } from '../services/transport';
import type { DeploymentStatus, MfaEvent } from '../services/transport/types';

export type { DeploymentStatus, MfaEvent } from '../services/transport/types';

type UseDeploymentLogStreamReturn = {
  /** All log lines received so far */
  logs: string[];
  /** Current deployment status */
  status: DeploymentStatus;
  /** Whether the deployment is actively running */
  isDeploying: boolean;
  /** The active deployment ID (null if none) */
  deploymentId: string | null;
  /** Active MFA request event */
  mfaEvent: MfaEvent | null;
  /** Trigger a new deployment via the transport layer */
  triggerDeploy: (projectId: string, params: Record<string, unknown>) => Promise<void>;
  /** Abort the active deployment via the transport layer */
  abortDeploy: () => Promise<void>;
  /** Attach to an existing background deployment */
  attachToDeployment: (deploymentId: string) => void;
  /** Submit MFA response via the transport layer */
  submitMfa: (code?: string) => Promise<void>;
  /** Clear the log buffer */
  clearLogs: () => void;
};

/**
 * useDeploymentLogStream — live deployment log streaming hook.
 *
 * This hook provides a complete deployment lifecycle:
 * 1. Trigger a deployment via the transport layer
 * 2. Subscribe to the live log stream for real-time logs
 * 3. Auto-reconnect on connection loss (handled inside the transport)
 * 4. Abort via the transport layer
 * 5. Auto-scroll support via ref callback
 *
 * All actual `fetch`/`EventSource` plumbing lives in
 * `services/transport/httpTransport.ts` — this hook only owns UI-facing
 * state and the parsing of the `__EVENT__:` MFA control-message convention
 * embedded in ordinary log lines. That split keeps this hook unchanged when
 * the transport implementation eventually becomes IPC-backed in Electron.
 *
 * Usage:
 * ```tsx
 * const { logs, status, isDeploying, triggerDeploy, abortDeploy, clearLogs } = useDeploymentLogStream();
 * ```
 */
export function useDeploymentLogStream(): UseDeploymentLogStreamReturn {
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<DeploymentStatus>('idle');
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  const [mfaEvent, setMfaEvent] = useState<MfaEvent | null>(null);
  const queryClient = useQueryClient();
  const transportRef = useRef(getTransport());
  const unsubscribeRef = useRef<(() => void) | null>(null);

  /**
   * Subscribe to the live log stream for a given deployment ID.
   */
  const connectToStream = useCallback((depId: string) => {
    // Tear down any existing subscription first.
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    unsubscribeRef.current = transportRef.current.deploy.subscribeLogs(depId, {
      onLog: (line) => {
        if (line.startsWith('__EVENT__:')) {
          try {
            const ev = JSON.parse(line.slice(10)) as { type: string; payload?: unknown };
            if (ev.type === 'MFA_REQUIRED' || ev.type === 'MFA_NUMBER_MATCHING') {
              setMfaEvent(ev as MfaEvent);
            } else if (ev.type === 'MFA_NUMBER_MATCHING_SUCCESS' || ev.type === 'MFA_RESOLVED') {
              setMfaEvent(null);
            }
          } catch {
            setLogs((prev) => [...prev, line]);
          }
        } else {
          setLogs((prev) => [...prev, line]);
        }
      },

      onStatus: (nextStatusValue) => {
        const nextStatus = nextStatusValue as DeploymentStatus;
        setStatus(nextStatus);

        if (nextStatus === 'succeeded' || nextStatus === 'failed' || nextStatus === 'aborted') {
          unsubscribeRef.current = null;

          // The backend stamps project.status / lastDeploy when a deployment
          // settles; refetch so the card stops showing "Deploying" without
          // polling the project list on a timer.
          // Clear any outstanding MFA challenge. The prompt is modal and has no
          // dismiss of its own, so leaving it set after the deployment ends
          // traps the operator behind a dialog for a run that is already over.
          setMfaEvent(null);

          queryClient.invalidateQueries({ queryKey: ['projects'] });
          // The deployment row was just written by the backend; without this the
          // project row keeps showing the previous run's outcome and duration
          // until the query goes stale or the window regains focus.
          queryClient.invalidateQueries({ queryKey: ['deployment-history'] });
        }
      },

      onEnd: (message) => {
        setLogs((prev) => [...prev, `[Stream] ${message}`]);
        unsubscribeRef.current = null;
      },

      onError: () => {
        setLogs((prev) => [...prev, '[Stream] Connection lost. Reconnecting...']);
      },
    });
  }, [queryClient]);

  /**
   * Trigger a new deployment via the transport layer, then subscribe to logs.
   */
  const triggerDeploy = useCallback(async (projectId: string, params: Record<string, unknown>) => {
    // Clear previous state
    setLogs([`Triggering deployment for project ${projectId}...`]);
    setStatus('connecting');
    setDeploymentId(null);

    try {
      const { deploymentId: depId } = await transportRef.current.deploy.trigger(projectId, params);

      setDeploymentId(depId);
      setStatus('running');
      setLogs((prev) => [...prev, `Deployment started: ${depId}`, 'Connecting to log stream...']);

      connectToStream(depId);
    } catch (err: unknown) {
      setStatus('failed');
      const message = err instanceof Error ? err.message : 'Unknown error';
      setLogs((prev) => [...prev, `ERROR: ${message}`]);
    }
  }, [connectToStream]);

  /**
   * Attach to an existing deployment session.
   */
  const attachToDeployment = useCallback((depId: string) => {
    setLogs([`Attaching to existing deployment session: ${depId}...`]);
    setStatus('connecting');
    setDeploymentId(depId);
    setMfaEvent(null);
    connectToStream(depId);
  }, [connectToStream]);

  /**
   * Abort the active deployment via the transport layer.
   */
  const abortDeploy = useCallback(async () => {
    if (!deploymentId) return;

    try {
      await transportRef.current.deploy.abort(deploymentId);
      setStatus('aborted');
      setMfaEvent(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setLogs((prev) => [...prev, `ERROR: Failed to abort: ${message}`]);
    }
  }, [deploymentId]);

  /**
   * Submit MFA code to the active deployment.
   */
  const submitMfa = useCallback(async (code?: string) => {
    if (!deploymentId) return;

    try {
      await transportRef.current.deploy.submitMfa(deploymentId, code);
      setMfaEvent(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setLogs((prev) => [...prev, `ERROR: Failed to submit MFA: ${message}`]);
    }
  }, [deploymentId]);

  /**
   * Clear the log buffer and reset state.
   */
  const clearLogs = useCallback(() => {
    setLogs([]);
    setStatus('idle');
    setDeploymentId(null);
    setMfaEvent(null);
  }, []);

  /**
   * Cleanup on unmount.
   */
  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, []);

  return {
    logs,
    status,
    isDeploying: status === 'running' || status === 'connecting',
    deploymentId,
    mfaEvent,
    triggerDeploy,
    abortDeploy,
    attachToDeployment,
    submitMfa,
    clearLogs,
  };
}
