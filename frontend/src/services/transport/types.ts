/**
 * Transport — the single boundary between the React app and "however we
 * talk to the backend right now."
 *
 * Two implementations: `httpTransport` (fetch + EventSource against the
 * Express server) and `remoteTransport`, which is `httpTransport` against
 * `app://idp` plus the desktop-only namespaces that go over IPC. Nothing
 * outside `services/transport/` knows which one is in use.
 *
 * Field names below intentionally mirror the current REST/SSE contract
 * (see `backend/src/server.js` and `backend/src/routes/deploy.js`) so the
 * HTTP implementation is a near-literal translation of this interface.
 */
import type {
  ArtifactHealthConfig,
  ArtifactOs,
  ArtifactRuntimeConfig,
  ArtifactSourcePlatform,
  ProjectConfig,
  PmpConfig,
} from '../../types/project';

// --- Auth --------------------------------------------------------------

export type Role = 'admin' | 'deployer' | 'viewer';

export interface SessionUser {
  username: string;
  role: Role;
}

// --- Projects ------------------------------------------------------------

export interface Project {
  id: string;
  name: string;
  tenant: string;
  environment: string;
  provider: string;
  status: 'Idle' | 'Deploying' | 'Succeeded' | 'Failed';
  lastDeploy: string;
  config?: ProjectConfig;
}

export interface CreateProjectInput {
  name: string;
  tenant: string;
  environment: string;
  provider: string;
}

export interface ProjectEnvironmentsResult {
  /** Environment names with a configured override, e.g. `["Dev", "Prod"]`. */
  configured: string[];
  /** True when at least one environment override is configured. */
  hasOverrides: boolean;
}

/**
 * T-73: a single diagnostic check from `POST /api/projects/:id/test-connection`.
 * `ok: null` means "not tested" (e.g. an earlier check in the chain failed
 * first, or testing it for real would require a live vault credential fetch
 * — see backend/src/core/diagnostics/connectionTest.js —
 * distinct from `false`, which means the check actually ran and failed.
 */
export interface ConnectionCheckResult {
  name: string;
  ok: boolean | null;
  detail: string;
}

export interface ConnectionTestResult {
  /** True only when every check that actually ran (`ok !== null`) passed. */
  ok: boolean;
  checks: ConnectionCheckResult[];
}

export interface TelemetryData {
  /**
   * `'disabled'` (T-18b): the project has `config.telemetryEnabled` unset
   * or `false` — the backend never opened an SSH/WinRM session to produce
   * this response. The UI must not render an "offline" badge for it; that
   * would incorrectly imply a reachability probe actually ran.
   */
  status: 'online' | 'offline' | 'unknown' | 'disabled';
  cpu?: number;
  ramUsed?: number;
  ramTotal?: number;
  ramPercent?: number;
}

// --- Deploy --------------------------------------------------------------

export type DeploymentStatus = 'idle' | 'connecting' | 'running' | 'succeeded' | 'failed' | 'aborted';

export interface TriggerDeployResult {
  deploymentId: string;
}

export interface DeploymentSession {
  id: string;
  projectId: string;
  status: 'pending' | 'connecting' | 'running' | 'succeeded' | 'failed' | 'aborted';
  startedAt: string;
  logCount: number | null;
}

export interface DeploymentHistoryEntry {
  id: string;
  projectId: string;
  status: string;
  startedAt: string;
  [key: string]: unknown;
}

/** Handlers a caller passes to `subscribeLogs` for a live log stream. */
export interface DeployLogSubscriptionHandlers {
  /** A single log line. `index` is the server's monotonic event index — used
   * today to resume an SSE stream via `Last-Event-ID` without replaying
   * lines the client already has. */
  onLog(line: string, index: number): void;
  onStatus(status: string): void;
  onEnd(message: string): void;
  /** Fired when the connection is lost (before any built-in reconnect). */
  onError(): void;
}

// --- Host keys ---------------------------------------------------------

export interface HostKeyRecord {
  host: string;
  port: number;
  keyType: string;
  fingerprint: string;
  firstSeen: string;
  lastSeen: string;
}

// --- Users ---------------------------------------------------------------

export interface ApiUser {
  id: string;
  username: string;
  role: Role;
  createdAt: string;
}

export interface CreateUserInput {
  username: string;
  password: string;
  role: string;
}

export interface UpdateUserInput {
  role?: string;
  password?: string;
}

// --- Audit -----------------------------------------------------------------

export interface AuditLog {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  description: string;
  metadata: Record<string, unknown>;
  ip: string | null;
  requestId: string | null;
  outcome: 'success' | 'failure' | null;
  durationMs: number | null;
}

export interface RunnerAgent {
  id: string;
  name: string;
  enabled: boolean;
  version: string | null;
  osVersion: string | null;
  lastSeenAt: number | null;
  enrolledAt: number;
  secondsSinceSeen: number | null;
  online: boolean;
  health: 'online' | 'degraded' | 'offline';
  installedReleaseId: string | null;
  activeReleaseId: string | null;
  updateAvailable: boolean;
  currentJob: { id: string; status: string | null } | null;
}

export interface RunnerEnrollment {
  ok: true;
  enrollmentToken: string;
  agentName: string;
  expiresAt: number;
}
export interface RunnerRelease { ok: true; releaseId: string; installerSha256: string; rootThumbprint: string; publisherThumbprint: string; createdAt: number; }
export interface RunnerReleaseHistory extends Omit<RunnerRelease, 'ok'> { active: boolean; }
export interface RunnerReleaseUploadToken { ok: true; uploadToken: string; expiresAt: number; }

/** One entry on the agent listener's source-IP allowlist. */
export interface AgentAllowlistEntry {
  /** An address or CIDR, already normalised by the gateway. */
  entry: string;
  note: string;
  addedAt: string;
  addedBy: string | null;
}

/**
 * `enforcing` is reported separately rather than derived from
 * `entries.length`: an empty list means "no restriction", and the UI has to
 * say so plainly instead of looking like a restriction that blocks everyone.
 */
export interface AgentAllowlist {
  enforcing: boolean;
  entries: AgentAllowlistEntry[];
}

export interface IdpAgent {
  id: string;
  online: boolean;
  last_ping: string | null;
  connected_at: string;
  details: { version: string; agent_version?: string; os_info: string };
}

/**
 * Agent package request. There is no gateway address or token here: the
 * desktop main process gets a per-agent secret + the gateway URL from the IDP
 * backend (`POST /api/agents/:id/credentials`). Building for an ID that
 * already has credentials rotates them (the old installation disconnects).
 */
export interface AgentBuildInput {
  agentId: string;
  workingDirectory: string;
  /** Outbound HTTP proxy of the target machine, `host:port`; empty = direct. */
  proxy?: string;
  /** Absolute path of `nssm.exe` on the target; empty = the agent's default (`nssm` on PATH). */
  nssmPath?: string;
  logLevel: 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
}

/** The agent secret is written into the ZIP only — never part of this result. */
export interface AgentBuildResult {
  canceled: boolean;
  filePath?: string;
  sha256?: string;
  /** Gateway the agent connects to (from the backend), for display. */
  gatewayUrl?: string;
  /** Whether Cloudflare Access service credentials were embedded. */
  cfAccess?: boolean;
}

// --- PMP -------------------------------------------------------------------

export interface PmpTestConnectionResult {
  success?: boolean;
  message?: string;
  error?: string;
}

// --- Artifact deploy ------------------------------------------------------

export type ArtifactReleaseStatus = 'building' | 'ready' | 'failed';
export type DeployTargetOs = 'windows' | 'linux';
export type DeployTargetEnvironment = 'Dev' | 'Stage' | 'Prod';

export interface ArtifactManifestEntry {
  component: string;
  os: ArtifactOs;
  file: string;
  sha256: string;
  size: number;
}

export interface ArtifactManifest {
  schema: 1;
  project: string;
  version: string;
  commit: string | null;
  createdAt: string | null;
  artifacts: ArtifactManifestEntry[];
}

export interface ArtifactSourceIdentity {
  platform: ArtifactSourcePlatform;
  owner: string;
  repo: string;
  baseUrl: string;
}

/** A key suggested by a component's `.env.example`, parsed when the release was finalized. */
export interface ReleaseConfigKey {
  key: string;
  defaultValue: string;
  description: string | null;
  /** Commented out in the example (`# KEY=value`). */
  optional: boolean;
}

export type ReleaseConfigSchema = Record<string, { source: string; keys: ReleaseConfigKey[] }>;

export interface ArtifactRelease {
  id: string;
  projectId: string;
  version: string;
  commitSha: string | null;
  sourcePlatform: ArtifactSourcePlatform | null;
  sourceIdentity: ArtifactSourceIdentity | null;
  status: ArtifactReleaseStatus;
  manifest: ArtifactManifest | null;
  configSchema?: ReleaseConfigSchema | null;
  buildDeploymentId: string | null;
  error: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ReleaseArtifact {
  id: string;
  releaseId: string;
  component: string;
  os: ArtifactOs;
  fileName: string;
  sourceRef: string | null;
  sha256: string;
  size: number;
}

export interface ArtifactReleaseDetails extends ArtifactRelease {
  artifacts: ReleaseArtifact[];
}

export interface TargetComponentOverride {
  name: string;
  runtime?: ArtifactRuntimeConfig;
  health?: ArtifactHealthConfig | null;
}

export interface DeployedComponentVersion {
  version: string | null;
  deployedAt: string | null;
  previousVersions: string[];
}

export type TargetRuntimeConfigFormat = 'frontend-config-js' | 'env-file';

export interface TargetComponentRuntimeConfig {
  format: TargetRuntimeConfigFormat;
  values: Record<string, string>;
}

export type ComponentTargetRuntimeConfig = Record<string, TargetComponentRuntimeConfig>;
export type LegacyTargetRuntimeConfig = Record<string, string>;
export type TargetRuntimeConfig = ComponentTargetRuntimeConfig | LegacyTargetRuntimeConfig;

export interface DeployTarget {
  id: string;
  projectId: string;
  name: string;
  agentId: string;
  os: DeployTargetOs;
  environment: DeployTargetEnvironment | null;
  basePath: string | null;
  components: TargetComponentOverride[] | null;
  runtimeConfig: TargetRuntimeConfig | null;
  currentReleaseId: string | null;
  currentVersions: Record<string, DeployedComponentVersion> | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface DeployTargetInput {
  name: string;
  agentId: string;
  os: DeployTargetOs;
  environment?: DeployTargetEnvironment | null;
  basePath?: string | null;
  components?: TargetComponentOverride[] | null;
  runtimeConfig?: ComponentTargetRuntimeConfig | null;
}

export type UpdateDeployTargetInput = Partial<DeployTargetInput>;

/** Fields shared by every artifact operation that starts a DeploymentManager session. */
export interface ArtifactRunResult {
  deploymentId: string;
  sseUrl: string;
}

/** Build response: the build has no agent deploy id or stage-events endpoint. */
export interface ArtifactBuildRunResult extends ArtifactRunResult {
  release: ArtifactRelease;
}

/** Agent deploy/rollback response. */
export interface ArtifactDeployRunResult extends ArtifactRunResult {
  deployId: string;
  eventsUrl: string;
}

export interface ArtifactDeployEvent {
  id: number;
  deploymentId: string;
  ts: string;
  component: string | null;
  stage: string | null;
  status: string | null;
  progress: number | null;
  message: string | null;
}

export interface ArtifactEventsResult {
  deploymentId: string;
  events: ArtifactDeployEvent[];
}

// --- Transport ---------------------------------------------------------

/**
 * Server-wide build parameters: the key/value map every project's release build
 * inherits. A project's own parameters (artifactDeploy.build.parameters) win.
 * Never secrets — they reach the CI tool as job parameters and land in its log.
 */
export interface BuildParametersSettings {
  parameters: Record<string, string>;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface Transport {
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
    /** T-73: read-only diagnostic probe — never triggers a deploy. */
    testConnection(id: string, environment?: string): Promise<ConnectionTestResult>;
  };
  deploy: {
    trigger(projectId: string, parameters: Record<string, unknown>): Promise<TriggerDeployResult>;
    abort(deploymentId: string): Promise<void>;
    sessions(): Promise<DeploymentSession[]>;
    history(projectId?: string, limit?: number): Promise<DeploymentHistoryEntry[]>;
    logsArchive(deploymentId: string): Promise<string>;
    /**
     * Live log stream for a deployment. Returns an unsubscribe function that
     * tears down the underlying connection.
     */
    subscribeLogs(deploymentId: string, handlers: DeployLogSubscriptionHandlers): () => void;
  };
  artifacts: {
    listReleases(projectId: string): Promise<ArtifactRelease[]>;
    getRelease(id: string): Promise<ArtifactReleaseDetails>;
    createRelease(projectId: string, input: { version: string; ref?: string }): Promise<ArtifactBuildRunResult>;
    importRelease(projectId: string, version: string): Promise<ArtifactReleaseDetails>;
    deleteRelease(id: string): Promise<void>;
    listTargets(projectId: string): Promise<DeployTarget[]>;
    createTarget(projectId: string, input: DeployTargetInput): Promise<DeployTarget>;
    updateTarget(id: string, input: UpdateDeployTargetInput): Promise<DeployTarget>;
    deleteTarget(id: string): Promise<void>;
    refreshTarget(id: string): Promise<DeployTarget>;
    applyConfig(id: string, input?: { confirmation?: string }): Promise<TriggerDeployResult>;
    deploy(targetId: string, input: { releaseId: string; components?: string[]; confirmation?: string }): Promise<ArtifactDeployRunResult>;
    rollback(targetId: string, input: { components?: string[]; confirmation?: string }): Promise<ArtifactDeployRunResult>;
    events(deploymentId: string): Promise<ArtifactEventsResult>;
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
  settings: {
    getBuildParameters(): Promise<BuildParametersSettings>;
    updateBuildParameters(parameters: Record<string, string>): Promise<BuildParametersSettings>;
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
    list(): Promise<IdpAgent[]>;
    allowlist(): Promise<AgentAllowlist>;
    addAllowlistEntry(entry: string, note?: string): Promise<AgentAllowlist>;
    removeAllowlistEntry(entry: string): Promise<AgentAllowlist>;
  };
  agentBuilder: {
    build(input: AgentBuildInput): Promise<AgentBuildResult>;
  };
  pmp: {
    testConnection(config: PmpConfig): Promise<PmpTestConnectionResult>;
  };
}
