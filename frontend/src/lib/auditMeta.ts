import {
  Activity,
  KeyRound,
  LogIn,
  LogOut,
  Play,
  Settings2,
  ShieldCheck,
  Square,
  Trash2,
  UserCog,
  UserMinus,
  UserPlus,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

export type AuditCategory = 'deploy' | 'config' | 'auth';

type ActionMeta = {
  icon: LucideIcon;
  tone: string;
  category: AuditCategory;
};

const DEFAULT_META: ActionMeta = {
  icon: Activity,
  tone: 'text-muted-foreground',
  category: 'config',
};

/**
 * Every audit action the backend actually writes. Unknown actions fall back to
 * a neutral mark rather than being guessed into a category.
 */
const ACTION_META: Readonly<Record<string, ActionMeta>> = {
  DEPLOY_TRIGGERED: { icon: Play, tone: 'text-status-run', category: 'deploy' },
  DEPLOY_ABORTED: { icon: Square, tone: 'text-status-fail', category: 'deploy' },
  PROJECT_CREATED: { icon: UserPlus, tone: 'text-status-ok', category: 'config' },
  PROJECT_UPDATED: { icon: Settings2, tone: 'text-status-warn', category: 'config' },
  PROJECT_DELETED: { icon: Trash2, tone: 'text-status-fail', category: 'config' },
  VPN_SESSION_CLEARED: { icon: ShieldCheck, tone: 'text-status-warn', category: 'auth' },
  VPN_FORCE_DISCONNECTED: { icon: ShieldCheck, tone: 'text-status-fail', category: 'auth' },
  MFA_SUBMITTED: { icon: KeyRound, tone: 'text-status-ok', category: 'auth' },
  MFA_REQUIRED: { icon: KeyRound, tone: 'text-status-warn', category: 'auth' },
  MFA_RESOLVED: { icon: KeyRound, tone: 'text-status-ok', category: 'auth' },
  MFA_NUMBER_MATCHING: { icon: KeyRound, tone: 'text-status-warn', category: 'auth' },
  MFA_NUMBER_MATCHING_SUCCESS: { icon: KeyRound, tone: 'text-status-ok', category: 'auth' },
  OTP_WEBHOOK_RESOLVED: { icon: KeyRound, tone: 'text-status-ok', category: 'auth' },
  LOGIN: { icon: LogIn, tone: 'text-status-run', category: 'auth' },
  LOGIN_FAILED: { icon: XCircle, tone: 'text-status-fail', category: 'auth' },
  LOGOUT: { icon: LogOut, tone: 'text-muted-foreground', category: 'auth' },
  // T-52 / SEC-09: admin-only user management actions.
  USER_CREATED: { icon: UserPlus, tone: 'text-status-ok', category: 'auth' },
  USER_ROLE_CHANGED: { icon: UserCog, tone: 'text-status-warn', category: 'auth' },
  USER_PASSWORD_RESET: { icon: KeyRound, tone: 'text-status-warn', category: 'auth' },
  USER_DELETED: { icon: UserMinus, tone: 'text-status-fail', category: 'auth' },
};

export const auditMeta = (action: string): ActionMeta => ACTION_META[action] ?? DEFAULT_META;

export const AUDIT_CATEGORY_LABEL: Readonly<Record<AuditCategory, string>> = {
  deploy: 'Deploys',
  config: 'Config',
  auth: 'Auth',
};

/** Renders `{ env: 'prod', hosts: 4 }` as `env=prod · hosts=4`. */
export const formatMetadata = (metadata: Record<string, unknown>): string =>
  Object.entries(metadata ?? {})
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(' · ');
