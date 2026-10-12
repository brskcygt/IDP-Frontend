import { useState } from 'react';
import { AlertTriangle, ChevronDown, CloudDownload, FileText, GitBranch, GitMerge, Loader2, MoreHorizontal, Package, Plus, RefreshCw, Rocket, Tag, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmActionDialog } from '@/components/artifacts/ConfirmActionDialog';
import { CompositionDetail, RefChip, ReleaseKindBadge, ReleaseStatusBadge } from '@/components/artifacts/ReleaseBadges';
import { DeploymentLogViewer } from '@/components/project/DeploymentLogViewer';
import { useArtifactActions, useArtifactReleases, useArtifactTargets } from '@/hooks/useArtifacts';
import { useSession } from '@/hooks/useSession';
import { useToast } from '@/hooks/use-toast';
import { can } from '@/lib/permissions';
import { isProdTarget } from '@/lib/deployTarget';
import { formatDateTime } from '@/lib/format';
import { customersRunning, isPreviewRelease, shortSha } from '@/lib/releases';
import { cn } from '@/lib/utils';
import type { Project } from '@/hooks/useProjects';
import type { ArtifactRelease } from '@/services/transport/types';
import { errorMessage } from '@/lib/errors';

export type NewReleasePath = 'tag' | 'compose' | 'branch' | 'import';

type Props = {
  project: Project;
  onInstall: (releaseId: string) => void;
  onNewRelease: (path: NewReleasePath) => void;
};

const PATHS: ReadonlyArray<{ id: Exclude<NewReleasePath, 'import'>; icon: typeof Tag; label: string; hint: string }> = [
  { id: 'tag', icon: Tag, label: "Tag'den sürüm", hint: 'Canlıya gidebilir. Sürüm adı tag adıdır.' },
  { id: 'compose', icon: GitMerge, label: 'Önizleme (birden çok branch)', hint: "Yalnız test. Bir tabana birkaç branch birleştirilir." },
  { id: 'branch', icon: GitBranch, label: "Tek branch'ten test sürümü", hint: 'Yalnız test. Sürüm adı otomatik verilir.' },
];

/**
 * Sürümler: every version of the project, how it was made, and where it runs.
 * Building lives behind one "Yeni sürüm" menu whose paths say up front whether
 * the result may go to Canlı.
 */
export const ReleasesTab = ({ project, onInstall, onNewRelease }: Props) => {
  const { data: session } = useSession();
  const canRelease = can(session?.role, 'release:create');
  const canDeploy = can(session?.role, 'deploy:trigger');
  const canDelete = can(session?.role, 'release:delete');
  const releases = useArtifactReleases(project.id);
  const targets = useArtifactTargets(project.id);
  const actions = useArtifactActions(project.id);
  const { toast } = useToast();
  const [logFor, setLogFor] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ArtifactRelease | null>(null);
  const canBuild = (project.config?.artifactDeploy?.build?.provider ?? 'none') !== 'none';
  const hasTestCustomer = (targets.data ?? []).some((target) => !isProdTarget(target, project));

  const remove = async (release: ArtifactRelease) => {
    try {
      await actions.deleteRelease.mutateAsync(release.id);
      toast({ title: 'Sürüm silindi', description: release.version });
      setDeleting(null);
    } catch (cause) {
      toast({ title: 'Sürüm silinemedi', description: errorMessage(cause), variant: 'destructive' });
    }
  };

  const list = releases.data ?? [];

  return <div className="space-y-4">
    <div className="flex items-end justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold">Sürümler</h3>
        <p className="mt-1 text-xs text-muted-foreground">Derlenen her sürüm değişmez; hazır olan bir sürüm istenen müşteriye kurulur.</p>
      </div>
      <div className="flex items-center gap-2">
        {releases.isFetching && !releases.isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Yenileniyor" />}
        {canRelease && <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button size="sm"><Plus className="h-3.5 w-3.5" />Yeni sürüm<ChevronDown className="h-3.5 w-3.5 opacity-70" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            {PATHS.map(({ id, icon: Icon, label, hint }) => <DropdownMenuItem key={id} disabled={!canBuild} onSelect={() => onNewRelease(id)} className="items-start">
              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-xs font-semibold">{label}</span>
                <span className="block text-[11px] text-muted-foreground">{canBuild ? hint : 'Derleme sağlayıcısı tanımlı değil (Ayarlar → Derleme ve kaynak).'}</span>
              </span>
            </DropdownMenuItem>)}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onNewRelease('import')} className="items-start text-muted-foreground">
              <CloudDownload className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-xs">Hazır paketi içe aktar</span>
                <span className="block text-[11px]">CI'ın zaten yüklediği bir paketi kaydeder.</span>
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>}
      </div>
    </div>

    {releases.isLoading ? <div className="flex h-40 items-center justify-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Sürümler yükleniyor…</div>
      : releases.isError ? <section className="rounded-lg border border-destructive/30 p-6 text-center">
        <AlertTriangle className="mx-auto h-6 w-6 text-destructive" />
        <h3 className="mt-3 text-sm font-semibold">Sürümler yüklenemedi</h3>
        <p className="mx-auto mt-1 max-w-md whitespace-pre-line text-xs text-muted-foreground">{releases.error.message}</p>
        <Button className="mt-4" size="sm" variant="outline" disabled={releases.isFetching} onClick={() => void releases.refetch()}><RefreshCw className="h-3.5 w-3.5" />Tekrar dene</Button>
      </section>
      : list.length === 0 ? <section className="rounded-lg border border-dashed p-8 text-center">
        <Package className="mx-auto h-6 w-6 text-muted-foreground" />
        <h3 className="mt-3 text-sm font-semibold">Henüz sürüm yok</h3>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">{canRelease ? 'İlk sürümü "Yeni sürüm" ile derleyin. Canlıya gidecekse tag\'den derleyin.' : 'Sürüm derlemek için deployer ya da admin rolü gerekir.'}</p>
      </section>
      : <ul className="space-y-2">
        {list.map((release) => {
          const running = customersRunning(release.version, targets.data ?? []);
          const preview = isPreviewRelease(release);
          const showLog = logFor === release.id && release.buildDeploymentId;
          const installable = release.status === 'ready' && canDeploy && (!preview || hasTestCustomer);
          return <li key={release.id} className="rounded-lg border border-border/60 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-sm font-semibold">{release.version}</p>
                  <ReleaseKindBadge release={release} />
                  <ReleaseStatusBadge status={release.status} />
                  {!release.composition && <RefChip release={release} />}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(release.createdAt)}{release.commitSha ? ` · ${shortSha(release.commitSha)}` : ''}{release.createdBy ? ` · ${release.createdBy}` : ''}</p>
                {running.length > 0 && <p className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                  kurulu:
                  {running.map((target) => <span key={target.id} className={cn('rounded border px-1.5 py-0.5 text-[10px]', isProdTarget(target, project) ? 'border-status-fail/40 text-status-fail' : 'border-border text-foreground')}>{target.name}</span>)}
                </p>}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {release.status === 'building' && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-label="Derleniyor" />}
                {installable && <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => onInstall(release.id)}><Rocket className="h-3 w-3" />Kur…</Button>}
                {(release.buildDeploymentId || (canDelete && release.status !== 'building')) && <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" aria-label={`${release.version} için diğer işlemler`}><MoreHorizontal className="h-3.5 w-3.5" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {release.buildDeploymentId && <DropdownMenuItem onSelect={() => setLogFor(showLog ? null : release.id)}>
                      <FileText className="h-3 w-3" aria-hidden="true" />{showLog ? 'Logu gizle' : 'Derleme logu'}
                    </DropdownMenuItem>}
                    {canDelete && release.status !== 'building' && <DropdownMenuItem className="text-destructive" onSelect={() => setDeleting(release)}>
                      <Trash2 className="h-3 w-3" aria-hidden="true" />Sil
                    </DropdownMenuItem>}
                  </DropdownMenuContent>
                </DropdownMenu>}
              </div>
            </div>
            {release.composition && <CompositionDetail composition={release.composition} />}
            {release.error && <p className="mt-2 whitespace-pre-line text-xs text-destructive">{release.error}</p>}
            {release.status === 'ready' && preview && !hasTestCustomer && canDeploy && <p className="mt-2 text-[11px] text-muted-foreground">Önizleme sürümü yalnız test müşterisine kurulur; bu projede test müşterisi yok.</p>}
            {showLog && <div className="mt-3">
              {release.status === 'building' && <p className="mb-2 text-[11px] text-muted-foreground">Derleme sürüyor; canlı akış için üstteki dağıtım panelini kullanın.</p>}
              <DeploymentLogViewer deploymentId={release.buildDeploymentId as string} />
            </div>}
          </li>;
        })}
      </ul>}

    <p className="text-[11px] text-muted-foreground">Son 3 sürüm ve son 3 önizleme saklanır.</p>

    <ConfirmActionDialog
      open={Boolean(deleting)}
      onOpenChange={(open) => !open && setDeleting(null)}
      title={`Sürümü sil · ${deleting?.version ?? ''}`}
      description="Sürüm ve paketleri IDP'den silinir; bu sürüm bir daha kurulamaz. Müşterilerde kurulu dosyalar etkilenmez."
      confirmLabel="Sil"
      destructive
      pending={actions.deleteRelease.isPending}
      onConfirm={() => deleting && void remove(deleting)}
    />
  </div>;
};
