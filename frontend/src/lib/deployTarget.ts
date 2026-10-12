import type { DeployTarget } from '@/services/transport/types';

/**
 * Whether a target is a production customer. The target's own environment wins;
 * without one it inherits the project's, and a name containing "prod" is
 * treated as production regardless -- the cautious reading, since this decides
 * whether a typed confirmation is required and whether a preview may go there.
 */
export const isProdTarget = (
  target: Pick<DeployTarget, 'environment' | 'name'>,
  project: { environment: string },
): boolean =>
  target.environment === 'Prod'
  || (!target.environment && project.environment === 'Prod')
  || /(^|[^a-z])prod/i.test(target.name);
