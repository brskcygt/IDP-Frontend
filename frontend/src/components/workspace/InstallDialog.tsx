import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowRight, Loader2, Package, RefreshCw, Rocket, Server } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ComponentChecklist } from '@/components/artifacts/ComponentChecklist';
import { useArtifactActions, useArtifactReleases, useArtifactTargets, useOnlineAgents } from '@/hooks/useArtifacts';
import { useComponentSelection } from '@/hooks/useComponentSelection';
import { useSession } from '@/hooks/useSession';
import { useToast } from '@/hooks/use-toast';
import { can } from '@/lib/permissions';
import { environmentLabel, hostedComponents, isProdTarget, targetEnvironment } from '@/lib/deployTarget';
import { formatDateTime } from '@/lib/format';
import { isPreviewRelease, RELEASE_KIND_LABEL, releaseKind, shortSha } from '@/lib/releases';
import { errorCode, PREVIEW_NOT_ALLOWED_ON_PROD } from '@/services/transport/errors';
import type { Project } from '@/hooks/useProjects';

export type InstallPreselect = { targetId?: string; releaseId?: string };

type Props = {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Read once per opening: the customer row or version row the dialog came from. */
  preselect: InstallPreselect | null;
  onRunStarted: (deploymentId: string) => void;
  onGoToReleases: () => void;
  onAddCustomer: () => void;
};

const PREVIEW_ON_PROD = 'Önizleme sürümleri yalnız test müşterilerine kurulur';

const CenteredState = ({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) => (
  <section className="rounded-lg border border-dashed p-6 text-center">
    <div className="mx-auto flex h-6 w-6 items-center justify-center text-muted-foreground">{icon}</div>
    <h3 className="mt-3 text-sm font-semibold">{title}</h3>
    {children}
  </section>
);

/**
 * "Sürüm kur": the single place a version is installed on a customer.
 *
 * Every entry point (a customer row, a version row) opens this with its side
 * preselected; choosing the other side, the Canlı confirmation and the agent
 * guard all live here so no shorter path skips them.
 */
export const InstallDialog = ({ project, open, onOpenChange, preselect, onRunStarted, onGoToReleases, onAddCustomer }: Props) => {
  const { data: session } = useSession();
  const canDeploy = can(session?.role, 'deploy:trigger');
  const canAddCustomer = can(session?.role, 'project:write');
  const releases = useArtifactReleases(open ? project.id : undefined);
  const targets = useArtifactTargets(open ? project.id : undefined);
  const agents = useOnlineAgents(open);
  const actions = useArtifactActions(project.id);
  const { toast } = useToast();

  const [targetId, setTargetId] = useState('');
  const [releaseId, setReleaseId] = useState('');
  const [confirmation, setConfirmation] = useState('');

  const allTargets = targets.data ?? [];
  const readyReleases = (releases.data ?? []).filter((release) => release.status === 'ready');
  const building = (releases.data ?? []).filter((release) => release.status === 'building');
  const target = allTargets.find((item) => item.id === targetId);
  const release = readyReleases.find((item) => item.id === releaseId);
  const hosted = hostedComponents(target, project);
  const selection = useComponentSelection(hosted);
  const { reset } = selection;

  // Initialise once per opening, as soon as both lists are in.
  const initialised = useRef(false);
  useEffect(() => {
    if (!open) {
      initialised.current = false;
      return;
    }
    if (initialised.current || !releases.data || !targets.data) return;
    initialised.current = true;
    const ready = releases.data.filter((item) => item.status === 'ready');
    // With one possible customer, pick it -- but never a Canlı one for a preview.
    const presetRelease = ready.find((item) => item.id === preselect?.releaseId);
    const eligible = targets.data.filter((item) => !(isPreviewRelease(presetRelease) && isProdTarget(item, project)));
    const nextTarget = preselect?.targetId ?? (eligible.length === 1 ? eligible[0].id : '');
    const chosenTarget = targets.data.find((item) => item.id === nextTarget);
    const targetIsProd = Boolean(chosenTarget && isProdTarget(chosenTarget, project));
    const nextRelease = preselect?.releaseId
      ?? ready.find((item) => !(targetIsProd && isPreviewRelease(item)))?.id
      ?? '';
    setTargetId(nextTarget);
    setReleaseId(nextRelease);
    setConfirmation('');
  }, [open, releases.data, targets.data, preselect, project]);

  // Components differ per customer, so a selection made for another one would
  // silently carry over.
  useEffect(() => {
    reset();
    setConfirmation('');
  }, [targetId, reset]);

  const fail = (title: string, cause: unknown) => toast({ title, description: cause instanceof Error ? cause.message : 'Bilinmeyen hata.', variant: 'destructive' });

  const targetIsProd = Boolean(target && isProdTarget(target, project));
  const previewBlocked = Boolean(release && targetIsProd && isPreviewRelease(release));
  const branchOnProd = Boolean(release && targetIsProd && releaseKind(release) === 'branch');
  const agentOnline = target ? agents.online.get(target.agentId) : undefined;
  const confirmed = !targetIsProd || confirmation.trim() === target?.name;
  const canSubmit = Boolean(canDeploy && release && target && agentOnline && confirmed && !previewBlocked && selection.chosen.length > 0 && !actions.deploy.isPending);

  const install = async () => {
    if (!release || !target) return;
    try {
      const result = await actions.deploy.mutateAsync({
        targetId: target.id,
        releaseId: release.id,
        components: selection.filter,
        confirmation: targetIsProd ? confirmation.trim() : undefined,
      });
      toast({ title: 'Kurulum başladı', description: `${release.version} → ${target.name}${selection.partial ? ` · ${selection.chosen.join(', ')}` : ''}` });
      onOpenChange(false);
      onRunStarted(result.deploymentId);
    } catch (cause) {
      if (errorCode(cause) === PREVIEW_NOT_ALLOWED_ON_PROD) {
        toast({ title: PREVIEW_ON_PROD, description: `${release.version} birleştirilmemiş branch'lerden derlendi. ${target.name} için tag'den bir sürüm derleyin.`, variant: 'destructive' });
        return;
      }
      fail('Kurulum başlatılamadı', cause);
    }
  };

  const loading = releases.isLoading || targets.isLoading;
  const loadError = releases.error ?? targets.error;

  const body = () => {
    if (loading) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
    if (loadError) return <CenteredState icon={<AlertTriangle className="h-6 w-6 text-destructive" />} title="Sürümler veya müşteriler yüklenemedi">
      <p className="mx-auto mt-1 max-w-sm whitespace-pre-line text-xs text-muted-foreground">{loadError.message}</p>
      <Button className="mt-4" size="sm" variant="outline" onClick={() => { void releases.refetch(); void targets.refetch(); }}><RefreshCw className="h-3.5 w-3.5" />Tekrar dene</Button>
    </CenteredState>;
    if (allTargets.length === 0) return <CenteredState icon={<Server className="h-6 w-6" />} title="Bu projede müşteri yok">
      <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">Sürüm kurmak için önce bir müşteri (agent ve kurulum dizini) tanımlanmalı.</p>
      {canAddCustomer ? <Button className="mt-4" size="sm" variant="outline" onClick={onAddCustomer}>Müşteri ekle</Button> : <p className="mt-3 text-xs text-muted-foreground">Müşteri eklemek için bir admin'e başvurun.</p>}
    </CenteredState>;
    if (readyReleases.length === 0) return <CenteredState icon={<Package className="h-6 w-6" />} title="Hazır sürüm yok">
      <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
        {building.length > 0 ? `${building.map((item) => item.version).join(', ')} derleniyor; bitince burada seçilebilir.` : 'Kurulabilecek bir sürüm için önce Sürümler sekmesinden derleyin.'}
      </p>
      <Button className="mt-4" size="sm" variant="outline" onClick={onGoToReleases}>Sürümler sekmesine git</Button>
    </CenteredState>;

    return <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="install-target">Müşteri</Label>
          <Select value={targetId} onValueChange={setTargetId}>
            <SelectTrigger id="install-target" className="mt-1.5"><SelectValue placeholder="Müşteri seçin" /></SelectTrigger>
            <SelectContent>{allTargets.map((item) => {
              const blocked = isPreviewRelease(release) && isProdTarget(item, project);
              return <SelectItem key={item.id} value={item.id} disabled={blocked}>
                {item.name} · {environmentLabel(targetEnvironment(item, project))}{blocked ? ' · önizleme kurulamaz' : ''}
              </SelectItem>;
            })}</SelectContent>
          </Select>
          {target && <p className={agentOnline ? 'mt-2 text-[11px] text-status-ok' : 'mt-2 text-[11px] text-destructive'}>
            Agent {agentOnline ? 'çevrimiçi' : agents.isLoading ? 'kontrol ediliyor…' : 'çevrimdışı'} · <span className="font-mono">{target.agentId}</span>
          </p>}
        </div>
        <div>
          <Label htmlFor="install-release">Sürüm</Label>
          <Select value={releaseId} onValueChange={setReleaseId}>
            <SelectTrigger id="install-release" className="mt-1.5"><SelectValue placeholder="Hazır bir sürüm seçin" /></SelectTrigger>
            <SelectContent>{readyReleases.map((item) => {
              const blocked = targetIsProd && isPreviewRelease(item);
              return <SelectItem key={item.id} value={item.id} disabled={blocked}>
                <span className="font-mono">{item.version}</span>
                <span className="ml-2 text-[10px] text-muted-foreground">{RELEASE_KIND_LABEL[releaseKind(item)]}{blocked ? ' · canlıya kurulamaz' : ''}</span>
              </SelectItem>;
            })}</SelectContent>
          </Select>
          {release && <p className="mt-2 text-[11px] text-muted-foreground">{formatDateTime(release.createdAt)}{release.commitSha ? ` · ${shortSha(release.commitSha)}` : ''}</p>}
          {targetIsProd && readyReleases.some(isPreviewRelease) && <p className="mt-1 text-[11px] text-muted-foreground">{PREVIEW_ON_PROD}.</p>}
        </div>
      </div>

      {target && hosted.length > 0 && <div>
        <Label>Bileşenler</Label>
        <p className="mb-2 mt-1 text-[11px] text-muted-foreground">Varsayılan hepsi. Yalnız değişen tarafı kurmak için diğerini kaldırın; o bileşen mevcut sürümünde kalır.</p>
        <ComponentChecklist
          components={hosted}
          selection={selection}
          label="Kurulacak bileşenler"
          detail={(name) => {
            const current = target.currentVersions?.[name]?.version;
            return <>şu an <span className="font-mono text-foreground">{current ?? 'kurulu değil'}</span>{release && <> <ArrowRight className="inline h-3 w-3" aria-hidden="true" /> <span className="font-mono text-foreground">{selection.isSelected(name) ? release.version : current ?? 'kurulu değil'}</span></>}</>;
          }}
        />
      </div>}

      {previewBlocked && <p className="text-xs text-destructive">{PREVIEW_ON_PROD}. Test müşterisi seçin ya da {target?.name} için tag'den bir sürüm derleyin.</p>}
      {branchOnProd && <p className="text-xs text-status-warn">Bu sürüm bir branch'ten derlendi. Canlı için tag'den derlenmiş bir sürüm önerilir.</p>}
      {target && !agentOnline && !agents.isLoading && <p className="text-xs text-destructive">Agent çevrimdışı. Kurulum için önce müşteri sunucusundaki agent'ı başlatın.</p>}
      {target && targetIsProd && !previewBlocked && <div>
        <Label htmlFor="install-confirmation" className="text-xs">Canlı müşteri: onaylamak için <span className="font-mono text-foreground">{target.name}</span> yazın</Label>
        <Input id="install-confirmation" className="mt-1.5" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
      </div>}
    </div>;
  };

  const ready = !loading && !loadError && allTargets.length > 0 && readyReleases.length > 0;

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Rocket className="h-4 w-4 text-primary" />Sürüm kur</DialogTitle>
        <DialogDescription>{project.name} · bir müşteriye hazır bir sürüm kurar.</DialogDescription>
      </DialogHeader>
      {body()}
      <DialogFooter className="gap-2 sm:gap-0">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Vazgeç</Button>
        {ready && <Button disabled={!canSubmit} onClick={() => void install()}>
          {actions.deploy.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
          Kur {release?.version ?? ''}
        </Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
};
