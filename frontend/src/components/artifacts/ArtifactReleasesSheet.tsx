import { useEffect, useState } from 'react';
import { CloudDownload, GitBranch, Loader2, Package, PackagePlus, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useArtifactActions, useArtifactReleases } from '@/hooks/useArtifacts';
import { useSession } from '@/hooks/useSession';
import { can } from '@/lib/permissions';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Project } from '@/hooks/useProjects';
import type { ArtifactRelease } from '@/services/transport/types';

type Props = {
  project: Project | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onRunStarted: (deploymentId: string) => void;
};

const statusVariant = (status: ArtifactRelease['status']) => status === 'ready' ? 'default' : status === 'failed' ? 'destructive' : 'secondary';
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';

export const ArtifactReleasesSheet = ({ project, isOpen, onOpenChange, onRunStarted }: Props) => {
  const projectId = project?.id;
  const { data: session } = useSession();
  const canRelease = can(session?.role, 'release:create');
  const canDeleteRelease = can(session?.role, 'release:delete');
  const releases = useArtifactReleases(isOpen ? projectId : undefined);
  const actions = useArtifactActions(projectId ?? '');
  const { toast } = useToast();
  const [version, setVersion] = useState('');
  const [ref, setRef] = useState('');
  // null = build the whole project, which is also what an older IDP did; the
  // parameter is only sent when the operator narrowed it.
  const [selected, setSelected] = useState<ReadonlySet<string> | null>(null);

  useEffect(() => {
    setVersion('');
    setRef('');
    setSelected(null);
  }, [projectId]);

  if (!project) return null;

  const fail = (title: string, cause: unknown) => toast({ title, description: cause instanceof Error ? cause.message : 'Unknown error.', variant: 'destructive' });
  const buildProvider = project.config?.artifactDeploy?.build?.provider ?? 'none';
  const busy = actions.createRelease.isPending || actions.importRelease.isPending;
  const components = (project.config?.artifactDeploy?.components ?? []).map((component) => component.name);
  const chosen = components.filter((name) => selected === null || selected.has(name));
  const partial = chosen.length !== components.length;

  const toggleComponent = (name: string) => setSelected((current) => {
    const next = new Set(current ?? components);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    return next;
  });

  const createRelease = async () => {
    const normalized = version.trim();
    if (!normalized) return;
    try {
      const result = await actions.createRelease.mutateAsync({
        version: normalized,
        ref: ref.trim() || undefined,
        components: partial ? chosen : undefined,
      });
      toast({ title: 'Release build started', description: partial ? `${normalized} · ${chosen.join(', ')}` : normalized });
      onRunStarted(result.deploymentId);
    } catch (cause) { fail('Release build failed', cause); }
  };

  const importRelease = async () => {
    const normalized = version.trim();
    if (!normalized) return;
    try {
      const release = await actions.importRelease.mutateAsync(normalized);
      setVersion('');
      setRef('');
      toast({ title: 'Release imported', description: release.version });
    } catch (cause) { fail('Release import failed', cause); }
  };

  return <Sheet open={isOpen} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="flex w-[min(820px,calc(100vw-3rem))] max-w-none flex-col overflow-hidden border-l-line-strong bg-background p-0 sm:max-w-none">
      <div className="shrink-0 border-b border-line-strong bg-bar px-7 py-6">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3 text-xl"><Package className="h-5 w-5 text-primary" />Releases · {project.name}</SheetTitle>
          <SheetDescription>Create and manage immutable versions. Nothing is installed on a target from this screen.</SheetDescription>
        </SheetHeader>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-7">
        <div className="mx-auto max-w-3xl space-y-6">
          {canRelease && <section className="rounded-lg border border-border/60 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><PackagePlus className="h-4 w-4 text-primary" />Create release</h3>
            <p className="mt-1 text-xs text-muted-foreground">Build a new version through the configured CI provider, or import an artifact already uploaded to IDP.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div><Label>Version</Label><Input autoFocus className="mt-1.5 font-mono" value={version} onChange={(event) => setVersion(event.target.value)} placeholder="1.4.0" /></div>
              <div><Label>Git ref (optional)</Label><Input className="mt-1.5 font-mono" value={ref} onChange={(event) => setRef(event.target.value)} placeholder="v1.4.0" /></div>
            </div>
            {buildProvider !== 'none' && components.length > 1 && <div className="mt-4">
              <Label>Components to build</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                A release may carry just one of them — deploy only needs an artifact for the components
                it installs. Useful when a change touched a single side of the project.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {components.map((name) => {
                  const active = chosen.includes(name);
                  // Clearing the last one would build nothing at all.
                  const onlyOne = active && chosen.length === 1;
                  return <label
                    key={name}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors',
                      active ? 'border-primary/40 bg-primary/10 text-foreground' : 'border-border/60 text-muted-foreground',
                      onlyOne ? 'cursor-not-allowed' : 'cursor-pointer',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      disabled={onlyOne}
                      onChange={() => toggleComponent(name)}
                      className="h-3.5 w-3.5 accent-primary"
                    />
                    <span className="font-mono">{name}</span>
                  </label>;
                })}
              </div>
            </div>}
            <div className="mt-3 flex flex-wrap gap-2">
              {buildProvider !== 'none' && <Button size="sm" disabled={!version.trim() || busy} onClick={() => void createRelease()}>{actions.createRelease.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitBranch className="mr-2 h-4 w-4" />}Build release</Button>}
              <Button size="sm" variant="outline" disabled={!version.trim() || busy} onClick={() => void importRelease()}><CloudDownload className="mr-2 h-4 w-4" />Import existing</Button>
            </div>
          </section>}

          <section className="space-y-2">
            <div className="flex items-end justify-between gap-3"><div><h3 className="text-sm font-semibold">Available releases</h3><p className="mt-1 text-xs text-muted-foreground">Ready releases can be selected later from the Deploy screen.</p></div>{releases.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}</div>
            {releases.isError && <p className="rounded-md border border-destructive/30 p-3 text-xs text-destructive">{releases.error.message}</p>}
            {(releases.data ?? []).length === 0 && !releases.isLoading && <div className="rounded-md border border-dashed p-6 text-center"><Package className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-2 text-sm font-medium">No releases yet</p><p className="mt-1 text-xs text-muted-foreground">Create a version above to start the build.</p></div>}
            <div className="space-y-2">
              {(releases.data ?? []).map((release) => <div key={release.id} className="rounded-lg border border-border/60 p-3">
                <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-sm font-semibold">{release.version}</p><p className="mt-1 text-[11px] text-muted-foreground">{formatDate(release.createdAt)}{release.commitSha ? ` · ${release.commitSha.slice(0, 9)}` : ''}</p></div><div className="flex items-center gap-1.5"><Badge variant={statusVariant(release.status)}>{release.status}</Badge>{canDeleteRelease && release.status !== 'building' && <Button type="button" size="sm" variant="ghost" aria-label={`Delete release ${release.version}`} onClick={() => { if (window.confirm(`Delete release '${release.version}'?`)) void actions.deleteRelease.mutateAsync(release.id).catch((cause) => fail('Release could not be deleted', cause)); }}><Trash2 className="h-3.5 w-3.5" /></Button>}</div></div>
                {release.error && <p className="mt-2 text-xs text-destructive">{release.error}</p>}
              </div>)}
            </div>
          </section>
        </div>
      </div>
    </SheetContent>
  </Sheet>;
};
