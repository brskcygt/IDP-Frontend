import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, GitBranch, GitMerge, Loader2, Plus, RefreshCw, Rocket, Tag, X } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Segmented } from '@/components/ui/segmented';
import { useArtifactActions, useArtifactTargets, useRepoRefs } from '@/hooks/useArtifacts';
import { useSession } from '@/hooks/useSession';
import { can } from '@/lib/permissions';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/format';
import { isProdTarget } from '@/lib/deployTarget';
import { errorCode, PREVIEW_NOT_ALLOWED_ON_PROD } from '@/services/transport/errors';
import type { Project } from '@/hooks/useProjects';
import type { RepoRef, RepoRefType } from '@/services/transport/types';

type Props = {
  project: Project | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onRunStarted: (deploymentId: string) => void;
};

/** The backend merges at most this many feature branches into one preview. */
const MAX_BRANCHES = 10;
/** Mirrors the backend's tag name rule: no leading dot/dash, no spaces or slashes. */
const TAG_NAME = /^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$/;
const RECENT_TAGS = 8;
const NO_DEPLOY = 'none';

const BASE_OPTIONS = [
  { value: 'branch', label: 'Branch' },
  { value: 'tag', label: 'Tag' },
] as const;

const isPreviewBranch = (name: string) => name.startsWith('preview/');
const shortSha = (sha: string) => sha.slice(0, 7);
const matches = (name: string, filter: string) => name.toLowerCase().includes(filter.trim().toLowerCase());
const byNewest = (a: RepoRef, b: RepoRef) => (b.date ?? '').localeCompare(a.date ?? '');

/** sha · 3d ago — what tells two similarly named branches apart. */
const RefMeta = ({ refItem }: { refItem: RepoRef }) => <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
  {shortSha(refItem.sha)}{refItem.date ? ` · ${formatRelativeTime(refItem.date)}` : ''}
</span>;

export const ReleaseComposerSheet = ({ project, isOpen, onOpenChange, onRunStarted }: Props) => {
  const projectId = project?.id;
  const { data: session } = useSession();
  const canRelease = can(session?.role, 'release:create');
  const canDeploy = can(session?.role, 'deploy:trigger');
  const canTag = can(session?.role, 'release:tag');
  const refs = useRepoRefs(isOpen ? projectId : undefined);
  const targets = useArtifactTargets(isOpen ? projectId : undefined);
  const actions = useArtifactActions(projectId ?? '');
  const { toast } = useToast();

  const [baseType, setBaseType] = useState<RepoRefType>('branch');
  const [baseName, setBaseName] = useState('');
  const [baseFilter, setBaseFilter] = useState('');
  // Selection order is merge order, so this is a list, not a set.
  const [features, setFeatures] = useState<string[]>([]);
  const [featureFilter, setFeatureFilter] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [version, setVersion] = useState('');
  // null = every component, which is also what the request means when omitted.
  const [selected, setSelected] = useState<ReadonlySet<string> | null>(null);
  const [deployTargetId, setDeployTargetId] = useState(NO_DEPLOY);
  const [tagFrom, setTagFrom] = useState('');
  const [tagName, setTagName] = useState('');
  const [tagMessage, setTagMessage] = useState('');

  useEffect(() => {
    setBaseType('branch');
    setBaseName('');
    setBaseFilter('');
    setFeatures([]);
    setFeatureFilter('');
    setShowPreview(false);
    setVersion('');
    setSelected(null);
    setDeployTargetId(NO_DEPLOY);
    setTagFrom('');
    setTagName('');
    setTagMessage('');
  }, [projectId]);

  const defaultBranch = refs.data?.defaultBranch ?? null;
  const branches = useMemo(() => {
    const all = refs.data?.branches ?? [];
    // Default branch first: it is the base nine times out of ten.
    return [...all.filter((ref) => ref.name === defaultBranch), ...all.filter((ref) => ref.name !== defaultBranch)];
  }, [refs.data, defaultBranch]);
  const tags = useMemo(() => [...(refs.data?.tags ?? [])].sort(byNewest), [refs.data]);
  const visibleBranches = useMemo(() => branches.filter((ref) => showPreview || !isPreviewBranch(ref.name)), [branches, showPreview]);

  // Land on the default branch (or newest tag) once refs arrive or the type flips.
  useEffect(() => {
    if (!refs.data || baseName) return;
    const first = baseType === 'branch' ? (defaultBranch ?? branches[0]?.name) : tags[0]?.name;
    if (first) setBaseName(first);
  }, [refs.data, baseType, baseName, defaultBranch, branches, tags]);

  useEffect(() => {
    if (!refs.data || tagFrom) return;
    const first = defaultBranch ?? branches[0]?.name;
    if (first) setTagFrom(first);
  }, [refs.data, tagFrom, defaultBranch, branches]);

  if (!project) return null;

  const fail = (title: string, cause: unknown) => toast({ title, description: cause instanceof Error ? cause.message : 'Unknown error.', variant: 'destructive' });
  const buildProvider = project.config?.artifactDeploy?.build?.provider ?? 'none';
  const components = (project.config?.artifactDeploy?.components ?? []).map((component) => component.name);
  const chosen = components.filter((name) => selected === null || selected.has(name));
  const partial = chosen.length !== components.length;

  const baseList = (baseType === 'branch' ? visibleBranches : tags).filter((ref) => matches(ref.name, baseFilter));
  const baseRef = (baseType === 'branch' ? branches : tags).find((ref) => ref.name === baseName);
  // The base cannot also be merged into itself.
  const featureCandidates = visibleBranches.filter((ref) => !(baseType === 'branch' && ref.name === baseName));
  const featureList = featureCandidates.filter((ref) => matches(ref.name, featureFilter));
  const atLimit = features.length >= MAX_BRANCHES;

  const testTargets = (targets.data ?? []).filter((target) => !isProdTarget(target, project));
  const deployTarget = testTargets.find((target) => target.id === deployTargetId);
  // A partial build can only install what it built; a target that hosts a fixed
  // subset narrows it further.
  const deployComponents = (() => {
    if (!deployTarget || !partial) return undefined;
    const hosted = (deployTarget.components ?? []).map((component) => component.name);
    return hosted.length > 0 ? chosen.filter((name) => hosted.includes(name)) : chosen;
  })();
  const deployHasNothing = Boolean(deployComponents && deployComponents.length === 0);

  const tagNameValid = TAG_NAME.test(tagName);
  const tagExists = tags.some((tag) => tag.name === tagName);

  const changeBaseType = (next: RepoRefType) => {
    if (next === baseType) return;
    setBaseType(next);
    setBaseName('');
    setBaseFilter('');
  };

  const pickBase = (name: string) => {
    setBaseName(name);
    if (baseType === 'branch') setFeatures((current) => current.filter((feature) => feature !== name));
  };

  const toggleFeature = (name: string) => setFeatures((current) => {
    if (current.includes(name)) return current.filter((feature) => feature !== name);
    return current.length >= MAX_BRANCHES ? current : [...current, name];
  });

  const toggleComponent = (name: string) => setSelected((current) => {
    const next = new Set(current ?? components);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    return next;
  });

  const compose = async () => {
    if (!baseName || features.length === 0) return;
    try {
      const result = await actions.composeRelease.mutateAsync({
        base: { type: baseType, name: baseName },
        branches: features,
        version: version.trim() || undefined,
        components: partial ? chosen : undefined,
        deployTo: deployTarget ? { targetId: deployTarget.id, components: deployComponents } : undefined,
      });
      toast({
        title: 'Preview build started',
        description: `${result.release.version} · ${baseName} + ${features.join(' + ')}${deployTarget ? ` → ${deployTarget.name}` : ''}`,
      });
      onRunStarted(result.deploymentId);
    } catch (cause) {
      if (errorCode(cause) === PREVIEW_NOT_ALLOWED_ON_PROD) {
        toast({ title: 'Preview builds cannot go to production', description: 'Pick a test customer, or build without deploying.', variant: 'destructive' });
        return;
      }
      fail('Preview build could not start', cause);
    }
  };

  const createTag = async () => {
    if (!tagFrom || !tagNameValid) return;
    try {
      const { tag } = await actions.createTag.mutateAsync({
        name: tagName,
        from: { type: 'branch', name: tagFrom },
        message: tagMessage.trim() || undefined,
      });
      setTagName('');
      setTagMessage('');
      toast({ title: 'Tag created', description: `${tag.name} → ${tagFrom} @ ${shortSha(tag.sha)}` });
    } catch (cause) { fail('Tag could not be created', cause); }
  };

  const buildFromTag = async (tag: RepoRef) => {
    try {
      const result = await actions.createRelease.mutateAsync({ version: tag.name, ref: tag.name, refType: 'tag' });
      toast({ title: 'Release build started', description: `${tag.name} · from tag` });
      onRunStarted(result.deploymentId);
    } catch (cause) { fail('Release build failed', cause); }
  };

  const canCompose = Boolean(canRelease && buildProvider !== 'none' && baseRef && features.length > 0 && !deployHasNothing && !actions.composeRelease.isPending);

  return <Sheet open={isOpen} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="flex w-[min(900px,calc(100vw-3rem))] max-w-none flex-col overflow-hidden border-l-line-strong bg-background p-0 sm:max-w-none">
      <div className="shrink-0 border-b border-line-strong bg-bar px-7 py-6">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3 text-xl"><GitMerge className="h-5 w-5 text-primary" />Compose release · {project.name}</SheetTitle>
          <SheetDescription>Merge feature branches onto a base in a preview branch on Bitbucket and build the result as one release. Previews can only be installed on test customers.</SheetDescription>
        </SheetHeader>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-7">
        {refs.isLoading ? <div className="flex h-48 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : refs.isError ? <section className="rounded-lg border border-destructive/30 p-6 text-center">
          <AlertTriangle className="mx-auto h-6 w-6 text-destructive" />
          <h3 className="mt-3 text-sm font-semibold">Branches and tags could not be loaded</h3>
          <p className="mx-auto mt-1 max-w-md whitespace-pre-line text-xs leading-5 text-muted-foreground">{refs.error.message}</p>
          <Button className="mt-4" variant="outline" size="sm" disabled={refs.isFetching} onClick={() => void refs.refetch()}><RefreshCw className={cn('mr-2 h-3.5 w-3.5', refs.isFetching && 'animate-spin')} />Try again</Button>
        </section> : <div className="mx-auto max-w-3xl space-y-6">
          <div className="flex items-center justify-between gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={showPreview} onChange={(event) => setShowPreview(event.target.checked)} className="h-3.5 w-3.5 accent-primary" />
              Show preview/* branches
            </label>
            <Button size="sm" variant="ghost" disabled={refs.isFetching} onClick={() => void refs.refetch()}><RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', refs.isFetching && 'animate-spin')} />Refresh branches</Button>
          </div>

          <section className="rounded-lg border border-border/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h3 className="text-sm font-semibold">Base</h3><p className="mt-1 text-xs text-muted-foreground">What the preview starts from. Feature branches are merged on top of it.</p></div>
              <Segmented label="Base type" options={BASE_OPTIONS} value={baseType} onChange={changeBaseType} />
            </div>
            <Input className="mt-3 h-8" value={baseFilter} onChange={(event) => setBaseFilter(event.target.value)} placeholder={baseType === 'branch' ? 'Filter branches' : 'Filter tags'} aria-label={baseType === 'branch' ? 'Filter base branches' : 'Filter base tags'} />
            <div role="radiogroup" aria-label="Base ref" className="mt-2 max-h-56 space-y-1 overflow-y-auto">
              {baseList.length === 0 && <p className="px-3 py-4 text-center text-xs text-muted-foreground">{baseType === 'branch' ? 'No matching branch.' : 'No matching tag.'}</p>}
              {baseList.map((ref) => {
                const active = ref.name === baseName;
                return <button
                  key={ref.name}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => pickBase(ref.name)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-xs transition-colors',
                    active ? 'bg-primary/10 ring-1 ring-primary/40' : 'hover:bg-accent/40',
                  )}
                >
                  {baseType === 'branch' ? <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 flex-1 truncate font-mono">{ref.name}</span>
                  {ref.name === defaultBranch && baseType === 'branch' && <Badge variant="outline" className="px-1.5 py-0 text-[10px]">default</Badge>}
                  <RefMeta refItem={ref} />
                </button>;
              })}
            </div>
          </section>

          <section className="rounded-lg border border-border/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div><h3 className="text-sm font-semibold">Feature branches</h3><p className="mt-1 text-xs text-muted-foreground">Merged in the order you pick them — a conflict stops the build at that branch. Up to {MAX_BRANCHES}.</p></div>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{features.length}/{MAX_BRANCHES}</span>
            </div>
            {features.length > 0 && <ol className="mt-3 flex flex-wrap gap-1.5" aria-label="Merge order">
              {features.map((name, index) => <li key={name} className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 py-1 pl-2 pr-1 text-xs">
                <span className="font-mono text-[10px] text-primary">{index + 1}</span>
                <span className="font-mono">{name}</span>
                <button type="button" onClick={() => toggleFeature(name)} aria-label={`Remove ${name}`} className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"><X className="h-3 w-3" /></button>
              </li>)}
            </ol>}
            <Input className="mt-3 h-8" value={featureFilter} onChange={(event) => setFeatureFilter(event.target.value)} placeholder="Filter branches" aria-label="Filter feature branches" />
            <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
              {featureList.length === 0 && <p className="px-3 py-4 text-center text-xs text-muted-foreground">No matching branch.</p>}
              {featureList.map((ref) => {
                const order = features.indexOf(ref.name);
                const active = order >= 0;
                const blocked = !active && atLimit;
                return <label
                  key={ref.name}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md px-3 py-1.5 text-xs transition-colors',
                    active ? 'bg-accent/30 ring-1 ring-primary/30' : 'hover:bg-accent/20',
                    blocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
                  )}
                >
                  <input type="checkbox" checked={active} disabled={blocked} onChange={() => toggleFeature(ref.name)} className="h-3.5 w-3.5 accent-primary" aria-label={`Merge ${ref.name}`} />
                  <span className="w-4 shrink-0 text-center font-mono text-[10px] text-primary">{active ? order + 1 : ''}</span>
                  <span className="min-w-0 flex-1 truncate font-mono">{ref.name}</span>
                  <RefMeta refItem={ref} />
                </label>;
              })}
            </div>
          </section>

          <section className="rounded-lg border border-border/60 p-4">
            <h3 className="text-sm font-semibold">Release</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div><Label htmlFor="compose-version">Version (optional)</Label><Input id="compose-version" className="mt-1.5 font-mono" value={version} onChange={(event) => setVersion(event.target.value)} placeholder="0.0.0-preview.<timestamp>" /></div>
              {canDeploy && <div>
                <Label htmlFor="compose-deploy">Deploy to test customer after build</Label>
                <Select value={deployTargetId} onValueChange={setDeployTargetId}>
                  <SelectTrigger id="compose-deploy" className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_DEPLOY}>Build only</SelectItem>
                    {testTargets.map((target) => <SelectItem key={target.id} value={target.id}>{target.name} · {target.environment ?? project.environment}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="mt-1.5 text-[11px] text-muted-foreground">{testTargets.length === 0 && !targets.isLoading ? 'No test customer configured.' : 'Production customers are not listed: a preview never goes there.'}</p>
              </div>}
            </div>
            {buildProvider !== 'none' && components.length > 1 && <div className="mt-4">
              <Label>Components to build</Label>
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
                    <input type="checkbox" checked={active} disabled={onlyOne} onChange={() => toggleComponent(name)} className="h-3.5 w-3.5 accent-primary" />
                    <span className="font-mono">{name}</span>
                  </label>;
                })}
              </div>
            </div>}
            {deployHasNothing && <p className="mt-3 text-xs text-destructive">{deployTarget?.name} hosts none of the selected components.</p>}
          </section>

          <section className="rounded-lg border border-primary/40 bg-primary/5 p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">Preview summary</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm font-semibold">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-background px-3 py-2 font-mono">{baseType === 'branch' ? <GitBranch className="h-3.5 w-3.5" /> : <Tag className="h-3.5 w-3.5" />}{baseName || 'Select base'}</span>
              {features.length === 0 ? <span className="text-xs font-normal text-muted-foreground">+ pick at least one feature branch</span> : features.map((name) => <span key={name} className="inline-flex items-center gap-2"><span className="text-muted-foreground">+</span><span className="rounded-md bg-background px-3 py-2 font-mono">{name}</span></span>)}
              <ArrowRight className="h-4 w-4 text-primary" aria-hidden="true" />
              <span className="rounded-md bg-background px-3 py-2">{deployTarget ? `preview build → ${deployTarget.name}` : 'preview build'}</span>
            </div>
            {partial && <p className="mt-2 text-xs text-muted-foreground">Only <span className="font-mono text-foreground">{chosen.join(', ')}</span> is built.</p>}
            {buildProvider === 'none' && <p className="mt-3 text-xs text-destructive">This project has no CI provider configured, so nothing can be built here.</p>}
            {!canRelease && <p className="mt-3 text-xs text-muted-foreground">Your role cannot start builds.</p>}
            <Button className="mt-4" disabled={!canCompose} onClick={() => void compose()}>{actions.composeRelease.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitMerge className="mr-2 h-4 w-4" />}{actions.composeRelease.isPending ? 'Building…' : deployTarget ? 'Build & deploy preview' : 'Build preview'}</Button>
          </section>

          {(canTag || canRelease) && <section className="border-t border-line-strong pt-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Tag className="h-4 w-4 text-primary" />Tags</h3>
            <p className="mt-1 text-xs text-muted-foreground">A release built from a tag is a regular release: it can go to any customer, production included, from the Deploy screen.</p>

            {canTag && <div className="mt-4 rounded-lg border border-border/60 p-4">
              <p className="text-xs font-semibold">Create tag from a branch head</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="tag-from">Branch</Label>
                  <Select value={tagFrom} onValueChange={setTagFrom}>
                    <SelectTrigger id="tag-from" className="mt-1.5"><SelectValue placeholder="Select a branch" /></SelectTrigger>
                    <SelectContent>{visibleBranches.map((ref) => <SelectItem key={ref.name} value={ref.name}><span className="font-mono">{ref.name}</span> <span className="font-mono text-[10px] text-muted-foreground">{shortSha(ref.sha)}</span></SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="tag-name">Tag name</Label>
                  <Input id="tag-name" className="mt-1.5 font-mono" value={tagName} onChange={(event) => setTagName(event.target.value.trim())} placeholder="v1.4.0" aria-invalid={Boolean(tagName) && (!tagNameValid || tagExists)} />
                  {tagName && !tagNameValid && <p className="mt-1 text-[11px] text-destructive">Letters, digits, '.', '_' or '-', starting with a letter or digit, at most 64 characters.</p>}
                  {tagNameValid && tagExists && <p className="mt-1 text-[11px] text-destructive">A tag with this name already exists.</p>}
                </div>
              </div>
              <div className="mt-3"><Label htmlFor="tag-message">Message (optional)</Label><Input id="tag-message" className="mt-1.5" value={tagMessage} onChange={(event) => setTagMessage(event.target.value)} placeholder="Release 1.4.0" /></div>
              <Button className="mt-3" size="sm" disabled={!tagFrom || !tagNameValid || tagExists || actions.createTag.isPending} onClick={() => void createTag()}>{actions.createTag.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Create tag</Button>
            </div>}

            <div className="mt-4 space-y-1.5">
              <p className="text-xs font-semibold">Recent tags</p>
              {tags.length === 0 && <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">No tags yet.</p>}
              {tags.slice(0, RECENT_TAGS).map((tag) => <div key={tag.name} className="flex items-center gap-2.5 rounded-md border border-border/60 px-3 py-2 text-xs">
                <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono font-semibold">{tag.name}</span>
                <RefMeta refItem={tag} />
                {canRelease && buildProvider !== 'none' && <Button size="sm" variant="outline" className="h-7" disabled={actions.createRelease.isPending} onClick={() => void buildFromTag(tag)}><Rocket className="mr-1.5 h-3.5 w-3.5" />Build release</Button>}
              </div>)}
            </div>
          </section>}
        </div>}
      </div>
    </SheetContent>
  </Sheet>;
};
