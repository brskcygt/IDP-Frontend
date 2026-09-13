import { useEffect, useMemo, useState } from 'react';
import { Boxes, CloudDownload, GitBranch, Loader2, PackagePlus, Pencil, RefreshCw, Rocket, RotateCcw, Server, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useArtifactActions, useArtifactAgents, useArtifactReleases, useArtifactTargets } from '@/hooks/useArtifacts';
import { useSession } from '@/hooks/useSession';
import { can } from '@/lib/permissions';
import { useToast } from '@/hooks/use-toast';
import type { Project } from '@/hooks/useProjects';
import type { ArtifactRelease, DeployTarget, DeployTargetInput } from '@/services/transport/types';

type Props = {
  project: Project | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onRunStarted: (deploymentId: string) => void;
};

const initialTarget: DeployTargetInput = { name: '', agentId: '', os: 'windows', environment: 'Dev', basePath: '' };

const statusVariant = (status: ArtifactRelease['status']) => status === 'ready' ? 'default' : status === 'failed' ? 'destructive' : 'secondary';
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';

export const ArtifactDeploySheet = ({ project, isOpen, onOpenChange, onRunStarted }: Props) => {
  const projectId = project?.id;
  const { data: session } = useSession();
  const canRelease = can(session?.role, 'release:create');
  const canDeleteRelease = can(session?.role, 'release:delete');
  const canDeploy = can(session?.role, 'deploy:trigger');
  const canManageTargets = can(session?.role, 'project:write');
  const releases = useArtifactReleases(isOpen ? projectId : undefined);
  const targets = useArtifactTargets(isOpen ? projectId : undefined);
  const agents = useArtifactAgents(isOpen);
  const actions = useArtifactActions(projectId ?? '');
  const { toast } = useToast();
  const [version, setVersion] = useState('');
  const [ref, setRef] = useState('');
  const [selectedReleaseId, setSelectedReleaseId] = useState('');
  const [targetInput, setTargetInput] = useState<DeployTargetInput>(initialTarget);
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [runtimeConfigText, setRuntimeConfigText] = useState('');
  const [confirmations, setConfirmations] = useState<Record<string, string>>({});

  useEffect(() => {
    setSelectedReleaseId('');
    setVersion('');
    setRef('');
    setTargetInput(initialTarget);
    setEditingTargetId(null);
    setRuntimeConfigText('');
    setConfirmations({});
  }, [projectId]);

  useEffect(() => {
    if (!isOpen || !releases.data) return;
    const selectedIsReady = releases.data.some((release) => release.id === selectedReleaseId && release.status === 'ready');
    if (!selectedIsReady) setSelectedReleaseId(releases.data.find((release) => release.status === 'ready')?.id ?? '');
  }, [isOpen, releases.data, selectedReleaseId]);

  const onlineAgents = useMemo(() => new Map((agents.data ?? []).map((agent) => [agent.id, agent.online])), [agents.data]);
  const releaseVersions = useMemo(() => new Map((releases.data ?? []).map((release) => [release.id, release.version])), [releases.data]);
  if (!project) return null;

  const fail = (title: string, cause: unknown) => toast({ title, description: cause instanceof Error ? cause.message : 'Unknown error.', variant: 'destructive' });
  const run = async (promise: Promise<{ deploymentId: string }>, title: string) => {
    try {
      const result = await promise;
      toast({ title, description: project.name });
      onRunStarted(result.deploymentId);
    } catch (cause) { fail(`${title} failed`, cause); }
  };

  const createRelease = () => {
    const normalized = version.trim();
    if (!normalized) return;
    void run(actions.createRelease.mutateAsync({ version: normalized, ref: ref.trim() || undefined }), 'Release build');
  };

  const importRelease = async () => {
    const normalized = version.trim();
    if (!normalized) return;
    try {
      const release = await actions.importRelease.mutateAsync(normalized);
      setSelectedReleaseId(release.id);
      toast({ title: 'Release imported', description: release.version });
    } catch (cause) { fail('Release import failed', cause); }
  };

  const createTarget = async () => {
    try {
      const runtimeConfig = Object.fromEntries(runtimeConfigText.split(/\r?\n/).filter((line) => line.trim()).map((line) => {
        const separator = line.indexOf('=');
        if (separator < 1) throw new Error(`Runtime config line must be KEY=value: ${line}`);
        return [line.slice(0, separator).trim(), line.slice(separator + 1)];
      }));
      const input = { ...targetInput, name: targetInput.name.trim(), basePath: targetInput.basePath?.trim() || null, runtimeConfig: Object.keys(runtimeConfig).length ? runtimeConfig : null };
      if (editingTargetId) await actions.updateTarget.mutateAsync({ id: editingTargetId, input });
      else await actions.createTarget.mutateAsync(input);
      setTargetInput(initialTarget);
      setEditingTargetId(null);
      setRuntimeConfigText('');
      toast({ title: editingTargetId ? 'Target updated' : 'Target created' });
    } catch (cause) { fail(editingTargetId ? 'Target could not be updated' : 'Target could not be created', cause); }
  };

  const editTarget = (target: DeployTarget) => {
    setEditingTargetId(target.id);
    setTargetInput({
      name: target.name,
      agentId: target.agentId,
      os: target.os,
      environment: target.environment,
      basePath: target.basePath,
      components: target.components,
      runtimeConfig: target.runtimeConfig,
    });
    setRuntimeConfigText(Object.entries(target.runtimeConfig ?? {}).map(([key, value]) => `${key}=${value}`).join('\n'));
  };

  const targetAction = (target: DeployTarget, kind: 'deploy' | 'rollback') => {
    const confirmation = confirmations[target.id]?.trim() || undefined;
    if (kind === 'deploy') {
      if (!selectedReleaseId) return;
      void run(actions.deploy.mutateAsync({ targetId: target.id, releaseId: selectedReleaseId, confirmation }), 'Deployment');
    } else {
      void run(actions.rollback.mutateAsync({ targetId: target.id, confirmation }), 'Rollback');
    }
  };

  const buildProvider = project.config?.artifactDeploy?.build?.provider ?? 'none';
  const busy = actions.createRelease.isPending || actions.importRelease.isPending;

  return <Sheet open={isOpen} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="w-[min(1120px,calc(100vw-3rem))] max-w-none overflow-y-auto border-l-line-strong bg-background p-0 sm:max-w-none">
      <div className="border-b border-line-strong bg-bar px-7 py-6"><SheetHeader><SheetTitle className="flex items-center gap-3 text-xl"><Boxes className="h-5 w-5 text-primary" />Artifact deployments · {project.name}</SheetTitle><SheetDescription>Create or import a release, then deploy it to an agent-backed target.</SheetDescription></SheetHeader></div>
      <div className="grid gap-6 p-7 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section className="space-y-4">
          <div className="rounded-lg border border-border/60 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><PackagePlus className="h-4 w-4 text-primary" />New release</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2"><div><Label>Version</Label><Input className="mt-1.5 font-mono" value={version} onChange={(event) => setVersion(event.target.value)} placeholder="1.4.0" /></div><div><Label>Git ref (optional)</Label><Input className="mt-1.5 font-mono" value={ref} onChange={(event) => setRef(event.target.value)} placeholder="v1.4.0" /></div></div>
            {canRelease && <div className="mt-3 flex flex-wrap gap-2">{buildProvider !== 'none' && <Button size="sm" disabled={!version.trim() || busy} onClick={createRelease}>{actions.createRelease.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitBranch className="mr-2 h-4 w-4" />}Build release</Button>}<Button size="sm" variant="outline" disabled={!version.trim() || busy} onClick={() => void importRelease()}><CloudDownload className="mr-2 h-4 w-4" />Import release</Button></div>}
          </div>

          <div className="space-y-2"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Releases</h3>{releases.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}</div>
            {releases.isError && <p className="rounded-md border border-destructive/30 p-3 text-xs text-destructive">{releases.error.message}</p>}
            {(releases.data ?? []).length === 0 && !releases.isLoading && <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">No releases yet.</p>}
            {(releases.data ?? []).map((release) => <div key={release.id} role="radio" aria-checked={selectedReleaseId === release.id} tabIndex={release.status === 'ready' ? 0 : -1} onClick={() => release.status === 'ready' && setSelectedReleaseId(release.id)} onKeyDown={(event) => { if (release.status === 'ready' && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setSelectedReleaseId(release.id); } }} className={`w-full rounded-lg border p-3 text-left transition-colors ${selectedReleaseId === release.id ? 'border-primary bg-primary/5' : 'border-border/60 hover:bg-accent/30'} ${release.status !== 'ready' ? 'cursor-default' : 'cursor-pointer'}`}>
              <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-sm font-semibold">{release.version}</p><p className="mt-1 text-[11px] text-muted-foreground">{formatDate(release.createdAt)}{release.commitSha ? ` · ${release.commitSha.slice(0, 9)}` : ''}</p></div><div className="flex items-center gap-1.5"><Badge variant={statusVariant(release.status)}>{release.status}</Badge>{canDeleteRelease && release.status !== 'building' && <Button type="button" size="sm" variant="ghost" onClick={(event) => { event.stopPropagation(); if (window.confirm(`Delete release '${release.version}'?`)) void actions.deleteRelease.mutateAsync(release.id).catch((cause) => fail('Release could not be deleted', cause)); }}><Trash2 className="h-3.5 w-3.5" /></Button>}</div></div>
              {release.error && <p className="mt-2 text-xs text-destructive">{release.error}</p>}
            </div>)}
          </div>
        </section>

        <section className="space-y-4">
          {canManageTargets && <div className="rounded-lg border border-border/60 p-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><Server className="h-4 w-4 text-primary" />{editingTargetId ? 'Edit target' : 'New target'}</h3><div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div><Label>Name</Label><Input className="mt-1.5" value={targetInput.name} onChange={(event) => setTargetInput((current) => ({ ...current, name: event.target.value }))} placeholder="Payment API Prod" /></div>
            <div><Label>Agent</Label><Select value={targetInput.agentId} onValueChange={(agentId) => setTargetInput((current) => ({ ...current, agentId }))}><SelectTrigger className="mt-1.5"><SelectValue placeholder="Select agent" /></SelectTrigger><SelectContent>{(agents.data ?? []).map((agent) => <SelectItem key={agent.id} value={agent.id}>{agent.id} · {agent.online ? 'online' : 'offline'}</SelectItem>)}</SelectContent></Select>{agents.isError && <p className="mt-1 text-[11px] text-destructive">{agents.error.message}</p>}</div>
            <div><Label>Operating system</Label><Select value={targetInput.os} onValueChange={(os: 'windows' | 'linux') => setTargetInput((current) => ({ ...current, os }))}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="windows">Windows</SelectItem><SelectItem value="linux">Linux</SelectItem></SelectContent></Select></div>
            <div><Label>Environment</Label><Select value={targetInput.environment ?? 'none'} onValueChange={(environment) => setTargetInput((current) => ({ ...current, environment: environment === 'none' ? null : environment as 'Dev' | 'Stage' | 'Prod' }))}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Project default</SelectItem><SelectItem value="Dev">Dev</SelectItem><SelectItem value="Stage">Stage</SelectItem><SelectItem value="Prod">Prod</SelectItem></SelectContent></Select></div>
            <div className="sm:col-span-2"><Label>Base path (optional)</Label><Input className="mt-1.5 font-mono" value={targetInput.basePath ?? ''} onChange={(event) => setTargetInput((current) => ({ ...current, basePath: event.target.value }))} placeholder={targetInput.os === 'windows' ? 'C:\\Apps\\PaymentApi' : '/opt/payment-api'} /></div>
            <div className="sm:col-span-2"><Label>Runtime config (optional, one KEY=value per line)</Label><Textarea className="mt-1.5 min-h-20 font-mono text-xs" value={runtimeConfigText} onChange={(event) => setRuntimeConfigText(event.target.value)} placeholder={'VITE_API_URL=https://api.example.com\nVITE_COMPANY_NAME=Example'} /></div>
          </div><div className="mt-3 flex gap-2"><Button size="sm" disabled={!targetInput.name.trim() || !targetInput.agentId || actions.createTarget.isPending || actions.updateTarget.isPending} onClick={() => void createTarget()}>{(actions.createTarget.isPending || actions.updateTarget.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editingTargetId ? 'Save target' : 'Create target'}</Button>{editingTargetId && <Button size="sm" variant="outline" onClick={() => { setEditingTargetId(null); setTargetInput(initialTarget); setRuntimeConfigText(''); }}>Cancel</Button>}</div></div>}

          <div className="space-y-2"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Targets</h3>{targets.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}</div>
            {targets.isError && <p className="rounded-md border border-destructive/30 p-3 text-xs text-destructive">{targets.error.message}</p>}
            {(targets.data ?? []).length === 0 && !targets.isLoading && <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">No deployment targets yet.</p>}
            {(targets.data ?? []).map((target) => { const isProd = target.environment === 'Prod' || (!target.environment && project.environment === 'Prod') || /(^|[^a-z])prod/i.test(target.name); const confirmation = confirmations[target.id] ?? ''; return <div key={target.id} className="rounded-lg border border-border/60 p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><p className="text-sm font-semibold">{target.name}</p><span className={`h-2 w-2 rounded-full ${onlineAgents.get(target.agentId) ? 'bg-status-ok' : 'bg-muted-foreground/40'}`} /></div><p className="mt-1 font-mono text-[11px] text-muted-foreground">{target.agentId} · {target.os} · {target.environment ?? project.environment}</p><p className="mt-1 text-[11px] text-muted-foreground">Current release: {target.currentReleaseId ? (releaseVersions.get(target.currentReleaseId) ?? target.currentReleaseId) : 'unknown'}{target.basePath ? ` · ${target.basePath}` : ''}</p></div>{canManageTargets && <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => editTarget(target)}><Pencil className="h-3.5 w-3.5" /></Button><Button size="sm" variant="ghost" onClick={() => { if (window.confirm(`Delete target '${target.name}'?`)) void actions.deleteTarget.mutateAsync(target.id).catch((cause) => fail('Target could not be deleted', cause)); }}><Trash2 className="h-3.5 w-3.5" /></Button></div>}</div>
              {isProd && canDeploy && <div className="mt-3"><Label className="text-[11px]">Type <span className="font-mono text-foreground">{target.name}</span> to confirm production actions</Label><Input className="mt-1.5 h-8" value={confirmation} onChange={(event) => setConfirmations((current) => ({ ...current, [target.id]: event.target.value }))} /></div>}
              {canDeploy && <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={actions.refreshTarget.isPending} onClick={() => void actions.refreshTarget.mutateAsync(target.id).catch((cause) => fail('Target status could not be refreshed', cause))}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh</Button><Button size="sm" disabled={!selectedReleaseId || (isProd && confirmation !== target.name) || actions.deploy.isPending} onClick={() => targetAction(target, 'deploy')}><Rocket className="mr-1.5 h-3.5 w-3.5" />Deploy selected</Button><Button size="sm" variant="secondary" disabled={!target.currentReleaseId || (isProd && confirmation !== target.name) || actions.rollback.isPending} onClick={() => targetAction(target, 'rollback')}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Rollback</Button></div>}
            </div>; })}
          </div>
        </section>
      </div>
    </SheetContent>
  </Sheet>;
};
