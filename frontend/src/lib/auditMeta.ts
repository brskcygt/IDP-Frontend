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
  /** Turkish name of the action; unknown actions show the server's code. */
  label?: string;
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
  DEPLOY_TRIGGERED: { icon: Play, label: 'Dağıtım başlatıldı', tone: 'text-status-run', category: 'deploy' },
  DEPLOY_ABORTED: { icon: Square, label: 'Dağıtım durduruldu', tone: 'text-status-fail', category: 'deploy' },
  PROJECT_CREATED: { icon: UserPlus, label: 'Proje oluşturuldu', tone: 'text-status-ok', category: 'config' },
  PROJECT_UPDATED: { icon: Settings2, label: 'Proje ayarları değişti', tone: 'text-status-warn', category: 'config' },
  PROJECT_DELETED: { icon: Trash2, label: 'Proje silindi', tone: 'text-status-fail', category: 'config' },
  VPN_SESSION_CLEARED: { icon: ShieldCheck, label: 'VPN oturumu temizlendi', tone: 'text-status-warn', category: 'auth' },
  VPN_FORCE_DISCONNECTED: { icon: ShieldCheck, label: 'VPN bağlantısı kesildi', tone: 'text-status-fail', category: 'auth' },
  MFA_SUBMITTED: { icon: KeyRound, label: 'MFA kodu girildi', tone: 'text-status-ok', category: 'auth' },
  MFA_REQUIRED: { icon: KeyRound, label: 'MFA istendi', tone: 'text-status-warn', category: 'auth' },
  MFA_RESOLVED: { icon: KeyRound, label: 'MFA tamamlandı', tone: 'text-status-ok', category: 'auth' },
  MFA_NUMBER_MATCHING: { icon: KeyRound, label: 'MFA sayı eşleştirme', tone: 'text-status-warn', category: 'auth' },
  MFA_NUMBER_MATCHING_SUCCESS: { icon: KeyRound, label: 'MFA sayı eşleştirme başarılı', tone: 'text-status-ok', category: 'auth' },
  OTP_WEBHOOK_RESOLVED: { icon: KeyRound, label: 'OTP webhook ile çözüldü', tone: 'text-status-ok', category: 'auth' },
  LOGIN: { icon: LogIn, label: 'Oturum açıldı', tone: 'text-status-run', category: 'auth' },
  LOGIN_FAILED: { icon: XCircle, label: 'Oturum açılamadı', tone: 'text-status-fail', category: 'auth' },
  LOGOUT: { icon: LogOut, label: 'Oturum kapatıldı', tone: 'text-muted-foreground', category: 'auth' },
  // T-52 / SEC-09: admin-only user management actions.
  USER_CREATED: { icon: UserPlus, label: 'Kullanıcı eklendi', tone: 'text-status-ok', category: 'auth' },
  USER_ROLE_CHANGED: { icon: UserCog, label: 'Rol değişti', tone: 'text-status-warn', category: 'auth' },
  USER_PASSWORD_RESET: { icon: KeyRound, label: 'Parola sıfırlandı', tone: 'text-status-warn', category: 'auth' },
  USER_DELETED: { icon: UserMinus, label: 'Kullanıcı silindi', tone: 'text-status-fail', category: 'auth' },
};

export const auditMeta = (action: string): ActionMeta => ACTION_META[action] ?? DEFAULT_META;

export const AUDIT_CATEGORY_LABEL: Readonly<Record<AuditCategory, string>> = {
  deploy: 'Dağıtımlar',
  config: 'Ayarlar',
  auth: 'Erişim',
};

/** Renders `{ env: 'prod', hosts: 4 }` as `env=prod · hosts=4`. */
export const formatMetadata = (metadata: Record<string, unknown>): string =>
  Object.entries(metadata ?? {})
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(' · ');
