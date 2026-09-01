/**
 * Thin backward-compatible re-export layer over the transport boundary.
 *
 * The functions here used to call `fetch` directly; they now just delegate
 * to `getTransport()` (see `./transport`). Kept around only because a
 * handful of call sites still import from `services/api` by name
 * (e.g. `components/project/settings/PmpAuthFields.tsx`) — new code should
 * call `getTransport()` directly instead. Nothing in this file touches
 * `fetch`/`EventSource` itself anymore; see `services/transport/httpTransport.ts`
 * for that.
 */
import type { PmpConfig, ProjectConfig } from '../types/project';
import { getTransport } from './transport';
import type {
  ApiUser,
  HostKeyRecord,
  PmpTestConnectionResult,
  ProjectEnvironmentsResult,
} from './transport/types';

export type { PmpTestConnectionResult, ProjectEnvironmentsResult, ApiUser, HostKeyRecord };

export const fetchProjects = () => getTransport().projects.list();

export const createProject = (projectData: { name: string; tenant: string; environment: string; provider: string }) =>
  getTransport().projects.create(projectData);

export const updateProjectSettings = (id: string, config: ProjectConfig) =>
  getTransport().projects.updateConfig(id, config);

export const testPmpConnection = (pmpConfig: PmpConfig): Promise<PmpTestConnectionResult> =>
  getTransport().pmp.testConnection(pmpConfig);

export const fetchAuditLogs = () => getTransport().audit.list();

export const clearVpnSession = (id: string) => getTransport().vpn.clearProjectSession(id);

export const forceDisconnectVpn = () => getTransport().vpn.forceDisconnect();

export const fetchVpnSessions = () => getTransport().vpn.sessions();

export const deleteProject = (id: string) => getTransport().projects.remove(id);

export const fetchTelemetry = (projectId: string) => getTransport().projects.telemetry(projectId);

export const fetchProjectEnvironments = (projectId: string): Promise<ProjectEnvironmentsResult> =>
  getTransport().projects.environments(projectId);

export const fetchSession = () => getTransport().auth.me();

// --- User management (T-52 / SEC-09, admin-only) --------------------------

export const fetchUsers = (): Promise<ApiUser[]> => getTransport().users.list();

export const createUser = (data: { username: string; password: string; role: string }): Promise<ApiUser> =>
  getTransport().users.create(data);

export const updateUser = (id: string, data: { role?: string; password?: string }): Promise<ApiUser> =>
  getTransport().users.update(id, data);

export const deleteUser = (id: string): Promise<void> => getTransport().users.remove(id);

// --- SSH host keys (T-17 / T-17b, admin-only, requires vpn:manage) --------

export const fetchHostKeys = (): Promise<HostKeyRecord[]> => getTransport().hostKeys.list();

export const forgetHostKey = (host: string, port: number): Promise<void> =>
  getTransport().hostKeys.forget(host, port);
