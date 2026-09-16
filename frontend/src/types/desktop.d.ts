/**
 * Type declaration for the `window.idp` bridge exposed by the Electron
 * preload script (`desktop/preload/index.js`) via `contextBridge`.
 *
 * T-91 (docs/03-ELECTRON-MIMARI.md §2 option B / §12 stage E5): the full
 * IPC business-logic bridge — one method per `Transport` operation (see
 * `services/transport/types.ts`), each backed by exactly one
 * `ipcMain.handle` channel in `desktop/main/ipc/*.js`. `window.idp` exists
 * only when the app is running inside the Electron shell; in a plain
 * browser tab it is `undefined`, and `getTransport()` (see
 * `services/transport/index.ts`) uses `httpTransport` instead.
 *
 * Every method here returns a `Promise` (backed by `ipcRenderer.invoke`,
 * which is always async) — this is the one shape difference from the
 * synchronous T-90 bridge (`getApiBaseUrl()`/`getVersion()` used
 * `sendSync`), and is exactly why `services/transport/ipcTransport.ts`
 * exists as a thin async wrapper rather than being used as `window.idp`
 * directly.
 */
import type {
  SessionUser,
  Project,
  CreateProjectInput,
  ProjectEnvironmentsResult,
  TelemetryData,
  ConnectionTestResult,
  TriggerDeployResult,
  DeploymentSession,
  DeploymentHistoryEntry,
  HostKeyRecord,
  ApiUser,
  CreateUserInput,
  UpdateUserInput,
  AuditLog,
  PmpTestConnectionResult,
  RunnerAgent,
  RunnerEnrollment,
  RunnerRelease,
  RunnerReleaseHistory,
  RunnerReleaseUploadToken,
} from '../services/transport/types';
import type { ProjectConfig, PmpConfig } from './project';

/** One event pushed over the shared `idp:deploy:log-event` channel — see `desktop/main/ipc/deployLogBridge.js`. */
export type IdpDeployLogEvent =
  | { subscriptionId: string; deploymentId: string; type: 'log'; line: string; index: number }
  | { subscriptionId: string; deploymentId: string; type: 'status'; status: string }
  | { subscriptionId: string; deploymentId: string; type: 'end'; message: string }
  | { subscriptionId: string; deploymentId: string; type: 'error' };

export type IdpUpdateState =
  | { status: 'idle' }
  | { status: 'available'; version: string; currentVersion: string; notes: string }
  | { status: 'downloading'; version: string; notes: string; progress: number }
  | { status: 'installing'; version: string; notes: string; progress: number }
  | { status: 'error'; version: string; message: string };

export interface IdpDesktopBridge {
  /** Local (embedded backend) mode. Optional so an older preload without the field still reads as local. */
  mode?: 'local';
  auth: {
    login(username: string, password: string): Promise<SessionUser>;
    logout(): Promise<void>;
    me(): Promise<SessionUser | null>;
  };
  projects: {
    list(): Promise<Project[]>;
    get(id: string): Promise<Project>;
    create(input: CreateProjectInput): Promise<Project>;
    updateConfig(id: string, config: ProjectConfig): Promise<Project>;
    remove(id: string): Promise<void>;
    environments(id: string): Promise<ProjectEnvironmentsResult>;
    telemetry(id: string): Promise<TelemetryData>;
    testConnection(id: string, environment?: string): Promise<ConnectionTestResult>;
  };
  deploy: {
    trigger(projectId: string, parameters: Record<string, unknown>): Promise<TriggerDeployResult>;
    abort(deploymentId: string): Promise<void>;
    sessions(): Promise<DeploymentSession[]>;
    history(projectId?: string, limit?: number): Promise<DeploymentHistoryEntry[]>;
    logsArchive(deploymentId: string): Promise<string>;
    /** Starts (or resumes) a live log subscription — see `deployLogBridge.js`'s late-join replay contract. */
    subscribeLogs(deploymentId: string, subscriptionId: string, fromIndex?: number): Promise<void>;
    unsubscribeLogs(subscriptionId: string): Promise<void>;
    /** Registers a listener for every deploy-log event; returns an unsubscribe function. `ipcRenderer` is never exposed directly. */
    onLogEvent(callback: (payload: IdpDeployLogEvent) => void): () => void;
  };
  hostKeys: {
    list(): Promise<HostKeyRecord[]>;
    forget(host: string, port: number): Promise<void>;
  };
  users: {
    list(): Promise<ApiUser[]>;
    create(input: CreateUserInput): Promise<ApiUser>;
    update(id: string, patch: UpdateUserInput): Promise<ApiUser>;
    remove(id: string): Promise<void>;
  };
  audit: {
    list(limit?: number): Promise<AuditLog[]>;
  };
  runners: {
    list(): Promise<RunnerAgent[]>;
    createEnrollment(agentName: string): Promise<RunnerEnrollment>;
    approveBootstrap(userCode: string): Promise<{ ok: true; sessionId: string; agentName: string; approved: true }>;
    retire(agentId: string): Promise<void>;
    getRelease(): Promise<RunnerRelease | null>;
    listReleases(): Promise<RunnerReleaseHistory[]>;
    activateRelease(releaseId: string): Promise<void>;
    createReleaseUploadToken(): Promise<RunnerReleaseUploadToken>;
  };
  agents: {
    list(): Promise<import('@/services/transport/types').IdpAgent[]>;
  };
  agentBuilder: {
    build(input: import('@/services/transport/types').AgentBuildInput): Promise<import('@/services/transport/types').AgentBuildResult>;
  };
  fileTransfer: {
    selectFile(): Promise<import('@/services/transport/types').SelectedTransferFile>;
    upload(input: import('@/services/transport/types').FileTransferInput): Promise<import('@/services/transport/types').FileTransferResult>;
  };
  pmp: {
    testConnection(config: PmpConfig): Promise<PmpTestConnectionResult>;
  };
  update: {
    getVersion(): Promise<string>;
    getState(): Promise<IdpUpdateState>;
    install(): Promise<void>;
    dismiss(): Promise<void>;
    onState(callback: (state: IdpUpdateState) => void): () => void;
  };
}

/**
 * Remote mode (`IDP_SERVER_URL` set for the desktop app — see
 * `desktop/main/remoteBackend.js`): the renderer is served from `app://idp`
 * and reaches the remote server over same-origin HTTP (`/api/*`, forwarded
 * by the main process), so the bridge carries only desktop-only features.
 */
export interface IdpRemoteDesktopBridge {
  mode: 'remote';
  agentBuilder: IdpDesktopBridge['agentBuilder'];
  update: IdpDesktopBridge['update'];
}

declare global {
  interface Window {
    /** Present only inside the Electron renderer; absent in the browser. `mode` tells the two desktop bridges apart. */
    idp?: IdpDesktopBridge | IdpRemoteDesktopBridge;
  }
}
