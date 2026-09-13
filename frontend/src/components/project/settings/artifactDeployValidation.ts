import type { ArtifactDeployConfig } from '@/types/project';

const DEFAULT_BASE_URL: Record<string, string> = {
  bitbucket: 'https://api.bitbucket.org/2.0',
  github: 'https://api.github.com',
};

const sourceIdentity = (config: ArtifactDeployConfig | undefined) => {
  const source = config?.source;
  const platform = source?.platform ?? '';
  return JSON.stringify({
    platform,
    owner: source?.owner?.trim() ?? '',
    repo: source?.repo?.trim() ?? '',
    baseUrl: (source?.baseUrl?.trim() || DEFAULT_BASE_URL[platform] || '').replace(/\/+$/, ''),
    authType: source?.authType === 'basic' ? 'basic' : 'bearer',
    username: source?.username?.trim() ?? '',
  });
};

export const needsNewArtifactToken = (
  original: ArtifactDeployConfig | undefined,
  next: ArtifactDeployConfig | undefined,
): boolean => Boolean(
  original?.source?.hasToken
  && next
  && sourceIdentity(original) !== sourceIdentity(next)
  && !next.source?.token?.trim(),
);
