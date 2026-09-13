/**
 * ipcTransport — the Electron `Transport` implementation (T-91). Talks to
 * `window.idp.*` (see `desktop/preload/index.js`), which forwards to
 * `ipcMain.handle(...)` in the main process (`desktop/main/ipc/*.js`)
 * instead of `fetch`/`EventSource` against an HTTP backend — there is no
 * HTTP backend in the Electron build anymore (T-90's embedded server is
 * gone; see `desktop/README.md`).
 *
 * Every method here is a near-literal translation of `httpTransport.ts`'s
 * same method, with two structural differences:
 *
 *   1. Error shape: `desktop/main/ipc/helpers.js`'s `ipcHandler()` catches
 *      every thrown error and re-throws `new Error(JSON.stringify({
 *      __idpError: true, kind, message, details? }))`. Electron's
 *      `ipcRenderer.invoke` further wraps that into
 *      `"Error invoking remote method '<channel>': Error: <our JSON>"` —
 *      `parseIpcError()` below undoes both wrapping layers and reconstructs
 *      an `Error` carrying `.kind`/`.details`, so callers (and this file's
 *      own methods) can keep throwing plain `Error`s with a useful
 *      `.message`, exactly like `httpTransport.ts` does with
 *      `readErrorMessage()`.
 *
 *   2. Live log streaming: no `EventSource`/SSE. `subscribeLogs()` mints a
 *      `subscriptionId`, registers its handlers against
 *      `window.idp.deploy.onLogEvent` FIRST (synchronously, before the
 *      async `subscribeLogs` IPC call even resolves) so no replayed line
 *      can arrive before the listener exists, then asks the main process to
 *      start the subscription. See `desktop/main/ipc/deployLogBridge.js`
 *      for the late-join replay contract this relies on.
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
  VpnSession,
  HostKeyRecord,
  ApiUser,
  CreateUserInput,
  UpdateUserInput,
  AuditLog,
  PmpTestConnectionResult,
  ConnectionTestResult,
  RunnerAgent,
  RunnerEnrollment,
} from './types';

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'aborted']);

interface IdpErrorPayload {
  __idpError: true;
  kind: string;
  message: string;
  details?: unknown;
}

/** An `Error` reconstructed from a serialized `core/errors.js` typed error, carrying `.kind`/`.details` so callers can branch on it instead of only reading `.message`. */
export class IpcTransportError extends Error {
  kind: string;
  details?: unknown;

  constructor(payload: IdpErrorPayload) {
    super(payload.message);
    this.name = 'IpcTransportError';
    this.kind = payload.kind;
    this.details = payload.details;
  }
}

/**
 * Undoes Electron's IPC error wrapping and reconstructs a typed error.
 *
 * `ipcRenderer.invoke` rejects with a plain `Error` whose `.message` is
 * `"Error invoking remote method '<channel>': " + String(thrownError)`.
 * Since the main-process handler always throws `new Error(JSON.stringify(...))`
 * (see `desktop/main/ipc/helpers.js`), the tail of that message is exactly
 * our JSON payload — extracted here by scanning for the first `{`, which is
 * safe because nothing follows the JSON payload in the wrapped message.
 */
function parseIpcError(err: unknown): Error {
  if (!(err instanceof Error)) {
    return new Error('Unknown IPC error');
  }

  const start = err.message.indexOf('{');
  if (start === -1) return err;

  try {
    const parsed = JSON.parse(err.message.slice(start)) as IdpErrorPayload;
    if (parsed && parsed.__idpError) {
      return new IpcTransportError(parsed);
    }
  } catch {
    // Not our JSON payload — fall through to the raw error below.
  }
  return err;
}

/** Wraps a `window.idp.*` promise so every rejection becomes a `parseIpcError()`-processed `Error`. */
async function call<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    throw parseIpcError(err);
  }
}

/** Same as `call()`, for the desktop-only IPC calls `remoteTransport.ts` still makes in remote mode. */
export { call as callIpc };

/** @returns the `window.idp` bridge, throwing a clear error if this file is somehow used outside Electron. */
function bridge() {
  const idp = typeof window === 'undefined' ? undefined : window.idp;
  if (!idp) {
    throw new Error('ipcTransport used outside the Electron renderer (window.idp is unavailable).');
  }
  if (idp.mode === 'remote') {
    throw new Error('ipcTransport used in remote mode — business calls go over HTTP there (see remoteTransport.ts).');
  }
  return idp;
}

export const ipcTransport: Transport = {
  auth: {
    async login(username, password): Promise<SessionUser> {
      return call(bridge().auth.login(username, password));
    },
    async logout(): Promise<void> {
      await call(bridge().auth.logout());
    },
    async me(): Promise<SessionUser | null> {
      return call(bridge().auth.me());
    },
  },

  projects: {
    async list(): Promise<Project[]> {
      return call(bridge().projects.list());
    },
    async get(id: string): Promise<Project> {
      return call(bridge().projects.get(id));
    },
    async create(input: CreateProjectInput): Promise<Project> {
      return call(bridge().projects.create(input));
    },
    async updateConfig(id: string, config: ProjectConfig): Promise<Project> {
      return call(bridge().projects.updateConfig(id, config));
    },
    async remove(id: string): Promise<void> {
      await call(bridge().projects.remove(id));
    },
    async environments(id: string): Promise<ProjectEnvironmentsResult> {
      return call(bridge().projects.environments(id));
    },
    async telemetry(id: string): Promise<TelemetryData> {
      return call(bridge().projects.telemetry(id));
    },
    async testConnection(id: string, environment?: string): Promise<ConnectionTestResult> {
      return call(bridge().projects.testConnection(id, environment));
    },
  },

  deploy: {
    async trigger(projectId, parameters) {
      return call(bridge().deploy.trigger(projectId, parameters));
    },

    async abort(deploymentId) {
      await call(bridge().deploy.abort(deploymentId));
    },

    async submitMfa(deploymentId, code) {
      await call(bridge().deploy.submitMfa(deploymentId, code || ''));
    },

    async sessions(): Promise<DeploymentSession[]> {
      return call(bridge().deploy.sessions());
    },

    async history(projectId, limit): Promise<DeploymentHistoryEntry[]> {
      return call(bridge().deploy.history(projectId, limit));
    },

    async logsArchive(deploymentId): Promise<string> {
      return call(bridge().deploy.logsArchive(deploymentId));
    },

    /**
     * Live log stream over `window.idp.deploy.onLogEvent` instead of
     * `EventSource`. Mirrors httpTransport's contract exactly: replay of
     * buffered lines happens before this function returns control to the
     * caller's event loop turn in spirit (the main process sends the whole
     * replay batch synchronously inside its `subscribeLogs` handler before
     * returning — see `deployLogBridge.js`), a terminal status closes the
     * subscription, and the returned function tears everything down.
     */
    subscribeLogs(deploymentId, handlers: DeployLogSubscriptionHandlers) {
      const idp = bridge();
      const subscriptionId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `sub_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      let closed = false;

      const removeListener = idp.deploy.onLogEvent((payload) => {
        if (payload.subscriptionId !== subscriptionId || closed) return;

        switch (payload.type) {
          case 'log':
            handlers.onLog(payload.line as string, payload.index as number);
            break;
          case 'status': {
            const status = payload.status as string;
            handlers.onStatus(status);
            if (TERMINAL_STATUSES.has(status)) {
              cleanup();
            }
            break;
          }
          case 'end':
            handlers.onEnd(payload.message as string);
            cleanup();
            break;
          case 'error':
            handlers.onError();
            break;
          default:
            break;
        }
      });

      function cleanup() {
        if (closed) return;
        closed = true;
        removeListener();
      }

      // Fire the subscribe request AFTER the listener is registered above,
      // so a synchronously-delivered replay batch can never race ahead of
      // the handler that's supposed to receive it.
      idp.deploy.subscribeLogs(deploymentId, subscriptionId, 0).catch(() => {
        handlers.onError();
        handlers.onStatus('failed');
        cleanup();
      });

      return () => {
        cleanup();
        idp.deploy.unsubscribeLogs(subscriptionId).catch(() => {
          // Window may already be closing — nothing meaningful to do.
        });
      };
    },
  },

  artifacts: {
    async listReleases() { throw new Error('Artifact deploy yalnızca uzak backend modunda kullanılabilir.'); },
    async getRelease() { throw new Error('Artifact deploy yalnızca uzak backend modunda kullanılabilir.'); },
    async createRelease() { throw new Error('Artifact deploy yalnızca uzak backend modunda kullanılabilir.'); },
    async importRelease() { throw new Error('Artifact deploy yalnızca uzak backend modunda kullanılabilir.'); },
    async deleteRelease() { throw new Error('Artifact deploy yalnızca uzak backend modunda kullanılabilir.'); },
    async listTargets() { throw new Error('Artifact deploy yalnızca uzak backend modunda kullanılabilir.'); },
    async createTarget() { throw new Error('Artifact deploy yalnızca uzak backend modunda kullanılabilir.'); },
    async updateTarget() { throw new Error('Artifact deploy yalnızca uzak backend modunda kullanılabilir.'); },
    async deleteTarget() { throw new Error('Artifact deploy yalnızca uzak backend modunda kullanılabilir.'); },
    async refreshTarget() { throw new Error('Artifact deploy yalnızca uzak backend modunda kullanılabilir.'); },
    async deploy() { throw new Error('Artifact deploy yalnızca uzak backend modunda kullanılabilir.'); },
    async rollback() { throw new Error('Artifact deploy yalnızca uzak backend modunda kullanılabilir.'); },
    async events() { throw new Error('Artifact deploy yalnızca uzak backend modunda kullanılabilir.'); },
  },

  vpn: {
    async sessions(): Promise<VpnSession[]> {
      return call(bridge().vpn.sessions());
    },
    async clearProjectSession(projectId: string): Promise<void> {
      await call(bridge().vpn.clearProjectSession(projectId));
    },
    async forceDisconnect(): Promise<void> {
      await call(bridge().vpn.forceDisconnect());
    },
  },

  hostKeys: {
    async list(): Promise<HostKeyRecord[]> {
      return call(bridge().hostKeys.list());
    },
    async forget(host: string, port: number): Promise<void> {
      await call(bridge().hostKeys.forget(host, port));
    },
  },

  users: {
    async list(): Promise<ApiUser[]> {
      return call(bridge().users.list());
    },
    async create(input: CreateUserInput): Promise<ApiUser> {
      return call(bridge().users.create(input));
    },
    async update(id: string, patch: UpdateUserInput): Promise<ApiUser> {
      return call(bridge().users.update(id, patch));
    },
    async remove(id: string): Promise<void> {
      await call(bridge().users.remove(id));
    },
  },

  audit: {
    async list(limit): Promise<AuditLog[]> {
      return call(bridge().audit.list(limit));
    },
  },

  runners: {
    async list(): Promise<RunnerAgent[]> {
      return call(bridge().runners.list());
    },
    async createEnrollment(agentName: string): Promise<RunnerEnrollment> {
      return call(bridge().runners.createEnrollment(agentName));
    },
    async approveBootstrap(userCode: string) { return call(bridge().runners.approveBootstrap(userCode)); },
    async retire(agentId: string): Promise<void> {
      await call(bridge().runners.retire(agentId));
    },
    async getRelease() { return call(bridge().runners.getRelease()); },
    async listReleases() { return call(bridge().runners.listReleases()); },
    async activateRelease(releaseId: string) { await call(bridge().runners.activateRelease(releaseId)); },
    async createReleaseUploadToken() { return call(bridge().runners.createReleaseUploadToken()); },
  },

  agents: {
    async list(): Promise<import('./types').IdpAgent[]> {
      return call(bridge().agents.list());
    },
  },

  agentBuilder: {
    async build(input: import('./types').AgentBuildInput): Promise<import('./types').AgentBuildResult> {
      return call(bridge().agentBuilder.build(input));
    },
  },
  fileTransfer: {
    async selectFile() { return call(bridge().fileTransfer.selectFile()); },
    async upload(input: import('./types').FileTransferInput) { return call(bridge().fileTransfer.upload(input)); },
  },

  pmp: {
    async testConnection(config: PmpConfig): Promise<PmpTestConnectionResult> {
      return call(bridge().pmp.testConnection(config));
    },
  },
};
