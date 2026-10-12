import type { DeployTarget, DeployTargetEnvironment, Project } from '@/services/transport/types';

/**
 * Whether a target is a production customer. The target's own environment wins;
 * without one it inherits the project's, and a name containing "prod" is
 * treated as production regardless -- the cautious reading, since this decides
 * whether a typed confirmation is required and whether a preview may go there.
 *
 * Mirrors the backend's isProdTarget (core/artifacts/contracts.js). Every
 * screen that asks "is this Canlı?" -- the install dialog, rollback, apply
 * config, and the customer form hiding its Branch field -- goes through here.
 */
export const isProdTarget = (
  target: Pick<DeployTarget, 'environment' | 'name'>,
  project: { environment: string },
): boolean =>
  target.environment === 'Prod'
  || (!target.environment && project.environment === 'Prod')
  || /(^|[^a-z])prod/i.test(target.name);

/** Display names only; the stored values stay Dev / Stage / Prod. */
export const ENVIRONMENT_LABEL: Readonly<Record<DeployTargetEnvironment, string>> = {
  Dev: 'Geliştirme',
  Stage: 'Test',
  Prod: 'Canlı',
};

export const environmentLabel = (environment: string | null | undefined): string =>
  environment && environment in ENVIRONMENT_LABEL
    ? ENVIRONMENT_LABEL[environment as DeployTargetEnvironment]
    : environment || '—';

/** The environment a target runs in, falling back to the project's. */
export const targetEnvironment = (target: Pick<DeployTarget, 'environment'>, project: { environment: string }): string =>
  target.environment ?? project.environment;

/** Component names configured on the project, in their configured order. */
export const projectComponentNames = (project: Pick<Project, 'config'>): string[] =>
  (project.config?.artifactDeploy?.components ?? []).map((component) => component.name);

/**
 * What a target actually hosts: its own component list when it narrows the
 * project's, otherwise every project component. Installing one it does not
 * host would fail on the backend.
 */
export const hostedComponents = (
  target: Pick<DeployTarget, 'components'> | null | undefined,
  project: Pick<Project, 'config'>,
): string[] => {
  const own = (target?.components ?? []).map((component) => component.name);
  return own.length > 0 ? own : projectComponentNames(project);
};
