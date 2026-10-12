import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CloudDownload, GitBranch, Loader2, Tag } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ComponentChecklist } from '@/components/artifacts/ComponentChecklist';
import { useArtifactActions, useArtifactReleases, useRepoRefs } from '@/hooks/useArtifacts';
import { useComponentSelection } from '@/hooks/useComponentSelection';
import { useToast } from '@/hooks/use-toast';
import { projectComponentNames } from '@/lib/deployTarget';
import { formatRelativeTimeTr } from '@/lib/format';
import { isPreviewBranch, shortSha, testVersionFor, VERSION_PATTERN } from '@/lib/releases';
import type { Project } from '@/hooks/useProjects';
import type { RepoRef } from '@/services/transport/types';

type BaseProps = {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRunStarted: (deploymentId: string) => void;
};

const byNewest = (a: RepoRef, b: RepoRef) => (b.date ?? '').localeCompare(a.date ?? '');

const VERSION_RULE = "Harf, rakam, '.', '_' veya '-'; harf ya da rakamla başlamalı, en çok 64 karakter.";

const failToast = (toast: ReturnType<typeof useToast>['toast'], title: string, cause: unknown) =>
  toast({ title, description: cause instanceof Error ? cause.message : 'Bilinmeyen hata.', variant: 'destructive' });

/** Shared frame of the three "build a version" dialogs: ref, components, one button. */
const BuildDialog = ({ open, onOpenChange, icon, title, description, children, components, selection, submitLabel, canSubmit, pending, onSubmit }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon: ReactNode;
  title: string;
  description: ReactNode;
  children: ReactNode;
  components: string[];
  selection: ReturnType<typeof useComponentSelection>;
  submitLabel: string;
  canSubmit: boolean;
  pending: boolean;
  onSubmit: () => void;
}) => <Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="sm:max-w-lg">
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2">{icon}{title}</DialogTitle>
      <DialogDescription>{description}</DialogDescription>
    </DialogHeader>
    <div className="space-y-4">
      {children}
      {components.length > 1 && <div>
        <Label>Derlenecek bileşenler</Label>
        <p className="mb-2 mt-1 text-[11px] text-muted-foreground">Sürüm yalnız seçilen bileşenleri taşır; kurulumda da yalnız onlar kurulabilir.</p>
        <ComponentChecklist components={components} selection={selection} label="Derlenecek bileşenler" />
      </div>}
    </div>
    <DialogFooter className="gap-2 sm:gap-0">
      <Button variant="outline" onClick={() => onOpenChange(false)}>Vazgeç</Button>
      <Button disabled={!canSubmit || pending} onClick={onSubmit}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}{submitLabel}</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>;

/** Refs could not be listed (not a Bitbucket source, token, network): say why, offer free text. */
const RefsUnavailable = ({ message }: { message: string }) => (
  <p className="whitespace-pre-line rounded-md border border-status-warn/40 bg-status-warn/5 p-3 text-[11px] text-muted-foreground">
    Branch ve tag listesi alınamadı: {message}
    {'\n'}Adı elle yazabilirsiniz.
  </p>
);

/** Path 1: a release named after a tag. The only kind meant for Canlı. */
export const TagReleaseDialog = ({ project, open, onOpenChange, onRunStarted, initialTag, onGoToSource }: BaseProps & { initialTag?: string | null; onGoToSource: () => void }) => {
  const refs = useRepoRefs(open ? project.id : undefined);
  const releases = useArtifactReleases(open ? project.id : undefined);
  const actions = useArtifactActions(project.id);
  const { toast } = useToast();
  const components = projectComponentNames(project);
  const selection = useComponentSelection(components);
  const { reset } = selection;
  const [tag, setTag] = useState('');
  const tags = useMemo(() => [...(refs.data?.tags ?? [])].sort(byNewest), [refs.data]);

  useEffect(() => {
    if (!open) return;
    reset();
    setTag(initialTag ?? '');
  }, [open, initialTag, reset]);

  useEffect(() => {
    if (open && !tag && tags.length > 0 && !initialTag) setTag(tags[0].name);
  }, [open, tag, tags, initialTag]);

  const name = tag.trim();
  const valid = VERSION_PATTERN.test(name);
  const exists = (releases.data ?? []).some((release) => release.version === name);

  const submit = async () => {
    try {
      const result = await actions.createRelease.mutateAsync({ version: name, ref: name, refType: 'tag', components: selection.filter });
      toast({ title: 'Sürüm derleniyor', description: `${name} · tag'den${selection.partial ? ` · ${selection.chosen.join(', ')}` : ''}` });
      onOpenChange(false);
      onRunStarted(result.deploymentId);
    } catch (cause) { failToast(toast, 'Derleme başlatılamadı', cause); }
  };

  return <BuildDialog
    open={open}
    onOpenChange={onOpenChange}
    icon={<Tag className="h-4 w-4 text-primary" />}
    title="Tag'den sürüm"
    description="Sürüm adı tag adıdır. Tag'den derlenen sürüm canlı dahil her müşteriye kurulabilir."
    components={components}
    selection={selection}
    submitLabel={name ? `${name} derle` : 'Derle'}
    canSubmit={Boolean(name) && valid && !exists}
    pending={actions.createRelease.isPending}
    onSubmit={() => void submit()}
  >
    <div>
      <Label htmlFor="tag-release-tag">Tag</Label>
      {refs.isError ? <>
        <RefsUnavailable message={refs.error.message} />
        <Input id="tag-release-tag" className="mt-2 font-mono" value={tag} onChange={(event) => setTag(event.target.value)} placeholder="v1.4.0" />
      </> : <Select value={tag} onValueChange={setTag} disabled={refs.isLoading}>
        <SelectTrigger id="tag-release-tag" className="mt-1.5"><SelectValue placeholder={refs.isLoading ? 'Tag\'ler yükleniyor…' : tags.length === 0 ? 'Henüz tag yok' : 'Tag seçin'} /></SelectTrigger>
        <SelectContent>{tags.map((item) => <SelectItem key={item.name} value={item.name}>
          <span className="font-mono">{item.name}</span>
          <span className="ml-2 font-mono text-[10px] text-muted-foreground">{shortSha(item.sha)}{item.date ? ` · ${formatRelativeTimeTr(item.date)}` : ''}</span>
        </SelectItem>)}</SelectContent>
      </Select>}
      {name && !valid && <p className="mt-1 text-[11px] text-destructive">Bu tag adı sürüm adı olamaz. {VERSION_RULE}</p>}
      {exists && <p className="mt-1 text-[11px] text-destructive">{name} sürümü zaten var.</p>}
      <button type="button" onClick={onGoToSource} className="mt-2 text-[11px] text-primary hover:underline">Yeni tag gerekiyorsa Kaynak kod sekmesinde oluşturun</button>
    </div>
  </BuildDialog>;
};

/** Path 3: one branch head, under a generated 0.0.0-… version. Test only. */
export const BranchReleaseDialog = ({ project, open, onOpenChange, onRunStarted, initialBranch }: BaseProps & { initialBranch?: string | null }) => {
  const refs = useRepoRefs(open ? project.id : undefined);
  const actions = useArtifactActions(project.id);
  const { toast } = useToast();
  const components = projectComponentNames(project);
  const selection = useComponentSelection(components);
  const { reset } = selection;
  const [branch, setBranch] = useState('');
  const defaultBranch = refs.data?.defaultBranch ?? null;
  const branches = useMemo(() => {
    const all = (refs.data?.branches ?? []).filter((ref) => !isPreviewBranch(ref.name) || ref.name === initialBranch);
    return [...all.filter((ref) => ref.name === defaultBranch), ...all.filter((ref) => ref.name !== defaultBranch)];
  }, [refs.data, defaultBranch, initialBranch]);

  useEffect(() => {
    if (!open) return;
    reset();
    setBranch(initialBranch ?? '');
  }, [open, initialBranch, reset]);

  useEffect(() => {
    if (open && !branch && !initialBranch && branches.length > 0) setBranch(branches[0].name);
  }, [open, branch, branches, initialBranch]);

  const name = branch.trim();
  const example = name ? testVersionFor(name) : null;

  const submit = async () => {
    const version = testVersionFor(name);
    if (!VERSION_PATTERN.test(version)) return;
    try {
      const result = await actions.createRelease.mutateAsync({ version, ref: name, refType: 'branch', components: selection.filter });
      toast({ title: 'Test sürümü derleniyor', description: `${version}${selection.partial ? ` · ${selection.chosen.join(', ')}` : ''}` });
      onOpenChange(false);
      onRunStarted(result.deploymentId);
    } catch (cause) { failToast(toast, 'Derleme başlatılamadı', cause); }
  };

  return <BuildDialog
    open={open}
    onOpenChange={onOpenChange}
    icon={<GitBranch className="h-4 w-4 text-primary" />}
    title="Tek branch'ten test sürümü"
    description="Branch'in son hâli derlenir; sürüm adı otomatik verilir. Yalnız test müşterileri için."
    components={components}
    selection={selection}
    submitLabel="Test sürümü derle"
    canSubmit={Boolean(name) && Boolean(example && VERSION_PATTERN.test(example))}
    pending={actions.createRelease.isPending}
    onSubmit={() => void submit()}
  >
    <div>
      <Label htmlFor="branch-release-branch">Branch</Label>
      {refs.isError ? <>
        <RefsUnavailable message={refs.error.message} />
        <Input id="branch-release-branch" className="mt-2 font-mono" value={branch} onChange={(event) => setBranch(event.target.value)} placeholder="develop" />
      </> : <Select value={branch} onValueChange={setBranch} disabled={refs.isLoading}>
        <SelectTrigger id="branch-release-branch" className="mt-1.5"><SelectValue placeholder={refs.isLoading ? 'Branch\'ler yükleniyor…' : 'Branch seçin'} /></SelectTrigger>
        <SelectContent>{branches.map((item) => <SelectItem key={item.name} value={item.name}>
          <span className="font-mono">{item.name}</span>
          {item.name === defaultBranch && <span className="ml-2 text-[10px] text-muted-foreground">varsayılan</span>}
          <span className="ml-2 font-mono text-[10px] text-muted-foreground">{shortSha(item.sha)}</span>
        </SelectItem>)}</SelectContent>
      </Select>}
      {example && <p className="mt-2 text-[11px] text-muted-foreground">Sürüm adı şöyle olacak: <span className="font-mono text-foreground">{example}</span></p>}
    </div>
  </BuildDialog>;
};

/** Path 4: register an artifact that is already uploaded to IDP. */
export const ImportReleaseDialog = ({ project, open, onOpenChange }: Omit<BaseProps, 'onRunStarted'>) => {
  const actions = useArtifactActions(project.id);
  const { toast } = useToast();
  const [version, setVersion] = useState('');

  useEffect(() => {
    if (open) setVersion('');
  }, [open]);

  const name = version.trim();
  const valid = VERSION_PATTERN.test(name);

  const submit = async () => {
    try {
      const release = await actions.importRelease.mutateAsync(name);
      toast({ title: 'Paket içe aktarıldı', description: release.version });
      onOpenChange(false);
    } catch (cause) { failToast(toast, 'Paket içe aktarılamadı', cause); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><CloudDownload className="h-4 w-4 text-primary" />Hazır paketi içe aktar</DialogTitle>
        <DialogDescription>CI'ın IDP'ye zaten yüklediği bir paketi, derlemeden sürüm olarak kaydeder.</DialogDescription>
      </DialogHeader>
      <div>
        <Label htmlFor="import-version">Sürüm</Label>
        <Input id="import-version" className="mt-1.5 font-mono" value={version} onChange={(event) => setVersion(event.target.value)} placeholder="1.4.0" />
        {name && !valid && <p className="mt-1 text-[11px] text-destructive">{VERSION_RULE}</p>}
      </div>
      <DialogFooter className="gap-2 sm:gap-0">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Vazgeç</Button>
        <Button disabled={!valid || actions.importRelease.isPending} onClick={() => void submit()}>{actions.importRelease.isPending && <Loader2 className="h-4 w-4 animate-spin" />}İçe aktar</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
};
