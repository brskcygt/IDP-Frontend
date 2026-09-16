/**
 * httpTransport — today's `Transport` implementation: `fetch` against the
 * Express backend for request/response calls, `EventSource` for the live
 * deployment log stream.
 *
 * This is a straight relocation of what used to live in `services/api.ts`
 * and inline inside `hooks/useDeploymentLogStream.ts` — behavior is
 * preserved line-for-line, including quirks (e.g. `abort` not
 * checking `response.ok`, `trigger` letting a non-JSON error body reject
 * with a raw parse error). Do not "fix" those here; they're preserved on
 * purpose so this refactor stays behavior-neutral. See T-59.
 */
import type { ProjectConfig, PmpConfig } from '../../types/project';
import type {
  Transport,
  SessionUser,
  Project,
  CreateProjectInput,
  ProjectEnvironmentsResult,
  TelemetryData,
  DeploymentSession,
  DeploymentHistoryEntry,
  DeployLogSubscriptionHandlers,
  HostKeyRecord,
  ApiUser,
  CreateUserInput,
  UpdateUserInput,
  AuditLog,
  PmpTestConnectionResult,
  ConnectionTestResult,
  RunnerAgent,
  RunnerEnrollment,
  ArtifactRelease,
  ArtifactReleaseDetails,
  ArtifactBuildRunResult,
  DeployTarget,
  DeployTargetInput,
  UpdateDeployTargetInput,
  ArtifactDeployRunResult,
  ArtifactEventsResult,
} from './types';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** Extracts `{ error }` from a failed response body, falling back to `fallback`. */
async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    return typeof body?.error === 'string' ? body.error : fallback;
  } catch {
    return fallback;
  }
}

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'aborted']);

/**
 * Builds an `httpTransport` bound to `baseUrl`.
 *
 * `baseUrl` defaults to `''`, preserving today's behavior exactly: every
 * request stays relative (e.g. `fetch('/api/projects')`), resolved by the
 * browser against the current origin — and in dev, proxied by Vite to the
 * Express server (see `frontend/vite.config.ts`).
 *
 * When running inside Electron (T-90), `getTransport()` (see `./index.ts`)
 * passes the embedded backend's actual `http://127.0.0.1:<port>` address
 * here instead, since there's no dev-server proxy in that context.
 */
export function createHttpTransport(baseUrl: string = ''): Transport {
  return {
  auth: {
    async login(username, password) {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Invalid credentials'));
      }
      const data = await response.json();
      return data.user as SessionUser;
    },

    async logout() {
      // Mirrors the original App.tsx handleLogout: fire the request, don't
      // inspect the response — the caller always proceeds to clear local
      // auth state either way.
      await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST' });
    },

    async me() {
      const response = await fetch(`${baseUrl}/api/auth/me`);
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      return (data.user ?? null) as SessionUser | null;
    },
  },

  projects: {
    async list(): Promise<Project[]> {
      const response = await fetch(`${baseUrl}/api/projects`);
      if (!response.ok) {
        throw new Error('Failed to fetch projects');
      }
      return response.json();
    },

    async get(id: string): Promise<Project> {
      const response = await fetch(`${baseUrl}/api/projects/${id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch project');
      }
      return response.json();
    },

    async create(input: CreateProjectInput): Promise<Project> {
      const response = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw new Error('Failed to create project');
      }
      return response.json();
    },

    async updateConfig(id: string, config: ProjectConfig): Promise<Project> {
      const response = await fetch(`${baseUrl}/api/projects/${id}/settings`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(config),
      });
      if (!response.ok) {
        throw new Error('Failed to update project settings');
      }
      return response.json();
    },

    async remove(id: string): Promise<void> {
      const response = await fetch(`${baseUrl}/api/projects/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error('Failed to delete project');
      }
      await response.json();
    },

    async environments(id: string): Promise<ProjectEnvironmentsResult> {
      const response = await fetch(`${baseUrl}/api/projects/${id}/environments`);
      if (!response.ok) throw new Error('Failed to fetch project environments');
      return response.json();
    },

    async telemetry(id: string): Promise<TelemetryData> {
      const response = await fetch(`${baseUrl}/api/projects/${id}/telemetry`);
      if (!response.ok) throw new Error('Failed to fetch telemetry');
      return response.json();
    },

    async testConnection(id: string, environment?: string): Promise<ConnectionTestResult> {
      const response = await fetch(`${baseUrl}/api/projects/${id}/test-connection`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(environment ? { environment } : {}),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to test the connection'));
      }
      return response.json();
    },
  },

  deploy: {
    async trigger(projectId, parameters) {
      const response = await fetch(`${baseUrl}/api/deploy/trigger`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ projectId, parameters }),
      });

      if (!response.ok) {
        // Preserves the original: an unparsable error body rejects with the
        // raw JSON parse error rather than a friendly fallback message.
        const error = await response.json();
        throw new Error(error.error || 'Failed to trigger deployment');
      }

      const data = await response.json();
      return { deploymentId: data.deploymentId };
    },

    async abort(deploymentId) {
      // Intentionally does not check response.ok — matches the original
      // hook, which always resolves (and the caller always moves to
      // "aborted") regardless of what the server actually reported.
      await fetch(`${baseUrl}/api/deploy/${deploymentId}/abort`, { method: 'POST' });
    },

    async sessions(): Promise<DeploymentSession[]> {
      const response = await fetch(`${baseUrl}/api/deploy/sessions`);
      if (!response.ok) {
        throw new Error('Failed to fetch deployment sessions');
      }
      return response.json();
    },

    async history(projectId, limit): Promise<DeploymentHistoryEntry[]> {
      const params = new URLSearchParams();
      if (projectId) params.set('projectId', projectId);
      if (limit !== undefined) params.set('limit', String(limit));
      const qs = params.toString();
      const response = await fetch(`${baseUrl}/api/deploy/history${qs ? `?${qs}` : ''}`);
      if (!response.ok) {
        throw new Error('Failed to fetch deployment history');
      }
      return response.json();
    },

    async logsArchive(deploymentId): Promise<string> {
      const response = await fetch(`${baseUrl}/api/deploy/${deploymentId}/logs-archive`);
      if (!response.ok) {
        throw new Error('Failed to fetch deployment log archive');
      }
      return response.text();
    },

    /**
     * Live log stream, backed by EventSource. This is the exact reconnect /
     * Last-Event-ID / terminal-status / disconnect-warning behavior that
     * used to live inline in `useDeploymentLogStream`'s `connectToSSE`,
     * relocated verbatim:
     *
     * - EventSource's own built-in reconnect (with `Last-Event-ID`) is the
     *   only reconnect logic — no manual reconnect is layered on top.
     * - A "Connection lost" warning is surfaced at most once per drop
     *   (reset on the next successful open).
     * - If the browser gives up entirely (readyState CLOSED — e.g. the
     *   deployment id was never valid), that's reported as a terminal
     *   'failed' status instead of leaving the UI stuck reconnecting.
     * - The stream is closed once the deployment reaches a terminal status,
     *   or once the server sends an `end` event.
     */
    subscribeLogs(deploymentId, handlers: DeployLogSubscriptionHandlers) {
      const eventSource = new EventSource(`${baseUrl}/api/deploy/logs/${deploymentId}`);
      let hasWarnedDisconnect = false;

      eventSource.addEventListener('log', (event: MessageEvent) => {
        const index = Number(event.lastEventId);
        try {
          const data = JSON.parse(event.data);
          const line = typeof data.line === 'string' ? data.line : event.data;
          handlers.onLog(line, index);
        } catch {
          // Raw text fallback
          handlers.onLog(event.data, index);
        }
      });

      eventSource.addEventListener('status', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          const nextStatus = data.status as string;

          // Close explicitly once the deployment reaches a terminal status
          // so EventSource doesn't keep the connection (and its built-in
          // reconnect loop) alive after there's nothing left to stream.
          if (TERMINAL_STATUSES.has(nextStatus)) {
            eventSource.close();
          }

          handlers.onStatus(nextStatus);
        } catch {
          // ignore
        }
      });

      eventSource.addEventListener('end', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          handlers.onEnd(data.message);
        } catch {
          // ignore
        }
        eventSource.close();
      });

      eventSource.onerror = () => {
        // EventSource has built-in auto-reconnect and automatically sends
        // back the id of the last event it received via the `Last-Event-ID`
        // header, so the server can resume the stream instead of replaying
        // logs the client already has. We don't need (and must not add) a
        // second, manual reconnect on top of that — doing so was the root
        // cause of duplicated log replay on reconnect.
        if (!hasWarnedDisconnect) {
          hasWarnedDisconnect = true;
          handlers.onError();
        }

        // If the browser has given up entirely (e.g. the initial request
        // failed, like a 404 for an unknown deployment), readyState becomes
        // CLOSED and EventSource will NOT retry on its own. Surface that as
        // a terminal failure instead of leaving the UI stuck.
        if (eventSource.readyState === EventSource.CLOSED) {
          handlers.onStatus('failed');
        }
      };

      eventSource.onopen = () => {
        hasWarnedDisconnect = false; // Reset so the next real drop can warn again
      };

      return () => {
        eventSource.close();
      };
    },
  },

  artifacts: {
    async listReleases(projectId: string): Promise<ArtifactRelease[]> {
      const response = await fetch(`${baseUrl}/api/projects/${encodeURIComponent(projectId)}/releases`);
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to fetch artifact releases'));
      }
      return response.json();
    },

    async getRelease(id: string): Promise<ArtifactReleaseDetails> {
      const response = await fetch(`${baseUrl}/api/releases/${encodeURIComponent(id)}`);
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to fetch artifact release'));
      }
      return response.json();
    },

    async createRelease(
      projectId: string,
      input: { version: string; ref?: string },
    ): Promise<ArtifactBuildRunResult> {
      const response = await fetch(`${baseUrl}/api/projects/${encodeURIComponent(projectId)}/releases`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to create artifact release'));
      }
      return response.json();
    },

    async importRelease(projectId: string, version: string): Promise<ArtifactReleaseDetails> {
      const response = await fetch(`${baseUrl}/api/projects/${encodeURIComponent(projectId)}/releases/import`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ version }),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to import artifact release'));
      }
      return response.json();
    },

    async deleteRelease(id: string): Promise<void> {
      const response = await fetch(`${baseUrl}/api/releases/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to delete artifact release'));
      }
    },

    async listTargets(projectId: string): Promise<DeployTarget[]> {
      const response = await fetch(`${baseUrl}/api/projects/${encodeURIComponent(projectId)}/targets`);
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to fetch deploy targets'));
      }
      return response.json();
    },

    async createTarget(projectId: string, input: DeployTargetInput): Promise<DeployTarget> {
      const response = await fetch(`${baseUrl}/api/projects/${encodeURIComponent(projectId)}/targets`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to create deploy target'));
      }
      return response.json();
    },

    async updateTarget(id: string, input: UpdateDeployTargetInput): Promise<DeployTarget> {
      const response = await fetch(`${baseUrl}/api/targets/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to update deploy target'));
      }
      return response.json();
    },

    async deleteTarget(id: string): Promise<void> {
      const response = await fetch(`${baseUrl}/api/targets/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to delete deploy target'));
      }
    },

    async refreshTarget(id: string): Promise<DeployTarget> {
      const response = await fetch(`${baseUrl}/api/targets/${encodeURIComponent(id)}/refresh-status`, { method: 'POST' });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to refresh deploy target status'));
      }
      return response.json();
    },

    async applyConfig(id: string, input: { confirmation?: string } = {}) {
      const response = await fetch(`${baseUrl}/api/targets/${encodeURIComponent(id)}/apply-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to apply target runtime config'));
      }
      return response.json();
    },

    async deploy(
      targetId: string,
      input: { releaseId: string; components?: string[]; confirmation?: string },
    ): Promise<ArtifactDeployRunResult> {
      const response = await fetch(`${baseUrl}/api/targets/${encodeURIComponent(targetId)}/deploy`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to deploy artifact release'));
      }
      return response.json();
    },

    async rollback(
      targetId: string,
      input: { components?: string[]; confirmation?: string },
    ): Promise<ArtifactDeployRunResult> {
      const response = await fetch(`${baseUrl}/api/targets/${encodeURIComponent(targetId)}/rollback`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to roll back artifact target'));
      }
      return response.json();
    },

    async events(deploymentId: string): Promise<ArtifactEventsResult> {
      const response = await fetch(`${baseUrl}/api/deployments/${encodeURIComponent(deploymentId)}/events`);
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to fetch artifact deployment events'));
      }
      return response.json();
    },
  },

  hostKeys: {
    async list(): Promise<HostKeyRecord[]> {
      const response = await fetch(`${baseUrl}/api/host-keys`);
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to fetch host keys'));
      }
      return response.json();
    },

    async forget(host: string, port: number): Promise<void> {
      const response = await fetch(`${baseUrl}/api/host-keys/${encodeURIComponent(host)}/${port}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to forget host key'));
      }
    },
  },

  users: {
    async list(): Promise<ApiUser[]> {
      const response = await fetch(`${baseUrl}/api/users`);
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to fetch users'));
      }
      return response.json();
    },

    async create(input: CreateUserInput): Promise<ApiUser> {
      const response = await fetch(`${baseUrl}/api/users`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to create user'));
      }
      return response.json();
    },

    async update(id: string, patch: UpdateUserInput): Promise<ApiUser> {
      const response = await fetch(`${baseUrl}/api/users/${id}`, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify(patch),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to update user'));
      }
      return response.json();
    },

    async remove(id: string): Promise<void> {
      const response = await fetch(`${baseUrl}/api/users/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to delete user'));
      }
    },
  },

  audit: {
    async list(limit): Promise<AuditLog[]> {
      const qs = limit !== undefined ? `?limit=${limit}` : '';
      const response = await fetch(`${baseUrl}/api/audit-logs${qs}`);
      if (!response.ok) {
        throw new Error('Failed to fetch audit logs');
      }
      return response.json();
    },
  },

  runners: {
    async list(): Promise<RunnerAgent[]> {
      throw new Error('Cloudflare runner discovery is available in the desktop application only.');
    },
    async createEnrollment(_agentName: string): Promise<RunnerEnrollment> {
      throw new Error('Runner enrollment is available in the desktop application only.');
    },
    async approveBootstrap(_userCode: string) { throw new Error('Runner bootstrap approval is available in the desktop application only.'); },
    async retire(_agentId: string): Promise<void> {
      throw new Error('Runner retirement is available in the desktop application only.');
    },
    async getRelease() { throw new Error('Runner releases are available in the desktop application only.'); },
    async listReleases() { throw new Error('Runner releases are available in the desktop application only.'); },
    async activateRelease(_releaseId: string) { throw new Error('Runner release activation is available in the desktop application only.'); },
    async createReleaseUploadToken() { throw new Error('Runner release publishing is available in the desktop application only.'); },
  },

  agents: {
    async list(): Promise<import('./types').IdpAgent[]> {
      const response = await fetch(`${baseUrl}/api/agents`, { credentials: 'include' });
      if (!response.ok) throw new Error(await readErrorMessage(response, 'Agent listesi alınamadı'));
      return response.json();
    },
  },

  agentBuilder: {
    async build(): Promise<import('./types').AgentBuildResult> {
      throw new Error('Agent JAR oluşturma yalnızca IDP masaüstü uygulamasında kullanılabilir.');
    },
  },
  pmp: {
    async testConnection(config: PmpConfig): Promise<PmpTestConnectionResult> {
      const response = await fetch(`${baseUrl}/api/pmp/test-connection`, {
        method: 'POST',
        headers: JSON_HEADERS,
        credentials: 'include',
        body: JSON.stringify(config),
      });
      return response.json();
    },
  },
  };
}

/** Default instance — relative paths, unchanged from pre-T-90 behavior. */
export const httpTransport: Transport = createHttpTransport();
