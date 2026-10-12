import { GitBranch, GitMerge, Tag } from 'lucide-react';
import type { ArtifactRelease, ArtifactReleaseStatus } from '@/services/transport/types';
import { RELEASE_KIND_LABEL, RELEASE_STATUS_LABEL, releaseKind, shortSha, type ReleaseKind } from '@/lib/releases';
import { cn } from '@/lib/utils';

const KIND_CLASS: Readonly<Record<ReleaseKind, string>> = {
  tag: 'border-primary/40 text-primary',
  preview: 'border-status-warn/50 text-status-warn',
  branch: 'border-border text-muted-foreground',
  package: 'border-border text-muted-foreground',
};

const STATUS_CLASS: Readonly<Record<ArtifactReleaseStatus, string>> = {
  ready: 'border-status-ok/40 bg-status-ok/10 text-status-ok',
  building: 'border-primary/40 bg-primary/10 text-primary',
  failed: 'border-status-fail/40 bg-status-fail/10 text-status-fail',
};

const PILL = 'inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium';

export const ReleaseKindBadge = ({ release, className }: { release: Pick<ArtifactRelease, 'composition' | 'refType' | 'version'>; className?: string }) => {
  const kind = releaseKind(release);
  return <span className={cn(PILL, KIND_CLASS[kind], className)}>{RELEASE_KIND_LABEL[kind]}</span>;
};

export const ReleaseStatusBadge = ({ status }: { status: ArtifactReleaseStatus }) => (
  <span className={cn(PILL, STATUS_CLASS[status])}>{RELEASE_STATUS_LABEL[status]}</span>
);

/** Which branch or tag the release was built from; nothing for imports and older rows. */
export const RefChip = ({ release }: { release: Pick<ArtifactRelease, 'ref' | 'refType'> }) => {
  if (!release.ref) return null;
  const Icon = release.refType === 'tag' ? Tag : GitBranch;
  return <span className="inline-flex max-w-full items-center gap-1 rounded border border-border/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
    <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
    <span className="truncate">{release.ref}</span>
  </span>;
};

/** A preview's ingredients: collapsed to "base + N branch", opened to names and shas. */
export const CompositionDetail = ({ composition }: { composition: NonNullable<ArtifactRelease['composition']> }) => {
  const BaseIcon = composition.baseType === 'tag' ? Tag : GitBranch;
  return <details className="group mt-2 rounded-md bg-accent/20 px-3 py-2 text-xs">
    <summary className="flex cursor-pointer list-none items-center gap-1.5 text-muted-foreground [&::-webkit-details-marker]:hidden">
      <GitMerge className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span className="font-mono text-foreground">{composition.baseRef}</span>
      <span>+ {composition.branches.length} branch</span>
      <span className="ml-auto text-[10px] group-open:hidden">göster</span>
      <span className="ml-auto hidden text-[10px] group-open:inline">gizle</span>
    </summary>
    <ol className="mt-2 space-y-1 font-mono text-[11px]">
      <li className="flex items-center gap-2"><BaseIcon className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="min-w-0 flex-1 truncate">{composition.baseRef}</span><span className="text-[10px] text-muted-foreground">taban · {shortSha(composition.baseSha)}</span></li>
      {composition.branches.map((branch, index) => <li key={branch.name} className="flex items-center gap-2"><span className="w-3 shrink-0 text-center text-[10px] text-primary">{index + 1}</span><span className="min-w-0 flex-1 truncate">{branch.name}</span><span className="text-[10px] text-muted-foreground">{shortSha(branch.sha)}</span></li>)}
      <li className="flex items-center gap-2 border-t border-border/60 pt-1 text-muted-foreground"><GitMerge className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="min-w-0 flex-1 truncate">{composition.composeBranch}</span><span className="text-[10px]">{composition.headSha ? shortSha(composition.headSha) : 'bekliyor'}</span></li>
    </ol>
  </details>;
};
