import type { ArtifactRelease, ArtifactReleaseStatus, DeployTarget } from '@/services/transport/types';

/**
 * What a release was built from, as the version list labels it:
 * - tag: a named, reviewed point in history; the only kind meant for Canlı.
 * - preview: a base plus feature branches merged on a preview/* branch.
 * - branch: one branch head, or a generated `0.0.0-…` test build.
 * - package: imported, or built before IDP recorded the ref.
 */
export type ReleaseKind = 'tag' | 'preview' | 'branch' | 'package';

export const RELEASE_KIND_LABEL: Readonly<Record<ReleaseKind, string>> = {
  tag: 'Tag',
  preview: 'Önizleme',
  branch: 'Branch',
  package: 'Paket',
};

export const releaseKind = (release: Pick<ArtifactRelease, 'composition' | 'refType' | 'version'>): ReleaseKind => {
  if (release.composition) return 'preview';
  if (release.refType === 'tag') return 'tag';
  if (release.refType === 'branch' || release.version.startsWith('0.0.0-')) return 'branch';
  return 'package';
};

/**
 * Previews are refused on production by the backend (PREVIEW_NOT_ALLOWED_ON_PROD);
 * this is the same test, so the UI never offers what will be rejected.
 */
export const isPreviewRelease = (release: Pick<ArtifactRelease, 'composition'> | null | undefined): boolean =>
  Boolean(release?.composition);

export const RELEASE_STATUS_LABEL: Readonly<Record<ArtifactReleaseStatus, string>> = {
  ready: 'Hazır',
  building: 'Derleniyor',
  failed: 'Başarısız',
};

export const shortSha = (sha: string | null | undefined): string => (sha ? sha.slice(0, 7) : '');

/** Backend rule for tag names and release versions: no leading dot/dash, no spaces or slashes. */
export const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$/;

/**
 * `0.0.0-<branch>.<utc yyyymmddHHMMss>` — the same shape the backend generates
 * for a build nobody named (releaseService.generateVersion), so a test build
 * started from here sorts and expires with the others.
 */
export const testVersionFor = (branch: string, now: Date = new Date()): string => {
  const slug = branch.replace(/[^0-9A-Za-z._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'branch';
  const stamp = now.toISOString().replace(/[-:T]/g, '').replace(/\..+$/, '');
  return `0.0.0-${slug}.${stamp}`;
};

/** Customers that have this version installed on at least one component. */
export const customersRunning = (version: string, targets: ReadonlyArray<DeployTarget>): DeployTarget[] =>
  targets.filter((target) => Object.values(target.currentVersions ?? {}).some((installed) => installed?.version === version));

export const releaseByVersion = (
  releases: ReadonlyArray<ArtifactRelease> | undefined,
  version: string | null | undefined,
): ArtifactRelease | undefined => (version ? releases?.find((release) => release.version === version) : undefined);

/** Branches the composer pushes; hidden from branch lists unless asked for. */
export const isPreviewBranch = (name: string): boolean => name.startsWith('preview/');
