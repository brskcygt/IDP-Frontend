/**
 * Shared configuration types for a deployable Project.
 *
 * Secrets (passwords, API tokens, PMP auth tokens, MFA secrets) are never
 * returned by the backend once saved — `GET /api/projects` sends boolean
 * `has*` flags instead (e.g. `hasPassword`) so the UI can indicate a secret
 * is already stored without exposing its value. Submitting an empty value
 * for a secret field leaves the previously saved value untouched.
 */

export type TargetOS = 'windows' | 'linux';

/**
 * Canonical provider values (T-35/T-36). `Server` covers what used to be
 * split into `SSH` and `WinRM` — the real distinction is `config.targetOS`
 * (`linux` -> SSH, `windows` -> WinRM). See `@/lib/providers` for the single
 * source of provider display metadata and `normalizeProvider` for mapping
 * legacy raw values onto this type.
 */
export type ProviderType = 'Jenkins' | 'PMP' | 'Server';

export type AuthType = 'manual' | 'pmp';

export type MfaType = 'none' | 'push' | 'totp';

/**
 * SSH host key verification policy (T-17 / T-17b). Read by the backend from
 * `project.config.hostKeyPolicy`, defaulting to `'tofu'` when unset — keep
 * that default in sync with the backend's own fallback.
 *
 * - `tofu`     — trust-on-first-use: learn the key on first connect, refuse
 *                the connection if it later changes.
 * - `strict`   — only accept a key already recorded for this host; never
 *                learn a new one automatically.
 * - `insecure` — no verification at all. Never the default; the UI must
 *                warn loudly whenever this is selected.
 */
export type HostKeyPolicy = 'tofu' | 'strict' | 'insecure';

export type VpnProviderType =
  | 'globalprotect'
  | 'globalprotect-saml'
  | 'anyconnect'
  | 'openvpn'
  | 'wireguard'
  | 'fortinet'
  | 'checkpoint'
  | 'ssh-jump';

export interface PmpConfig {
  baseUrl?: string;
  resourceName?: string;
  accountName?: string;
  authToken?: string;
  /** True when a PMP auth token is already saved on the backend. */
  hasAuthToken?: boolean;
  allowSelfSigned?: boolean;
}

/**
 * PMP automation steps (SEC-03/T-12).
 *
 * The backend runs `config.steps` through a whitelisted interpreter
 * (backend/src/adapters/pmp/StepRunner.js) — it never evaluates arbitrary
 * code. `action` is a discriminant: each variant only carries the fields
 * that action actually uses. Keep this union in sync with
 * backend/src/adapters/pmp/stepSchema.js.
 *
 * `value`/`url` fields may contain `{{username}}`, `{{password}}`, or
 * `{{environment}}` placeholders, substituted at run time. No other
 * interpolation is supported.
 */
export type PmpStepAction =
  | 'goto'
  | 'fill'
  | 'click'
  | 'waitFor'
  | 'waitForNavigation'
  | 'select'
  | 'assertText'
  | 'screenshot'
  | 'wait';

/** All supported PMP step actions, in the order they should be offered in the UI. */
export const PMP_STEP_ACTIONS: PmpStepAction[] = [
  'goto',
  'fill',
  'click',
  'waitFor',
  'waitForNavigation',
  'select',
  'assertText',
  'screenshot',
  'wait',
];

export interface PmpStepGoto {
  action: 'goto';
  url: string;
}

export interface PmpStepFill {
  action: 'fill';
  selector: string;
  value: string;
}

export interface PmpStepClick {
  action: 'click';
  selector: string;
}

export interface PmpStepWaitFor {
  action: 'waitFor';
  selector: string;
  timeoutMs?: number;
}

export interface PmpStepWaitForNavigation {
  action: 'waitForNavigation';
  timeoutMs?: number;
}

export interface PmpStepSelect {
  action: 'select';
  selector: string;
  value: string;
}

export interface PmpStepAssertText {
  action: 'assertText';
  selector: string;
  contains: string;
}

export interface PmpStepScreenshot {
  action: 'screenshot';
  name: string;
}

export interface PmpStepWait {
  action: 'wait';
  ms: number;
}

export type PmpStep =
  | PmpStepGoto
  | PmpStepFill
  | PmpStepClick
  | PmpStepWaitFor
  | PmpStepWaitForNavigation
  | PmpStepSelect
  | PmpStepAssertText
  | PmpStepScreenshot
  | PmpStepWait;

export interface MfaConfig {
  type?: MfaType;
  rememberSession?: boolean;
  secret?: string;
  /** True when a TOTP secret is already saved on the backend. */
  hasSecret?: boolean;
}

export interface VpnConfig {
  type?: VpnProviderType;
  host?: string;
  port?: string;
  username?: string;
  password?: string;
  /** True when a VPN password is already saved on the backend. */
  hasPassword?: boolean;
  configContent?: string;
  mfaConfig?: MfaConfig;
}

export interface ProjectConfig {
  // Jenkins provider
  url?: string;
  jobName?: string;
  username?: string;
  apiToken?: string;
  /** True when a Jenkins API token is already saved on the backend. */
  hasApiToken?: boolean;

  // Server / SSH / WinRM provider
  targetOS?: TargetOS;
  /** How Windows deployments reach the target. Cloudflare runner is retained only as legacy code. */
  windowsTransport?: 'winrm' | 'idp-agent';
  agentId?: string;
  agentCommandTimeoutSeconds?: number;
  runnerAgentId?: string;
  runnerTimeoutSeconds?: number;
  host?: string;
  port?: string;
  authType?: AuthType;
  password?: string;
  /** True when a password is already saved on the backend. */
  hasPassword?: boolean;
  pmpConfig?: PmpConfig;
  /**
   * SSH host key verification policy for this project (T-17/T-17b).
   * Defaults to `'tofu'` on the backend when unset.
   */
  hostKeyPolicy?: HostKeyPolicy;
  /**
   * Legacy free-form Playwright script (SEC-03/T-12: removed server-side —
   * the backend refuses to run this and throws instead). Only kept here so
   * the settings UI can still show it read-only and prompt a conversion to
   * `steps`. Never write new values into this field.
   */
  scriptContent?: string;
  /** Working directory for the deploy script on the target host (SSH/WinRM). */
  workDir?: string;
  /**
   * Opt-in server telemetry polling (CPU/RAM) for Server/SSH/WinRM projects
   * (T-18b). Defaults to `false` on the backend when unset — every poll
   * opens a real SSH/WinRM session (and, for PMP-authed projects, resolves
   * a vault credential), so this must be a deliberate choice, not a default.
   */
  telemetryEnabled?: boolean;

  // PMP (Playwright portal) provider
  script?: string;
  /** Whitelisted, JSON-only automation steps run by StepRunner. Replaces `scriptContent`. */
  steps?: PmpStep[];

  // VPN & Gateway
  vpnEnabled?: boolean;
  vpnConfig?: VpnConfig;

  /**
   * Per-environment overrides (T-50). `config` above is the shared base
   * every environment deploys with by default; a key here (e.g. `"Prod"`)
   * shallow-overrides just the fields it defines on top of that base — see
   * `backend/src/utils/environmentConfig.js` for the exact merge rule.
   * Absent or empty means every environment shares the same target.
   */
  environments?: Record<string, Partial<ProjectConfig>>;
}
