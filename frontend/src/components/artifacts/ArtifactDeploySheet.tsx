import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Loader2, Package, RefreshCw, Rocket, RotateCcw, Server, Settings } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useArtifactActions, useArtifactAgents, useArtifactReleases, useArtifactTargets } from '@/hooks/useArtifacts';
import { useSession } from '@/hooks/useSession';
import { can } from '@/lib/permissions';
import { useToast } from '@/hooks/use-toast';
import type { Project } from '@/hooks/useProjects';

type Props = {
  project: Project | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onRunStarted: (deploymentId: string) => void;
  onOpenReleases: () => void;
  onOpenTargets: () => void;
};

const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';

export const ArtifactDeploySheet = ({ project, isOpen, onOpenChange, onRunStarted, onOpenReleases, onOpenTargets }: Props) => {
  const projectId = project?.id;
  const { data: session } = useSession();
  const canDeploy = can(session?.role, 'deploy:trigger');
  const releases = useArtifactReleases(isOpen ? projectId : undefined);
  const targets = useArtifactTargets(isOpen ? projectId : undefined);
  const agents = useArtifactAgents(isOpen);
  const actions = useArtifactActions(projectId ?? '');
  const { toast } = useToast();
  const [releaseId, setReleaseId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [confirmation, setConfirmation] = useState('');

  const readyReleases = useMemo(() => (releases.data ?? []).filter((release) => release.status === 'ready'), [releases.data]);
  const onlineAgents = useMemo(() => new Map((agents.data ?? []).map((agent) => [agent.id, agent.online])), [agents.data]);
  const selectedRelease = readyReleases.find((release) => release.id === releaseId);
  const selectedTarget = (targets.data ?? []).find((target) => target.id === targetId);

  useEffect(() => {
    setReleaseId('');
    setTargetId('');
    setConfirmation('');
  }, [projectId]);

  useEffect(() => {
    if (!isOpen || readyReleases.length === 0) return;
    if (!readyReleases.some((release) => release.id === releaseId)) setReleaseId(readyReleases[0].id);
  }, [isOpen, readyReleases, releaseId]);

  useEffect(() => { setConfirmation(''); }, [targetId]);

  if (!project) return null;

  const fail = (title: string, cause: unknown) => toast({ title, description: cause instanceof Error ? cause.message : 'Unknown error.', variant: 'destructive' });
  const targetIsProd = Boolean(selectedTarget && (selectedTarget.environment === 'Prod' || (!selectedTarget.environment && project.environment === 'Prod') || /(^|[^a-z])prod/i.test(selectedTarget.name)));
  const agentOnline = selectedTarget ? onlineAgents.get(selectedTarget.agentId) : undefined;
  const confirmed = !targetIsProd || confirmation === selectedTarget?.name;
  const canSubmit = Boolean(canDeploy && selectedRelease && selectedTarget && agentOnline && confirmed && !actions.deploy.isPending);

  const deploy = async () => {
    if (!selectedRelease || !selectedTarget) return;
    try {
      const result = await actions.deploy.mutateAsync({ targetId: selectedTarget.id, releaseId: selectedRelease.id, confirmation: confirmation.trim() || undefined });
      toast({ title: 'Deployment started', description: `${selectedRelease.version} → ${selectedTarget.name}` });
      onRunStarted(result.deploymentId);
    } catch (cause) { fail('Deployment failed', cause); }
  };

  const rollback = async () => {
    if (!selectedTarget) return;
    try {
      const result = await actions.rollback.mutateAsync({ targetId: selectedTarget.id, confirmation: confirmation.trim() || undefined });
      toast({ title: 'Rollback started', description: selectedTarget.name });
      onRunStarted(result.deploymentId);
    } catch (cause) { fail('Rollback failed', cause); }
  };

  const loading = releases.isLoading || targets.isLoading || agents.isLoading;

  return <Sheet open={isOpen} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="flex w-[min(900px,calc(100vw-3rem))] max-w-none flex-col overflow-hidden border-l-line-strong bg-background p-0 sm:max-w-none">
      <div className="shrink-0 border-b border-line-strong bg-bar px-7 py-6">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3 text-xl"><Rocket className="h-5 w-5 text-primary" />Deploy · {project.name}</SheetTitle>
          <SheetDescription>Select an existing Ready release and a configured target. This screen does not create or edit either resource.</SheetDescription>
        </SheetHeader>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-7">
        {loading ? <div className="flex h-48 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : <div className="mx-auto max-w-3xl space-y-6">
          {readyReleases.length === 0 ? <section className="rounded-lg border border-dashed p-8 text-center">
            <Package className="mx-auto h-6 w-6 text-muted-foreground" />
            <h3 className="mt-3 text-sm font-semibold">No Ready release</h3>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">Create or import a release before starting a deployment.</p>
            <Button className="mt-4" variant="outline" onClick={onOpenReleases}><Package className="mr-2 h-4 w-4" />Open Releases</Button>
          </section> : (targets.data ?? []).length === 0 ? <section className="rounded-lg border border-dashed p-8 text-center">
            <Server className="mx-auto h-6 w-6 text-muted-foreground" />
            <h3 className="mt-3 text-sm font-semibold">No deployment target</h3>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">Add a persistent customer destination in Project Settings, then return here to deploy.</p>
            <Button className="mt-4" variant="outline" onClick={onOpenTargets}><Settings className="mr-2 h-4 w-4" />Add target</Button>
          </section> : <>
            <section className="grid gap-4 rounded-lg border border-border/60 p-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="artifact-release">Release</Label>
                <Select value={releaseId} onValueChange={setReleaseId}><SelectTrigger id="artifact-release" className="mt-1.5"><SelectValue placeholder="Select a Ready release" /></SelectTrigger><SelectContent>{readyReleases.map((release) => <SelectItem key={release.id} value={release.id}><span className="font-mono">{release.version}</span></SelectItem>)}</SelectContent></Select>
                {selectedRelease && <p className="mt-2 text-[11px] text-muted-foreground">{formatDate(selectedRelease.createdAt)}{selectedRelease.commitSha ? ` · ${selectedRelease.commitSha.slice(0, 9)}` : ''}</p>}
              </div>
              <div>
                <Label htmlFor="artifact-target">Target</Label>
                <Select value={targetId} onValueChange={setTargetId}><SelectTrigger id="artifact-target" className="mt-1.5"><SelectValue placeholder="Select a configured target" /></SelectTrigger><SelectContent>{(targets.data ?? []).map((target) => <SelectItem key={target.id} value={target.id}>{target.name} · {target.environment ?? project.environment}</SelectItem>)}</SelectContent></Select>
                {selectedTarget && <div className="mt-2 flex items-center gap-2"><Badge variant={agentOnline ? 'secondary' : 'destructive'}>{agentOnline ? 'agent online' : 'agent offline'}</Badge><span className="truncate font-mono text-[11px] text-muted-foreground">{selectedTarget.agentId}</span></div>}
              </div>
            </section>

            {selectedTarget && <section className="rounded-lg border border-border/60 p-4">
              <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Target status</h3><p className="mt-1 text-xs text-muted-foreground">{selectedTarget.os} · {selectedTarget.environment ?? project.environment}{selectedTarget.basePath ? ` · ${selectedTarget.basePath}` : ''}</p></div><Button size="sm" variant="outline" disabled={actions.refreshTarget.isPending} onClick={() => void actions.refreshTarget.mutateAsync(selectedTarget.id).catch((cause) => fail('Target status could not be refreshed', cause))}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh</Button></div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">{(project.config?.artifactDeploy?.components ?? []).map((component) => { const installed = selectedTarget.currentVersions?.[component.name]; return <div key={component.name} className="rounded-md bg-accent/20 px-3 py-2"><p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{component.name}</p><p className="mt-0.5 font-mono text-xs font-semibold">{installed?.version ?? 'not installed'}</p>{installed?.deployedAt && <p className="mt-0.5 text-[10px] text-muted-foreground">{formatDate(installed.deployedAt)}</p>}</div>; })}</div>
            </section>}

            <section className="rounded-lg border border-primary/40 bg-primary/5 p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">Deployment summary</p>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm font-semibold"><span className="rounded-md bg-background px-3 py-2 font-mono">{selectedRelease?.version ?? 'Select release'}</span><ArrowRight className="h-4 w-4 text-primary" aria-hidden="true" /><span className="rounded-md bg-background px-3 py-2">{selectedTarget?.name ?? 'Select target'}</span></div>
              {selectedTarget && targetIsProd && <div className="mt-4"><Label className="text-[11px]">Type <span className="font-mono text-foreground">{selectedTarget.name}</span> to confirm production actions</Label><Input className="mt-1.5" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div>}
              {selectedTarget && !agentOnline && <p className="mt-3 text-xs text-destructive">The selected agent is offline. Start the agent before deploying.</p>}
              <Button className="mt-4" disabled={!canSubmit} onClick={() => void deploy()}>{actions.deploy.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}Deploy {selectedRelease?.version ?? 'release'}</Button>
            </section>

            {selectedTarget?.currentReleaseId && <section className="border-t border-line-strong pt-5">
              <p className="text-xs font-semibold">Recovery</p>
              <p className="mt-1 text-xs text-muted-foreground">Rollback is separated from the primary deployment action and restores this target’s previous release.</p>
              <Button className="mt-3" size="sm" variant="secondary" disabled={!canDeploy || !agentOnline || !confirmed || actions.rollback.isPending} onClick={() => void rollback()}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Rollback target</Button>
            </section>}
          </>}
        </div>}
      </div>
    </SheetContent>
  </Sheet>;
};
