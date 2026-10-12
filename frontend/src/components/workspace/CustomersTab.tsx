import { useEffect, useState } from 'react';
import { AlertTriangle, FileCog, GitBranch, Loader2, MoreHorizontal, Pencil, Plus, RefreshCw, RotateCcw, Rocket, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmActionDialog } from '@/components/artifacts/ConfirmActionDialog';
import { ComponentChecklist } from '@/components/artifacts/ComponentChecklist';
import { useArtifactActions, useArtifactReleases, useArtifactTargets, useOnlineAgents } from '@/hooks/useArtifacts';
import { useComponentSelection } from '@/hooks/useComponentSelection';
import { useSession } from '@/hooks/useSession';
import { useToast } from '@/hooks/use-toast';
import { can } from '@/lib/permissions';
import { environmentLabel, hostedComponents, isProdTarget, projectComponentNames, targetEnvironment } from '@/lib/deployTarget';
import { formatDateTime, formatRelativeTimeTr } from '@/lib/format';
import { releaseByVersion, releaseKind } from '@/lib/releases';
import { cn } from '@/lib/utils';
import type { Project } from '@/hooks/useProjects';
import type { DeployTarget } from '@/services/transport/types';
import { errorMessage } from '@/lib/errors';

type Props = {
  project: Project;
  onInstall: (targetId: string) => void;
  onAddCustomer: () => void;
  onEditCustomer: (targetId: string) => void;
  onRunStarted: (deploymentId: string) => void;
};

type DialogState = { kind: 'rollback' | 'apply' | 'rebuild'; target: DeployTarget } | null;

const fail = (toast: ReturnType<typeof useToast>['toast'], title: string, cause: unknown) =>
  toast({ title, description: errorMessage(cause), variant: 'destructive' });

/** component → what a rollback would put back, for the components that have one. */
const rollbackPlan = (target: DeployTarget, hosted: string[]) => hosted.map((name) => {
  const installed = target.currentVersions?.[name];
  return { name, current: installed?.version ?? null, previous: installed?.previousVersions?.[0] ?? null };
});

const rollbackLabel = (plan: ReturnType<typeof rollbackPlan>) => {
  const targets = [...new Set(plan.map((item) => item.previous).filter(Boolean))];
  if (targets.length === 0) return 'Geri al · önceki sürüm yok';
  return targets.length === 1 ? `Geri al → ${targets[0]}` : 'Geri al → önceki sürümler';
};

/** Rebuild the test customer's branch, for the components ticked here. */
const RebuildDialog = ({ project, target, open, onOpenChange, onRunStarted }: {
  project: Project;
  target: DeployTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRunStarted: (deploymentId: string) => void;
}) => {
  const actions = useArtifactActions(project.id);
  const { toast } = useToast();
  const hosted = hostedComponents(target, project);
  const selection = useComponentSelection(hosted);
  const { reset } = selection;

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const run = async () => {
    try {
      const result = await actions.buildAndDeploy.mutateAsync({ targetId: target.id, components: selection.filter });
      toast({ title: 'Derleme başladı', description: `${target.ref} → ${target.name}${selection.partial ? ` · ${selection.chosen.join(', ')}` : ''} · derleme bitince kurulur` });
      onOpenChange(false);
      onRunStarted(result.deploymentId);
    } catch (cause) { fail(toast, 'Derleme başlatılamadı', cause); }
  };

  return <ConfirmActionDialog
    open={open}
    onOpenChange={onOpenChange}
    title={`Branch'ten yeniden derle · ${target.name}`}
    description={<><span className="font-mono">{target.ref}</span> branch'inin son hâli derlenir ve bu müşteriye kurulur. Sürüm adı otomatik verilir.</>}
    confirmLabel="Derle ve kur"
    pending={actions.buildAndDeploy.isPending}
    onConfirm={() => void run()}
  >
    {hosted.length > 1 && <ComponentChecklist components={hosted} selection={selection} label="Derlenecek bileşenler" />}
  </ConfirmActionDialog>;
};

/**
 * Müşteriler: who runs what. One row per customer, one column per component,
 * one primary action ("Kur…") per row and everything else behind ⋯.
 */
export const CustomersTab = ({ project, onInstall, onAddCustomer, onEditCustomer, onRunStarted }: Props) => {
  const { data: session } = useSession();
  const canDeploy = can(session?.role, 'deploy:trigger');
  const canRelease = can(session?.role, 'release:create');
  const canAdmin = can(session?.role, 'project:write');
  const targets = useArtifactTargets(project.id);
  const releases = useArtifactReleases(project.id);
  const agents = useOnlineAgents(true);
  const actions = useArtifactActions(project.id);
  const { toast } = useToast();
  const [dialog, setDialog] = useState<DialogState>(null);
  // Per customer: a refresh on one row must not spin every other row.
  const [refreshing, setRefreshing] = useState<ReadonlySet<string>>(new Set());
  const components = projectComponentNames(project);

  const refresh = async (target: DeployTarget) => {
    setRefreshing((current) => new Set(current).add(target.id));
    try {
      await actions.refreshTarget.mutateAsync(target.id);
      toast({ title: 'Durum yenilendi', description: target.name });
    } catch (cause) {
      fail(toast, 'Durum yenilenemedi', cause);
    } finally {
      setRefreshing((current) => {
        const next = new Set(current);
        next.delete(target.id);
        return next;
      });
    }
  };

  const rollback = async (target: DeployTarget, confirmation: string | undefined) => {
    try {
      const result = await actions.rollback.mutateAsync({ targetId: target.id, confirmation });
      toast({ title: 'Geri alma başladı', description: target.name });
      setDialog(null);
      onRunStarted(result.deploymentId);
    } catch (cause) { fail(toast, 'Geri alma başlatılamadı', cause); }
  };

  const applyConfig = async (target: DeployTarget, confirmation: string | undefined) => {
    try {
      const result = await actions.applyConfig.mutateAsync({ targetId: target.id, confirmation });
      toast({ title: 'Ayarlar uygulanıyor', description: target.name });
      setDialog(null);
      onRunStarted(result.deploymentId);
    } catch (cause) { fail(toast, 'Ayarlar uygulanamadı', cause); }
  };

  const header = <div className="flex items-end justify-between gap-3">
    <div>
      <h3 className="text-sm font-semibold">Müşteriler</h3>
      <p className="mt-1 text-xs text-muted-foreground">Her müşterinin hangi bileşende hangi sürümü çalıştırdığı. Kurulum, geri alma ve ayar uygulama buradan.</p>
    </div>
    <div className="flex items-center gap-2">
      {targets.isFetching && !targets.isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Yenileniyor" />}
      {canAdmin && <Button size="sm" variant="outline" onClick={onAddCustomer}><Plus className="h-3.5 w-3.5" />Müşteri ekle</Button>}
    </div>
  </div>;

  if (targets.isLoading) {
    return <div className="space-y-4">{header}<div className="flex h-40 items-center justify-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Müşteriler yükleniyor…</div></div>;
  }

  if (targets.isError) {
    return <div className="space-y-4">{header}<section className="rounded-lg border border-destructive/30 p-6 text-center">
      <AlertTriangle className="mx-auto h-6 w-6 text-destructive" />
      <h3 className="mt-3 text-sm font-semibold">Müşteriler yüklenemedi</h3>
      <p className="mx-auto mt-1 max-w-md whitespace-pre-line text-xs text-muted-foreground">{targets.error.message}</p>
      <Button className="mt-4" size="sm" variant="outline" disabled={targets.isFetching} onClick={() => void targets.refetch()}><RefreshCw className="h-3.5 w-3.5" />Tekrar dene</Button>
    </section></div>;
  }

  const rows = targets.data ?? [];

  if (rows.length === 0) {
    return <div className="space-y-4">{header}<section className="rounded-lg border border-dashed p-8 text-center">
      <Server className="mx-auto h-6 w-6 text-muted-foreground" />
      <h3 className="mt-3 text-sm font-semibold">Henüz müşteri yok</h3>
      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
        Müşteri, bir sürümün kurulacağı yerdir: müşteri sunucusundaki agent, kurulum dizini ve ortam (Geliştirme, Test, Canlı).
      </p>
      {canAdmin ? <Button className="mt-4" size="sm" variant="outline" onClick={onAddCustomer}><Plus className="h-3.5 w-3.5" />Müşteri ekle</Button> : <p className="mt-3 text-xs text-muted-foreground">Müşteri eklemek için bir admin'e başvurun.</p>}
    </section></div>;
  }

  const dialogTarget = dialog?.target;
  const dialogIsProd = Boolean(dialogTarget && isProdTarget(dialogTarget, project));
  const dialogAgentOnline = dialogTarget ? agents.online.get(dialogTarget.agentId) : undefined;
  const offlineReason = dialogTarget && dialogAgentOnline === false ? 'Agent çevrimdışı. Önce müşteri sunucusundaki agent\'ı başlatın.' : null;
  const plan = dialogTarget ? rollbackPlan(dialogTarget, hostedComponents(dialogTarget, project)) : [];

  return <div className="space-y-4">
    {header}
    <div className="overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full min-w-[720px] text-left text-xs">
        <thead className="border-b border-border/60 bg-bar font-mono text-[10px] uppercase tracking-[0.08em] text-dim">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Müşteri</th>
            <th scope="col" className="px-3 py-2 font-medium">Ortam</th>
            <th scope="col" className="px-3 py-2 font-medium">Agent</th>
            {components.map((name) => <th key={name} scope="col" className="px-3 py-2 font-medium">{name}</th>)}
            <th scope="col" className="px-3 py-2 text-right font-medium"><span className="sr-only">İşlemler</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((target) => {
            const hosted = hostedComponents(target, project);
            const online = agents.online.get(target.agentId);
            const isProd = isProdTarget(target, project);
            const environment = targetEnvironment(target, project);
            const targetPlan = rollbackPlan(target, hosted);
            const canRollback = targetPlan.some((item) => item.previous);
            const canRebuild = Boolean(target.ref) && !isProd && canRelease;
            const busy = refreshing.has(target.id);
            const showMenu = canDeploy || canRebuild || canAdmin;

            return <tr key={target.id} className="border-b border-border/60 last:border-0 hover:bg-surface/60">
              <td className="px-3 py-2.5 align-top">
                <p className="text-[13px] font-semibold">{target.name}</p>
                {target.ref && !isProd && <p className="mt-0.5 inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground"><GitBranch className="h-2.5 w-2.5" aria-hidden="true" />{target.ref}</p>}
              </td>
              <td className="px-3 py-2.5 align-top">
                <span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-medium', isProd ? 'border-status-fail/40 text-status-fail' : 'border-border text-muted-foreground')}>{environmentLabel(environment)}</span>
              </td>
              <td className="px-3 py-2.5 align-top">
                <span className={cn('inline-flex items-center gap-1.5 text-[11px]', online ? 'text-status-ok' : 'text-muted-foreground')} title={target.agentId}>
                  <span aria-hidden="true" className={cn('h-[6px] w-[6px] rounded-full', online ? 'bg-status-ok' : online === false ? 'bg-status-fail' : 'bg-line-strong')} />
                  {online ? 'çevrimiçi' : online === false ? 'çevrimdışı' : '…'}
                </span>
              </td>
              {components.map((name) => {
                if (!hosted.includes(name)) return <td key={name} className="px-3 py-2.5 align-top text-muted-foreground" title="Bu müşteride bu bileşen yok">—</td>;
                const installed = target.currentVersions?.[name];
                if (!installed?.version) return <td key={name} className="px-3 py-2.5 align-top text-muted-foreground">kurulu değil</td>;
                const release = releaseByVersion(releases.data, installed.version);
                const kind = release ? releaseKind(release) : null;
                return <td key={name} className="px-3 py-2.5 align-top">
                  <p className="flex items-center gap-1.5">
                    <span className="truncate font-mono text-xs font-semibold">{installed.version}</span>
                    {kind === 'preview' && <span className="rounded border border-status-warn/50 px-1 text-[9px] text-status-warn">önizleme</span>}
                    {kind === 'tag' && <span className="rounded border border-primary/40 px-1 text-[9px] text-primary">tag</span>}
                  </p>
                  {installed.deployedAt && <p className="mt-0.5 text-[10px] text-muted-foreground" title={formatDateTime(installed.deployedAt)}>{formatRelativeTimeTr(installed.deployedAt)}</p>}
                </td>;
              })}
              <td className="px-3 py-2.5 text-right align-top">
                <div className="flex items-center justify-end gap-1">
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Yenileniyor" />}
                  {canDeploy && <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => onInstall(target.id)}><Rocket className="h-3 w-3" />Kur…</Button>}
                  {showMenu && <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" aria-label={`${target.name} için diğer işlemler`}><MoreHorizontal className="h-3.5 w-3.5" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canDeploy && <>
                        <DropdownMenuItem disabled={!canRollback} onSelect={() => setDialog({ kind: 'rollback', target })}>
                          <RotateCcw className="h-3 w-3" aria-hidden="true" />{rollbackLabel(targetPlan)}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setDialog({ kind: 'apply', target })}>
                          <FileCog className="h-3 w-3" aria-hidden="true" />Ayarları uygula
                        </DropdownMenuItem>
                      </>}
                      {canRebuild && <DropdownMenuItem onSelect={() => setDialog({ kind: 'rebuild', target })}>
                        <GitBranch className="h-3 w-3" aria-hidden="true" />Branch'ten yeniden derle (<span className="font-mono">{target.ref}</span>)
                      </DropdownMenuItem>}
                      {canDeploy && <DropdownMenuItem disabled={busy} onSelect={() => void refresh(target)}>
                        <RefreshCw className="h-3 w-3" aria-hidden="true" />Durumu yenile
                      </DropdownMenuItem>}
                      {canAdmin && <>
                        {(canDeploy || canRebuild) && <DropdownMenuSeparator />}
                        <DropdownMenuItem onSelect={() => onEditCustomer(target.id)}>
                          <Pencil className="h-3 w-3" aria-hidden="true" />Müşteriyi düzenle
                        </DropdownMenuItem>
                      </>}
                    </DropdownMenuContent>
                  </DropdownMenu>}
                </div>
              </td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>

    {dialogTarget && <ConfirmActionDialog
      open={dialog?.kind === 'rollback'}
      onOpenChange={(open) => !open && setDialog(null)}
      title={`Geri al · ${dialogTarget.name}`}
      description="Önceki kurulu sürüme döner. Önceki sürümü olmayan bileşenler değişmez."
      confirmLabel="Geri al"
      destructive
      typedConfirmation={dialogIsProd ? dialogTarget.name : null}
      blockedReason={!plan.some((item) => item.previous) ? 'Bu müşteride geri alınacak önceki sürüm yok.' : offlineReason}
      pending={actions.rollback.isPending}
      onConfirm={(confirmation) => void rollback(dialogTarget, confirmation)}
    >
      <ul className="space-y-1 rounded-md bg-accent/20 p-3 font-mono text-xs">
        {plan.map((item) => <li key={item.name} className="flex flex-wrap items-center gap-2">
          <span className="w-28 shrink-0 truncate text-muted-foreground">{item.name}</span>
          {item.previous ? <span>{item.current ?? 'kurulu değil'} → <span className="font-semibold text-foreground">{item.previous}</span></span> : <span className="text-muted-foreground">{item.current ?? 'kurulu değil'} · değişmez</span>}
        </li>)}
      </ul>
    </ConfirmActionDialog>}

    {dialogTarget && <ConfirmActionDialog
      open={dialog?.kind === 'apply'}
      onOpenChange={(open) => !open && setDialog(null)}
      title={`Ayarları uygula · ${dialogTarget.name}`}
      description="Müşteri için kayıtlı çalışma ayarlarını (config.js / .env) yazar, servisleri yeniden başlatır ve sağlık kontrolü yapar. Kurulu sürüm değişmez."
      confirmLabel="Ayarları uygula"
      typedConfirmation={dialogIsProd ? dialogTarget.name : null}
      blockedReason={offlineReason}
      pending={actions.applyConfig.isPending}
      onConfirm={(confirmation) => void applyConfig(dialogTarget, confirmation)}
    />}

    {dialogTarget && dialog?.kind === 'rebuild' && <RebuildDialog
      project={project}
      target={dialogTarget}
      open
      onOpenChange={(open) => !open && setDialog(null)}
      onRunStarted={onRunStarted}
    />}
  </div>;
};
