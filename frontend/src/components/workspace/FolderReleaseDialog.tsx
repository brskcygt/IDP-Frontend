import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileArchive, Folder, FolderOpen, Loader2, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useArtifactActions, useArtifactReleases, useBuildFolder } from '@/hooks/useArtifacts';
import { useToast } from '@/hooks/use-toast';
import { formatRelativeTimeTr } from '@/lib/format';
import { VERSION_PATTERN } from '@/lib/releases';
import { errorMessage } from '@/lib/errors';
import type { Project } from '@/hooks/useProjects';
import type { BuildFolderFile } from '@/services/transport/types';

/** Select value for "this release does not carry the component". */
const NONE = '__none__';

const formatSize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const usable = (file: BuildFolderFile) => !file.settling && !file.problem;

type Props = {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Path 5: a release from files another CI copied into the build folder on the
 * IDP server. One file per component; the newest file whose name points at a
 * component is preselected, and the version is taken from its name until the
 * operator types one.
 */
export const FolderReleaseDialog = ({ project, open, onOpenChange }: Props) => {
  const folder = useBuildFolder(project.id, open);
  const releases = useArtifactReleases(project.id);
  const actions = useArtifactActions(project.id);
  const { toast } = useToast();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [version, setVersion] = useState('');
  const [versionTouched, setVersionTouched] = useState(false);

  const listing = folder.data;
  const files = useMemo(() => listing?.files ?? [], [listing]);

  // Fresh state every time the dialog opens, and a first guess once the folder is read.
  useEffect(() => {
    if (!open) return;
    setPicked({});
    setVersion('');
    setVersionTouched(false);
  }, [open]);

  useEffect(() => {
    if (!listing) return;
    setPicked((current) => {
      if (Object.keys(current).length > 0) return current;
      const guess: Record<string, string> = {};
      for (const component of listing.components) {
        const newest = listing.files.find((file) => file.component === component && usable(file));
        guess[component] = newest ? newest.name : NONE;
      }
      return guess;
    });
  }, [listing]);

  const selection = Object.entries(picked).filter(([, file]) => file && file !== NONE);
  const suggestedVersion = selection.map(([, name]) => files.find((file) => file.name === name)?.version).find(Boolean) ?? '';
  useEffect(() => {
    if (!versionTouched) setVersion(suggestedVersion);
  }, [suggestedVersion, versionTouched]);

  const name = version.trim();
  const versionValid = VERSION_PATTERN.test(name);
  const versionTaken = (releases.data ?? []).some((release) => release.version === name && release.status === 'ready');
  const pickedNames = selection.map(([, file]) => file);
  const doubled = new Set(pickedNames).size !== pickedNames.length;
  const missing = (listing?.components ?? []).filter((component) => !picked[component] || picked[component] === NONE);
  const canSubmit = selection.length > 0 && versionValid && !versionTaken && !doubled && !actions.releaseFromFolder.isPending;

  const submit = async () => {
    try {
      const release = await actions.releaseFromFolder.mutateAsync({
        version: name,
        files: selection.map(([component, file]) => ({ component, file })),
      });
      toast({ title: 'Sürüm hazır', description: `${release.version} — Sürümler'den müşteriye kurabilirsin.` });
      onOpenChange(false);
    } catch (cause) {
      toast({ title: 'Sürüm oluşturulamadı', description: errorMessage(cause), variant: 'destructive' });
    }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><FolderOpen className="h-4 w-4 text-primary" />Klasörden sürüm al</DialogTitle>
        <DialogDescription>
          Her bileşen için bir derleme seç: .tar.gz dosyası ya da Jenkins'in bıraktığı klasör. Klasörün o anki içeriği paketlenip IDP'ye alınır; Jenkins üzerine yazsa da sürüm aynı kalır.
        </DialogDescription>
      </DialogHeader>

      {folder.isLoading ? <div className="flex h-32 items-center justify-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Klasör okunuyor…</div>
        : folder.isError ? <div className="rounded-md border border-destructive/30 p-4 text-center">
          <AlertTriangle className="mx-auto h-5 w-5 text-destructive" />
          <p className="mt-2 whitespace-pre-line text-xs text-muted-foreground">{folder.error.message}</p>
          <Button className="mt-3" size="sm" variant="outline" onClick={() => void folder.refetch()}><RefreshCw className="h-3.5 w-3.5" />Tekrar dene</Button>
        </div>
        : listing && <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-md bg-accent/30 px-3 py-2">
            <p className="min-w-0 truncate font-mono text-[11px] text-muted-foreground" title={listing.folder}>{listing.folder}</p>
            <Button size="sm" variant="ghost" className="h-7 shrink-0" disabled={folder.isFetching} onClick={() => void folder.refetch()}>
              <RefreshCw className={folder.isFetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />Yenile
            </Button>
          </div>

          {files.length === 0 ? <p className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">Klasörde derleme yok (.tar.gz dosyası ya da alt klasör).</p>
            : listing.components.map((component) => <div key={component}>
              <Label htmlFor={`folder-file-${component}`} className="capitalize">{component}</Label>
              <Select value={picked[component] ?? NONE} onValueChange={(file) => setPicked((current) => ({ ...current, [component]: file }))}>
                <SelectTrigger id={`folder-file-${component}`} className="mt-1.5 font-mono text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}><span className="text-muted-foreground">Bu sürümde yok</span></SelectItem>
                  {files.map((file) => <SelectItem key={file.name} value={file.name} disabled={!usable(file)}>
                    {file.kind === 'directory'
                      ? <Folder className="mr-1.5 inline h-3.5 w-3.5 text-muted-foreground" aria-label="Klasör" />
                      : <FileArchive className="mr-1.5 inline h-3.5 w-3.5 text-muted-foreground" aria-label="Arşiv" />}
                    <span className="font-mono">{file.name}</span>
                    <span className="ml-2 text-[10px] text-muted-foreground">
                      {formatRelativeTimeTr(file.modifiedAt)} · {file.size === null ? 'klasör' : formatSize(file.size)}
                      {file.settling && ' · kopyalanıyor olabilir'}
                      {file.problem && ' · dosya adı uygun değil'}
                    </span>
                  </SelectItem>)}
                </SelectContent>
              </Select>
            </div>)}
          {listing.truncated && <p className="text-[11px] text-muted-foreground">Yalnız en yeni 200 kayıt listeleniyor.</p>}

          <div>
            <Label htmlFor="folder-version">Sürüm</Label>
            <Input id="folder-version" className="mt-1.5 font-mono" value={version} onChange={(event) => { setVersionTouched(true); setVersion(event.target.value); }} placeholder="1.4.0" />
            {name && !versionValid && <p className="mt-1 text-[11px] text-destructive">Harf, rakam, '.', '_' veya '-'; harf ya da rakamla başlamalı, en çok 64 karakter.</p>}
            {versionTaken && <p className="mt-1 text-[11px] text-destructive">{name} zaten var; başka bir sürüm adı ver.</p>}
          </div>

          {doubled && <p className="text-[11px] text-destructive">Aynı dosya iki bileşen için seçilmiş.</p>}
          {selection.length > 0 && missing.length > 0 && <p className="text-[11px] text-muted-foreground">
            Bu sürümde {missing.join(', ')} yok. Kurarken yalnız seçtiğin bileşenleri kurabilirsin.
          </p>}
        </div>}

      <DialogFooter className="gap-2 sm:gap-0">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Vazgeç</Button>
        <Button disabled={!canSubmit} onClick={() => void submit()}>
          {actions.releaseFromFolder.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{actions.releaseFromFolder.isPending ? 'Paketleniyor…' : 'Sürümü oluştur'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
};
