import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, GitBranch, Loader2, Plus, RefreshCw, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useArtifactActions, useRepoRefs } from '@/hooks/useArtifacts';
import { useSession } from '@/hooks/useSession';
import { useToast } from '@/hooks/use-toast';
import { can } from '@/lib/permissions';
import { formatRelativeTimeTr } from '@/lib/format';
import { isPreviewBranch, shortSha, VERSION_PATTERN } from '@/lib/releases';
import { cn } from '@/lib/utils';
import type { Project } from '@/hooks/useProjects';
import type { RepoRef } from '@/services/transport/types';
import { errorMessage } from '@/lib/errors';

type Props = {
  project: Project;
  onBuildFromTag: (tag: string) => void;
  onBuildFromBranch: (branch: string) => void;
};

const byNewest = (a: RepoRef, b: RepoRef) => (b.date ?? '').localeCompare(a.date ?? '');
const matches = (name: string, filter: string) => name.toLowerCase().includes(filter.trim().toLowerCase());

const RefMeta = ({ refItem }: { refItem: RepoRef }) => <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
  {shortSha(refItem.sha)}{refItem.date ? ` · ${formatRelativeTimeTr(refItem.date)}` : ''}
</span>;

/**
 * Kaynak kod: the repository's branches and tags, and the only place a tag is
 * created. Building from either hands over to the Sürümler dialogs.
 */
export const SourceTab = ({ project, onBuildFromTag, onBuildFromBranch }: Props) => {
  const { data: session } = useSession();
  const canTag = can(session?.role, 'release:tag');
  const canRelease = can(session?.role, 'release:create');
  const canBuild = canRelease && (project.config?.artifactDeploy?.build?.provider ?? 'none') !== 'none';
  const refs = useRepoRefs(project.id);
  const actions = useArtifactActions(project.id);
  const { toast } = useToast();

  const [creating, setCreating] = useState(false);
  const [tagFrom, setTagFrom] = useState('');
  const [tagName, setTagName] = useState('');
  const [tagMessage, setTagMessage] = useState('');
  const [filter, setFilter] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  const defaultBranch = refs.data?.defaultBranch ?? null;
  const branches = useMemo(() => {
    const all = refs.data?.branches ?? [];
    return [...all.filter((ref) => ref.name === defaultBranch), ...all.filter((ref) => ref.name !== defaultBranch)];
  }, [refs.data, defaultBranch]);
  const tags = useMemo(() => [...(refs.data?.tags ?? [])].sort(byNewest), [refs.data]);
  const visibleBranches = branches.filter((ref) => (showPreview || !isPreviewBranch(ref.name)) && matches(ref.name, filter));
  const hiddenPreviews = branches.filter((ref) => isPreviewBranch(ref.name)).length;

  useEffect(() => {
    if (!refs.data || tagFrom) return;
    const first = defaultBranch ?? branches[0]?.name;
    if (first) setTagFrom(first);
  }, [refs.data, tagFrom, defaultBranch, branches]);

  const tagNameValid = VERSION_PATTERN.test(tagName);
  const tagExists = tags.some((tag) => tag.name === tagName);

  const createTag = async () => {
    if (!tagFrom || !tagNameValid || tagExists) return;
    try {
      const { tag } = await actions.createTag.mutateAsync({ name: tagName, from: { type: 'branch', name: tagFrom }, message: tagMessage.trim() || undefined });
      setTagName('');
      setTagMessage('');
      setCreating(false);
      toast({ title: 'Tag oluşturuldu', description: `${tag.name} → ${tagFrom} @ ${shortSha(tag.sha)}` });
    } catch (cause) {
      toast({ title: 'Tag oluşturulamadı', description: errorMessage(cause), variant: 'destructive' });
    }
  };

  const header = <div className="flex items-end justify-between gap-3">
    <div>
      <h3 className="text-sm font-semibold">Kaynak kod</h3>
      <p className="mt-1 text-xs text-muted-foreground">Deponun branch ve tag'leri. Canlıya gidecek bir sürüm için önce tag oluşturun, sonra tag'den derleyin.</p>
    </div>
    <Button size="sm" variant="ghost" disabled={refs.isFetching} onClick={() => void refs.refetch()}><RefreshCw className={cn('h-3.5 w-3.5', refs.isFetching && 'animate-spin')} />Yenile</Button>
  </div>;

  if (refs.isLoading) return <div className="space-y-4">{header}<div className="flex h-40 items-center justify-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Branch ve tag'ler yükleniyor…</div></div>;

  if (refs.isError) return <div className="space-y-4">{header}<section className="rounded-lg border border-destructive/30 p-6 text-center">
    <AlertTriangle className="mx-auto h-6 w-6 text-destructive" />
    <h3 className="mt-3 text-sm font-semibold">Branch ve tag'ler alınamadı</h3>
    <p className="mx-auto mt-1 max-w-md whitespace-pre-line text-xs text-muted-foreground">{refs.error.message}</p>
    <p className="mx-auto mt-2 max-w-md text-[11px] text-muted-foreground">Kaynak, proje Ayarları → Derleme ve kaynak bölümünde tanımlanır.</p>
    <Button className="mt-4" size="sm" variant="outline" disabled={refs.isFetching} onClick={() => void refs.refetch()}><RefreshCw className="h-3.5 w-3.5" />Tekrar dene</Button>
  </section></div>;

  return <div className="space-y-4">
    {header}
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-3 rounded-lg border border-border/60 p-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="flex items-center gap-2 text-sm font-semibold"><Tag className="h-4 w-4 text-primary" />Tag'ler <span className="font-mono text-[11px] font-normal text-muted-foreground">{tags.length}</span></h4>
          {canTag && !creating && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCreating(true)}><Plus className="h-3 w-3" />Tag oluştur</Button>}
        </div>

        {canTag && creating && <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="source-tag-from">Branch</Label>
              <Select value={tagFrom} onValueChange={setTagFrom}>
                <SelectTrigger id="source-tag-from" className="mt-1.5"><SelectValue placeholder="Branch seçin" /></SelectTrigger>
                <SelectContent>{branches.filter((ref) => !isPreviewBranch(ref.name)).map((ref) => <SelectItem key={ref.name} value={ref.name}><span className="font-mono">{ref.name}</span> <span className="font-mono text-[10px] text-muted-foreground">{shortSha(ref.sha)}</span></SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="source-tag-name">Tag adı</Label>
              <Input id="source-tag-name" className="mt-1.5 font-mono" value={tagName} onChange={(event) => setTagName(event.target.value.trim())} placeholder="v1.4.0" aria-invalid={Boolean(tagName) && (!tagNameValid || tagExists)} />
            </div>
          </div>
          {tagName && !tagNameValid && <p className="text-[11px] text-destructive">Harf, rakam, '.', '_' veya '-'; harf ya da rakamla başlamalı, en çok 64 karakter.</p>}
          {tagNameValid && tagExists && <p className="text-[11px] text-destructive">Bu adda bir tag zaten var.</p>}
          <div><Label htmlFor="source-tag-message">Açıklama (isteğe bağlı)</Label><Input id="source-tag-message" className="mt-1.5" value={tagMessage} onChange={(event) => setTagMessage(event.target.value)} placeholder="Sürüm 1.4.0" /></div>
          <p className="text-[11px] text-muted-foreground">Tag, seçilen branch'in şu anki son commit'ine konur ve Bitbucket'a yazılır.</p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>Vazgeç</Button>
            <Button size="sm" disabled={!tagFrom || !tagNameValid || tagExists || actions.createTag.isPending} onClick={() => void createTag()}>{actions.createTag.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Tag oluştur</Button>
          </div>
        </div>}

        {tags.length === 0 ? <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">Henüz tag yok.</p>
          : <ul className="max-h-[52vh] space-y-1 overflow-y-auto">
            {tags.map((tag) => <li key={tag.name} className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs hover:bg-accent/30">
              <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate font-mono font-semibold" title={tag.message ?? undefined}>{tag.name}</span>
              <RefMeta refItem={tag} />
              {canBuild && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onBuildFromTag(tag.name)}>Sürüm derle</Button>}
            </li>)}
          </ul>}
      </section>

      <section className="space-y-3 rounded-lg border border-border/60 p-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="flex items-center gap-2 text-sm font-semibold"><GitBranch className="h-4 w-4 text-primary" />Branch'ler <span className="font-mono text-[11px] font-normal text-muted-foreground">{branches.length}</span></h4>
          {hiddenPreviews > 0 && <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
            <input type="checkbox" checked={showPreview} onChange={(event) => setShowPreview(event.target.checked)} className="h-3.5 w-3.5 accent-primary" />
            preview/* göster ({hiddenPreviews})
          </label>}
        </div>
        <Input className="h-8" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Branch ara" aria-label="Branch ara" />
        {visibleBranches.length === 0 ? <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">Eşleşen branch yok.</p>
          : <ul className="max-h-[52vh] space-y-1 overflow-y-auto">
            {visibleBranches.map((ref) => <li key={ref.name} className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs hover:bg-accent/30">
              <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate font-mono">{ref.name}</span>
              {ref.name === defaultBranch && <span className="rounded border border-border px-1.5 text-[10px] text-muted-foreground">varsayılan</span>}
              <RefMeta refItem={ref} />
              {canBuild && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onBuildFromBranch(ref.name)}>Test sürümü derle</Button>}
            </li>)}
          </ul>}
      </section>
    </div>
  </div>;
};
