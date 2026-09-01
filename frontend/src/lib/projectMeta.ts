import type { Project } from '@/hooks/useProjects';

/** Providers that run against a reachable host, so telemetry is meaningful. */
const HOST_BACKED_PROVIDERS: ReadonlySet<string> = new Set(['SSH', 'Server', 'WinRM']);

export const isHostBacked = (provider: string): boolean => HOST_BACKED_PROVIDERS.has(provider);

/**
 * Provider colour is a token lookup, not a hardcoded palette. Unknown providers
 * fall back to muted text rather than borrowing another provider's colour.
 */
const PROVIDER_CLASS: Readonly<Record<string, string>> = {
  Jenkins: 'text-provider-jenkins',
  SSH: 'text-provider-ssh',
  Server: 'text-provider-ssh',
  WinRM: 'text-provider-winrm',
  PMP: 'text-provider-pmp',
};

export const providerClass = (provider: string): string =>
  PROVIDER_CLASS[provider] ?? 'text-muted-foreground';

export type ProjectStatus = Project['status'];

/** Failed and running work sorts to the top — the operator's queue, not A–Z. */
const STATUS_WEIGHT: Readonly<Record<ProjectStatus, number>> = {
  Deploying: 0,
  Failed: 1,
  Succeeded: 2,
  Idle: 3,
};

export const statusWeight = (status: ProjectStatus): number => STATUS_WEIGHT[status] ?? 99;

export const STATUS_CLASS: Readonly<Record<ProjectStatus, string>> = {
  Deploying: 'text-status-run',
  Failed: 'text-status-fail',
  Succeeded: 'text-status-ok',
  Idle: 'text-faint',
};

/** Environments that deserve the warning colour wherever they are shown. */
export const isProductionEnv = (environment: string): boolean =>
  /^prod/i.test(environment.trim());
