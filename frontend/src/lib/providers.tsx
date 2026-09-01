import type { ReactNode } from 'react';
import { Server, Globe, Terminal, Monitor } from 'lucide-react';
import type { ProviderType, TargetOS } from '@/types/project';

/**
 * Single source of truth for provider display metadata (T-35/T-36).
 *
 * Historically the app used five provider strings (`Jenkins`, `PMP`,
 * `Server`, `SSH`, `WinRM`) even though `Server`/`SSH`/`WinRM` are the same
 * adapter family split only by `config.targetOS`. Every place that used to
 * hardcode its own icon/color/label map for providers should read from here
 * instead, via `normalizeProvider` and `getProviderMeta`.
 */
export interface ProviderMeta {
  value: ProviderType;
  label: string;
  icon: ReactNode;
  colorClasses: string;
  settingsTitle: string;
}

const SERVER_COLOR_CLASSES = 'from-emerald-500/20 to-green-500/20 border-emerald-500/20 text-emerald-400';

export const providers: readonly ProviderMeta[] = [
  {
    value: 'Jenkins',
    label: 'Jenkins',
    icon: <Server className="h-3.5 w-3.5 text-orange-400" />,
    colorClasses: 'from-orange-500/20 to-red-500/20 border-orange-500/20 text-orange-400',
    settingsTitle: 'Jenkins Configuration',
  },
  {
    value: 'PMP',
    label: 'PMP',
    icon: <Globe className="h-3.5 w-3.5 text-blue-400" />,
    colorClasses: 'from-blue-500/20 to-cyan-500/20 border-blue-500/20 text-blue-400',
    settingsTitle: 'PMP Portal Configuration',
  },
  {
    value: 'Server',
    label: 'Server',
    icon: <Terminal className="h-3.5 w-3.5 text-emerald-400" />,
    colorClasses: SERVER_COLOR_CLASSES,
    settingsTitle: 'Server Configuration',
  },
];

/** Per-OS sub-label, icon, and color for the unified `Server` provider. */
const SERVER_OS_META: Readonly<Record<TargetOS, Pick<ProviderMeta, 'label' | 'icon' | 'colorClasses'>>> = {
  linux: {
    label: 'SSH (Linux)',
    icon: <Terminal className="h-3.5 w-3.5 text-emerald-400" />,
    colorClasses: SERVER_COLOR_CLASSES,
  },
  windows: {
    label: 'WinRM (Windows)',
    icon: <Monitor className="h-3.5 w-3.5 text-indigo-400" />,
    colorClasses: 'from-indigo-500/20 to-blue-500/20 border-indigo-500/20 text-indigo-400',
  },
};

const DEFAULT_PROVIDER_META = providers[providers.length - 1];

function findProviderMeta(value: ProviderType): ProviderMeta {
  return providers.find((p) => p.value === value) ?? DEFAULT_PROVIDER_META;
}

/**
 * Map any raw provider string — canonical or legacy (`SSH`, `WinRM`) — onto
 * the canonical `ProviderType`. Unknown values fall back to `Server`, the
 * safe default: `Server` is the only provider whose adapter is chosen by
 * `config.targetOS` rather than by name, so misrouting an unrecognized
 * value there fails soft (a server config UI) rather than throwing.
 */
export function normalizeProvider(raw: string): ProviderType {
  if (raw === 'Jenkins' || raw === 'PMP') return raw;
  return 'Server';
}

/**
 * Resolve display metadata for a project's provider. For `Server` (and its
 * legacy `SSH`/`WinRM` aliases), the label/icon/color are derived from
 * `targetOS` — falling back to the raw provider name only when `targetOS`
 * itself is missing, matching the legacy `WinRM` => windows default used by
 * the backend adapters.
 */
export function getProviderMeta(provider: string, targetOS?: TargetOS): ProviderMeta {
  const canonical = normalizeProvider(provider);
  const base = findProviderMeta(canonical);

  if (canonical !== 'Server') {
    return base;
  }

  const resolvedOS: TargetOS = targetOS ?? (provider === 'WinRM' ? 'windows' : 'linux');
  const osMeta = SERVER_OS_META[resolvedOS];

  return {
    value: 'Server',
    label: osMeta.label,
    icon: osMeta.icon,
    colorClasses: osMeta.colorClasses,
    settingsTitle: `${osMeta.label} Configuration`,
  };
}
