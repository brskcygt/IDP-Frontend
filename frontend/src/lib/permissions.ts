/**
 * Client-side mirror of `backend/src/auth/permissions.js` (T-52 / SEC-09).
 *
 * This is UX only — hiding a "Deploy" button a viewer isn't allowed to use
 * anyway. It is NOT the security boundary: every endpoint this gates is
 * also independently enforced server-side via `requirePermission()`, and
 * that backend check is what actually stops an unauthorized request. Keep
 * this table in sync with the backend's `ACTION_MIN_ROLE`, but never treat
 * it as a substitute for it.
 */

export type Role = 'admin' | 'deployer' | 'viewer';

export type Action =
  | 'project:read'
  | 'project:write'
  | 'project:delete'
  | 'deploy:trigger'
  | 'deploy:abort'
  | 'vpn:manage'
  | 'audit:read'
  | 'user:manage';

/** Linear hierarchy: higher number = more privilege. */
const ROLE_RANK: Readonly<Record<Role, number>> = {
  viewer: 1,
  deployer: 2,
  admin: 3,
};

/** Minimum role required to perform each action — mirrors the backend table exactly. */
const ACTION_MIN_ROLE: Readonly<Record<Action, Role>> = {
  'project:read': 'viewer',
  'audit:read': 'viewer',
  'deploy:trigger': 'deployer',
  'deploy:abort': 'deployer',
  'project:write': 'admin',
  'project:delete': 'admin',
  'vpn:manage': 'admin',
  'user:manage': 'admin',
};

/**
 * Fail-closed: an unrecognized/absent role (session still loading, logged
 * out, a future role value) never grants an action.
 */
export const can = (role: Role | string | null | undefined, action: Action): boolean => {
  const roleRank = role ? ROLE_RANK[role as Role] : undefined;
  if (!roleRank) return false;
  return roleRank >= ROLE_RANK[ACTION_MIN_ROLE[action]];
};

export const ROLE_LABEL: Readonly<Record<Role, string>> = {
  admin: 'Admin',
  deployer: 'Deployer',
  viewer: 'Viewer',
};

export const ROLE_OPTIONS: ReadonlyArray<Role> = ['admin', 'deployer', 'viewer'];
