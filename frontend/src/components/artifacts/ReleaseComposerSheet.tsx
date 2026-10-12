import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, GitBranch, GitMerge, Loader2, RefreshCw, Tag, X } from 'lucide-react';
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
import { formatRelativeTimeTr } from '@/lib/format';
import { isPreviewBranch, shortSha } from '@/lib/releases';
import { environmentLabel, isProdTarget, projectComponentNames, targetEnvironment } from '@/lib/deployTarget';
import { useComponentSelection } from '@/hooks/useComponentSelection';
import { ComponentChecklist } from '@/components/artifacts/ComponentChecklist';
import { errorCode, PREVIEW_NOT_ALLOWED_ON_PROD } from '@/services/transport/errors';
import type { Project } from '@/hooks/useProjects';
import type { RepoRef, RepoRefType } from '@/services/transport/types';
import { errorMessage } from '@/lib/errors';

type Props = {
  project: Project | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onRunStarted: (deploymentId: string) => void;
};

/** The backend merges at most this many feature branches into one preview. */
const MAX_BRANCHES = 10;
const NO_DEPLOY = 'none';

const BASE_OPTIONS = [
  { value: 'branch', label: 'Branch' },
  { value: 'tag', label: 'Tag' },
] as const;

const matches = (name: string, filter: string) => name.toLowerCase().includes(filter.trim().toLowerCase());
const byNewest = (a: RepoRef, b: RepoRef) => (b.date ?? '').localeCompare(a.date ?? '');

/** sha · 3 gün önce — what tells two similarly named branches apart. */
const RefMeta = ({ refItem }: { refItem: RepoRef }) => <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
  {shortSha(refItem.sha)}{refItem.date ? ` · ${formatRelativeTimeTr(refItem.date)}` : ''}
</span>;

export const ReleaseComposerSheet = ({ project, isOpen, onOpenChange, onRunStarted }: Props) => {
  const projectId = project?.id;
  const { data: session } = useSession();
  const canRelease = can(session?.role, 'release:create');
  const canDeploy = can(session?.role, 'deploy:trigger');
  const refs = useRepoRefs(isOpen ? projectId : undefined);
  const targets = useArtifactTargets(isOpen ? projectId : undefined);
  const actions = useArtifactActions(projectId ?? '');
  const { toast } = useToast();
  const components = project ? projectComponentNames(project) : [];
  const selection = useComponentSelection(components);
  const resetSelection = selection.reset;

  const [baseType, setBaseType] = useState<RepoRefType>('branch');
  const [baseName, setBaseName] = useState('');
  const [baseFilter, setBaseFilter] = useState('');
  // Selection order is merge order, so this is a list, not a set.
  const [features, setFeatures] = useState<string[]>([]);
  const [featureFilter, setFeatureFilter] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [version, setVersion] = useState('');
  const [deployTargetId, setDeployTargetId] = useState(NO_DEPLOY);

  useEffect(() => {
    setBaseType('branch');
    setBaseName('');
    setBaseFilter('');
    setFeatures([]);
    setFeatureFilter('');
    setShowPreview(false);
    setVersion('');
    resetSelection();
    setDeployTargetId(NO_DEPLOY);
  }, [projectId, resetSelection]);

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

  if (!project) return null;

  const fail = (title: string, cause: unknown) => toast({ title, description: errorMessage(cause), variant: 'destructive' });
  const buildProvider = project.config?.artifactDeploy?.build?.provider ?? 'none';
  const chosen = selection.chosen;
  const partial = selection.partial;

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
        title: 'Önizleme derleniyor',
        description: `${result.release.version} · ${baseName} + ${features.join(' + ')}${deployTarget ? ` → ${deployTarget.name}` : ''}`,
      });
      onRunStarted(result.deploymentId);
    } catch (cause) {
      if (errorCode(cause) === PREVIEW_NOT_ALLOWED_ON_PROD) {
        toast({ title: 'Önizleme canlıya kurulamaz', description: 'Bir test müşterisi seçin ya da kurmadan derleyin.', variant: 'destructive' });
        return;
      }
      fail('Önizleme derlenemedi', cause);
    }
  };

  const canCompose = Boolean(canRelease && buildProvider !== 'none' && baseRef && features.length > 0 && !deployHasNothing && !actions.composeRelease.isPending);

  return <Sheet open={isOpen} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="flex w-[min(900px,calc(100vw-3rem))] max-w-none flex-col overflow-hidden border-l-line-strong bg-background p-0 sm:max-w-none">
      <div className="shrink-0 border-b border-line-strong bg-bar px-7 py-6">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3 text-xl"><GitMerge className="h-5 w-5 text-primary" />Önizleme sürümü · {project.name}</SheetTitle>
          <SheetDescription>Bir tabanın üstüne birkaç branch Bitbucket'ta bir preview/* branch'inde birleştirilir ve tek sürüm olarak derlenir. Önizleme sürümleri yalnız test müşterilerine kurulur.</SheetDescription>
        </SheetHeader>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-7">
        {refs.isLoading ? <div className="flex h-48 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : refs.isError ? <section className="rounded-lg border border-destructive/30 p-6 text-center">
          <AlertTriangle className="mx-auto h-6 w-6 text-destructive" />
          <h3 className="mt-3 text-sm font-semibold">Branch ve tag'ler alınamadı</h3>
          <p className="mx-auto mt-1 max-w-md whitespace-pre-line text-xs leading-5 text-muted-foreground">{refs.error.message}</p>
          <Button className="mt-4" variant="outline" size="sm" disabled={refs.isFetching} onClick={() => void refs.refetch()}><RefreshCw className={cn('mr-2 h-3.5 w-3.5', refs.isFetching && 'animate-spin')} />Tekrar dene</Button>
        </section> : <div className="mx-auto max-w-3xl space-y-6">
          <div className="flex items-center justify-between gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={showPreview} onChange={(event) => setShowPreview(event.target.checked)} className="h-3.5 w-3.5 accent-primary" />
              preview/* branch'lerini göster
            </label>
            <Button size="sm" variant="ghost" disabled={refs.isFetching} onClick={() => void refs.refetch()}><RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', refs.isFetching && 'animate-spin')} />Yenile</Button>
          </div>

          <section className="rounded-lg border border-border/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h3 className="text-sm font-semibold">Taban</h3><p className="mt-1 text-xs text-muted-foreground">Önizlemenin başladığı nokta. Branch'ler bunun üstüne birleştirilir.</p></div>
              <Segmented label="Taban türü" options={BASE_OPTIONS} value={baseType} onChange={changeBaseType} />
            </div>
            <Input className="mt-3 h-8" value={baseFilter} onChange={(event) => setBaseFilter(event.target.value)} placeholder={baseType === 'branch' ? 'Branch ara' : 'Tag ara'} aria-label={baseType === 'branch' ? 'Taban branch ara' : 'Taban tag ara'} />
            <div role="radiogroup" aria-label="Taban" className="mt-2 max-h-56 space-y-1 overflow-y-auto">
              {baseList.length === 0 && <p className="px-3 py-4 text-center text-xs text-muted-foreground">{baseType === 'branch' ? 'Eşleşen branch yok.' : 'Eşleşen tag yok.'}</p>}
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
                  {ref.name === defaultBranch && baseType === 'branch' && <Badge variant="outline" className="px-1.5 py-0 text-[10px]">varsayılan</Badge>}
                  <RefMeta refItem={ref} />
                </button>;
              })}
            </div>
          </section>

          <section className="rounded-lg border border-border/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div><h3 className="text-sm font-semibold">Birleştirilecek branch'ler</h3><p className="mt-1 text-xs text-muted-foreground">Seçtiğiniz sırayla birleştirilir; bir çakışma derlemeyi o branch'te durdurur. En çok {MAX_BRANCHES}.</p></div>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{features.length}/{MAX_BRANCHES}</span>
            </div>
            {features.length > 0 && <ol className="mt-3 flex flex-wrap gap-1.5" aria-label="Birleştirme sırası">
              {features.map((name, index) => <li key={name} className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 py-1 pl-2 pr-1 text-xs">
                <span className="font-mono text-[10px] text-primary">{index + 1}</span>
                <span className="font-mono">{name}</span>
                <button type="button" onClick={() => toggleFeature(name)} aria-label={`${name} çıkar`} className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"><X className="h-3 w-3" /></button>
              </li>)}
            </ol>}
            <Input className="mt-3 h-8" value={featureFilter} onChange={(event) => setFeatureFilter(event.target.value)} placeholder="Branch ara" aria-label="Birleştirilecek branch ara" />
            <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
              {featureList.length === 0 && <p className="px-3 py-4 text-center text-xs text-muted-foreground">Eşleşen branch yok.</p>}
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
                  <input type="checkbox" checked={active} disabled={blocked} onChange={() => toggleFeature(ref.name)} className="h-3.5 w-3.5 accent-primary" aria-label={`${ref.name} birleştir`} />
                  <span className="w-4 shrink-0 text-center font-mono text-[10px] text-primary">{active ? order + 1 : ''}</span>
                  <span className="min-w-0 flex-1 truncate font-mono">{ref.name}</span>
                  <RefMeta refItem={ref} />
                </label>;
              })}
            </div>
          </section>

          <section className="rounded-lg border border-border/60 p-4">
            <h3 className="text-sm font-semibold">Sürüm</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div><Label htmlFor="compose-version">Sürüm adı (isteğe bağlı)</Label><Input id="compose-version" className="mt-1.5 font-mono" value={version} onChange={(event) => setVersion(event.target.value)} placeholder="0.0.0-preview.<timestamp>" /></div>
              {canDeploy && <div>
                <Label htmlFor="compose-deploy">Derlenince test müşterisine kur</Label>
                <Select value={deployTargetId} onValueChange={setDeployTargetId}>
                  <SelectTrigger id="compose-deploy" className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_DEPLOY}>Yalnız derle</SelectItem>
                    {testTargets.map((target) => <SelectItem key={target.id} value={target.id}>{target.name} · {environmentLabel(targetEnvironment(target, project))}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="mt-1.5 text-[11px] text-muted-foreground">{testTargets.length === 0 && !targets.isLoading ? 'Test müşterisi tanımlı değil.' : 'Canlı müşteriler listelenmez: önizleme oraya kurulmaz.'}</p>
              </div>}
            </div>
            {buildProvider !== 'none' && components.length > 1 && <div className="mt-4">
              <Label>Derlenecek bileşenler</Label>
              <div className="mt-2"><ComponentChecklist components={components} selection={selection} label="Derlenecek bileşenler" /></div>
            </div>}
            {deployHasNothing && <p className="mt-3 text-xs text-destructive">{deployTarget?.name} seçilen bileşenlerin hiçbirini barındırmıyor.</p>}
          </section>

          <section className="rounded-lg border border-primary/40 bg-primary/5 p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">Özet</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm font-semibold">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-background px-3 py-2 font-mono">{baseType === 'branch' ? <GitBranch className="h-3.5 w-3.5" /> : <Tag className="h-3.5 w-3.5" />}{baseName || 'Taban seçin'}</span>
              {features.length === 0 ? <span className="text-xs font-normal text-muted-foreground">+ en az bir branch seçin</span> : features.map((name) => <span key={name} className="inline-flex items-center gap-2"><span className="text-muted-foreground">+</span><span className="rounded-md bg-background px-3 py-2 font-mono">{name}</span></span>)}
              <ArrowRight className="h-4 w-4 text-primary" aria-hidden="true" />
              <span className="rounded-md bg-background px-3 py-2">{deployTarget ? `önizleme → ${deployTarget.name}` : 'önizleme sürümü'}</span>
            </div>
            {partial && <p className="mt-2 text-xs text-muted-foreground">Yalnız <span className="font-mono text-foreground">{chosen.join(', ')}</span> derlenir.</p>}
            {buildProvider === 'none' && <p className="mt-3 text-xs text-destructive">Bu projede derleme sağlayıcısı tanımlı değil; burada derleme yapılamaz.</p>}
            {!canRelease && <p className="mt-3 text-xs text-muted-foreground">Rolünüz derleme başlatamaz.</p>}
            <Button className="mt-4" disabled={!canCompose} onClick={() => void compose()}>{actions.composeRelease.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitMerge className="mr-2 h-4 w-4" />}{actions.composeRelease.isPending ? 'Derleniyor…' : deployTarget ? 'Önizlemeyi derle ve kur' : 'Önizlemeyi derle'}</Button>
          </section>

        </div>}
      </div>
    </SheetContent>
  </Sheet>;
};
