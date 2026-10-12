import type { CiAuthType, CiConfig, CiPlatform, CiRefType } from '@/types/project';

/**
 * Option lists, defaults and platform-specific copy for the CI Pipeline
 * settings UI. Defaults and limits mirror the backend's ciConfig handling
 * (backend/src/adapters/ci/index.js, validation/projectSchemas.js) — kept as
 * plain constants rather than imported across the frontend/backend boundary.
 */

export interface CiOption<T extends string> {
  value: T;
  label: string;
}

export const CI_PLATFORM_OPTIONS: ReadonlyArray<CiOption<CiPlatform>> = [
  { value: 'bitbucket', label: 'Bitbucket Pipelines' },
  { value: 'github', label: 'GitHub Actions' },
];

export const CI_REF_TYPE_OPTIONS: ReadonlyArray<CiOption<CiRefType>> = [
  { value: 'branch', label: 'Branch' },
  { value: 'tag', label: 'Tag' },
];

export const CI_AUTH_TYPE_OPTIONS: ReadonlyArray<CiOption<CiAuthType>> = [
  { value: 'bearer', label: 'Access token (Bearer)' },
  { value: 'basic', label: 'API token + Atlassian e-postası' },
];

/** Narrow a Radix Select string back to one of the known option values. */
export const pickOption = <T extends string>(options: ReadonlyArray<CiOption<T>>, raw: string): T | undefined =>
  options.find((option) => option.value === raw)?.value;

export const CI_DEFAULT_BASE_URL: Readonly<Record<CiPlatform, string>> = {
  bitbucket: 'https://api.bitbucket.org/2.0',
  github: 'https://api.github.com',
};

export const CI_POLL_INTERVAL_SECONDS = { fallback: 10, min: 3, max: 60 } as const;
export const CI_TIMEOUT_MINUTES = { fallback: 60, min: 1, max: 720 } as const;

export interface CiPlatformCopy {
  ownerLabel: string;
  ownerPlaceholder: string;
  pipelineLabel: string;
  pipelinePlaceholder: string;
}

const PLATFORM_COPY: Readonly<Record<CiPlatform, CiPlatformCopy>> = {
  bitbucket: {
    ownerLabel: 'Workspace',
    ownerPlaceholder: 'my-workspace',
    pipelineLabel: 'Custom pipeline adı',
    pipelinePlaceholder: 'deploy-customer',
  },
  github: {
    ownerLabel: 'Sahip / organizasyon',
    ownerPlaceholder: 'my-org',
    pipelineLabel: 'Workflow dosyası (örn. deploy.yml)',
    pipelinePlaceholder: 'deploy.yml',
  },
};

const UNSET_PLATFORM_COPY: CiPlatformCopy = {
  ownerLabel: 'Sahip',
  ownerPlaceholder: 'workspace ya da organizasyon',
  pipelineLabel: 'Pipeline',
  pipelinePlaceholder: 'pipeline ya da workflow',
};

export const getCiPlatformCopy = (platform: CiPlatform | undefined): CiPlatformCopy =>
  platform ? PLATFORM_COPY[platform] : UNSET_PLATFORM_COPY;

/**
 * ciConfig patch for a platform switch. It also clears the platform-specific
 * fields in the same update, so a GitHub Enterprise base URL can't carry over
 * to Bitbucket and a Bitbucket ref type / auth mode can't carry over to GitHub.
 */
export const getPlatformChangePatch = (
  current: CiPlatform | undefined,
  next: CiPlatform | undefined,
): Partial<CiConfig> =>
  next === current
    ? {}
    : { platform: next, baseUrl: undefined, refType: undefined, authType: undefined, correlationInput: undefined };

/** One-line reminder of the token scopes the CI adapter needs. */
export const getCiTokenScopeHint = (platform: CiPlatform | undefined, authType: CiAuthType): string => {
  if (platform === 'github') {
    return '"Actions: Read and write" + "Contents: Read" yetkili fine-grained PAT (ya da repo scope\'lu klasik token).';
  }
  if (platform === 'bitbucket' && authType === 'basic') {
    return 'read:pipeline:bitbucket + write:pipeline:bitbucket (+ read:repository:bitbucket) yetkili Atlassian API token. App password artık çalışmıyor.';
  }
  if (platform === 'bitbucket') {
    return 'pipeline + pipeline:write scope\'lu repository / project / workspace access token.';
  }
  return 'Gereken token yetkilerini görmek için bir CI platformu seçin.';
};

/** A cleared number input means "use the default", not 0. */
export const parseOptionalNumber = (raw: string): number | undefined =>
  raw.trim() === '' ? undefined : Number(raw);
