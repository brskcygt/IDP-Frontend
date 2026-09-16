import { useEffect, useMemo, useState } from 'react';
import { FileCog, Loader2, Pencil, Plus, RefreshCw, Server, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useArtifactActions, useArtifactAgents, useArtifactReleases, useArtifactTargets } from '@/hooks/useArtifacts';
import { useToast } from '@/hooks/use-toast';
import type { Project } from '@/hooks/useProjects';
import type { DeployTarget, DeployTargetInput } from '@/services/transport/types';
import {
  appendRuntimeConfigLines,
  createRuntimeConfigEditors,
  parseRuntimeConfigEditors,
  pickConfigSchemaRelease,
  runtimeConfigEditorKeys,
  type RuntimeConfigEditors,
} from '@/components/artifacts/runtimeConfig';

type Props = {
  project: Project;
  onRunStarted?: (deploymentId: string) => void;
};

const initialTarget: DeployTargetInput = { name: '', agentId: '', os: 'windows', environment: 'Dev', basePath: '' };
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';

export const ArtifactTargetsSettings = ({ project, onRunStarted }: Props) => {
  const targets = useArtifactTargets(project.id);
  const agents = useArtifactAgents(true);
  const releases = useArtifactReleases(project.id);
  const actions = useArtifactActions(project.id);
  const { toast } = useToast();
  const components = useMemo(() => project.config?.artifactDeploy?.components ?? [], [project]);
  const onlineAgents = useMemo(() => new Map((agents.data ?? []).map((agent) => [agent.id, agent.online])), [agents.data]);
  const [input, setInput] = useState<DeployTargetInput>(initialTarget);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [runtimeEditors, setRuntimeEditors] = useState<RuntimeConfigEditors>({});
  const [confirmations, setConfirmations] = useState<Record<string, string>>({});
  const editingTarget = (targets.data ?? []).find((target) => target.id === editingId);
  const schemaRelease = useMemo(
    () => pickConfigSchemaRelease(releases.data, editingTarget?.currentReleaseId),
    [releases.data, editingTarget?.currentReleaseId],
  );

  useEffect(() => {
    setInput(initialTarget);
    setEditingId(null);
    setRuntimeEditors(createRuntimeConfigEditors(components, null));
    setConfirmations({});
  }, [project.id, components]);

  const fail = (title: string, cause: unknown) => toast({ title, description: cause instanceof Error ? cause.message : 'Unknown error.', variant: 'destructive' });
  const resetEditor = () => {
    setInput(initialTarget);
    setEditingId(null);
    setRuntimeEditors(createRuntimeConfigEditors(components, null));
  };

  const saveTarget = async () => {
    try {
      const runtimeConfig = parseRuntimeConfigEditors(components, runtimeEditors);
      const normalized = { ...input, name: input.name.trim(), basePath: input.basePath?.trim() || null, runtimeConfig };
      if (editingId) await actions.updateTarget.mutateAsync({ id: editingId, input: normalized });
      else await actions.createTarget.mutateAsync(normalized);
      toast({ title: editingId ? 'Target updated' : 'Target created', description: normalized.name });
      resetEditor();
    } catch (cause) { fail(editingId ? 'Target could not be updated' : 'Target could not be created', cause); }
  };

  const editTarget = (target: DeployTarget) => {
    setEditingId(target.id);
    setInput({ name: target.name, agentId: target.agentId, os: target.os, environment: target.environment, basePath: target.basePath, components: target.components });
    setRuntimeEditors(createRuntimeConfigEditors(components, target.runtimeConfig));
  };

  const applyConfig = async (target: DeployTarget) => {
    try {
      const result = await actions.applyConfig.mutateAsync({ targetId: target.id, confirmation: confirmations[target.id] || undefined });
      toast({ title: 'Config apply started', description: target.name });
      onRunStarted?.(result.deploymentId);
    } catch (cause) { fail('Config apply failed', cause); }
  };

  return <div className="space-y-6">
    <section className="rounded-lg border border-border/60 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Server className="h-4 w-4 text-primary" />{editingId ? 'Edit target' : 'Add target'}</h3>
      <p className="mt-1 text-xs text-muted-foreground">Targets are persistent destinations. Configure them once, then select them from Deploy.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div><Label>Name</Label><Input autoFocus className="mt-1.5" value={input.name} onChange={(event) => setInput((current) => ({ ...current, name: event.target.value }))} placeholder="Payment API Prod" /></div>
        <div><Label>Agent</Label><Select value={input.agentId} onValueChange={(agentId) => setInput((current) => ({ ...current, agentId }))}><SelectTrigger className="mt-1.5"><SelectValue placeholder="Select agent" /></SelectTrigger><SelectContent>{(agents.data ?? []).map((agent) => <SelectItem key={agent.id} value={agent.id}>{agent.id} · {agent.online ? 'online' : 'offline'}</SelectItem>)}</SelectContent></Select>{agents.isError && <p className="mt-1 text-[11px] text-destructive">{agents.error.message}</p>}</div>
        <div><Label>Operating system</Label><Select value={input.os} onValueChange={(os: 'windows' | 'linux') => setInput((current) => ({ ...current, os }))}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="windows">Windows</SelectItem><SelectItem value="linux">Linux</SelectItem></SelectContent></Select></div>
        <div><Label>Environment</Label><Select value={input.environment ?? 'none'} onValueChange={(environment) => setInput((current) => ({ ...current, environment: environment === 'none' ? null : environment as 'Dev' | 'Stage' | 'Prod' }))}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Project default</SelectItem><SelectItem value="Dev">Dev</SelectItem><SelectItem value="Stage">Stage</SelectItem><SelectItem value="Prod">Prod</SelectItem></SelectContent></Select></div>
        <div className="sm:col-span-2"><Label>Base path (optional)</Label><Input className="mt-1.5 font-mono" value={input.basePath ?? ''} onChange={(event) => setInput((current) => ({ ...current, basePath: event.target.value }))} placeholder={input.os === 'windows' ? 'C:\\Apps\\PaymentApi' : '/opt/payment-api'} /></div>
        <div className="space-y-3 sm:col-span-2">
          <div><Label>Component runtime config</Label><p className="mt-1 text-[11px] text-muted-foreground">Saved encrypted when server secret storage is enabled. Apply config restarts and health-checks an existing runtime.</p></div>
          {components.length === 0 && <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">Configure project artifact components before adding runtime config.</p>}
          {components.map((component) => {
            const editor = runtimeEditors[component.name] ?? { format: component.runtime.type === 'iis-static' ? 'frontend-config-js' as const : 'env-file' as const, text: '' };
            return <div key={component.name} className="rounded-md border border-border/60 bg-accent/10 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-mono text-xs font-semibold">{component.name}</p><p className="text-[10px] text-muted-foreground">{component.subdir} · {component.runtime.type}</p></div><Select value={editor.format} onValueChange={(format: 'frontend-config-js' | 'env-file') => setRuntimeEditors((current) => ({ ...current, [component.name]: { ...editor, format } }))}><SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="frontend-config-js">config.js</SelectItem><SelectItem value="env-file">.env</SelectItem></SelectContent></Select></div>
              <Textarea aria-label={`${component.name} runtime config`} className="mt-2 min-h-24 font-mono text-xs" value={editor.text} onChange={(event) => setRuntimeEditors((current) => ({ ...current, [component.name]: { ...editor, text: event.target.value } }))} placeholder={editor.format === 'frontend-config-js' ? 'API_BASE_URL=https://api.example.com' : 'PORT=3000'} />
              {(() => {
                const suggested = schemaRelease?.configSchema?.[component.name]?.keys ?? [];
                if (suggested.length === 0) return null;
                const present = runtimeConfigEditorKeys(editor.text);
                const missing = suggested.filter((item) => !present.has(item.key));
                const append = (items: typeof suggested) => setRuntimeEditors((current) => ({
                  ...current,
                  [component.name]: { ...editor, text: appendRuntimeConfigLines(editor.text, items.map((item) => `${item.key}=${item.defaultValue}`)) },
                }));
                const required = missing.filter((item) => !item.optional);
                return <div className="mt-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] text-muted-foreground">Supported keys from <span className="font-mono">.env.example</span> · release {schemaRelease?.version}{missing.length === 0 ? ` · all ${suggested.length} set` : ''}</p>
                    {required.length > 1 && <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => append(required)}>Add {required.length} required</Button>}
                  </div>
                  {missing.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {missing.map((item) => <button
                      key={item.key}
                      type="button"
                      onClick={() => append([item])}
                      title={[item.description, `Default: ${item.defaultValue || '(empty)'}`, item.optional ? 'Optional' : null].filter(Boolean).join('\n')}
                      className={item.optional
                        ? 'flex items-center gap-1 rounded border border-dashed border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:border-primary/40 hover:text-foreground'
                        : 'flex items-center gap-1 rounded border border-primary/30 bg-primary/5 px-1.5 py-0.5 font-mono text-[10px] text-primary hover:bg-primary/10'}
                    ><Plus className="h-3 w-3" />{item.key}</button>)}
                  </div>}
                </div>;
              })()}
            </div>;
          })}
        </div>
      </div>
      <div className="mt-3 flex gap-2"><Button size="sm" disabled={!input.name.trim() || !input.agentId || actions.createTarget.isPending || actions.updateTarget.isPending} onClick={() => void saveTarget()}>{(actions.createTarget.isPending || actions.updateTarget.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editingId ? 'Save target' : 'Add target'}</Button>{editingId && <Button size="sm" variant="outline" onClick={resetEditor}>Cancel</Button>}</div>
    </section>

    <section className="space-y-2">
      <div className="flex items-end justify-between gap-3"><div><h3 className="text-sm font-semibold">Configured targets</h3><p className="mt-1 text-xs text-muted-foreground">These destinations are available from the project’s Deploy action.</p></div>{targets.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}</div>
      {targets.isError && <p className="rounded-md border border-destructive/30 p-3 text-xs text-destructive">{targets.error.message}</p>}
      {(targets.data ?? []).length === 0 && !targets.isLoading && <div className="rounded-md border border-dashed p-6 text-center"><Server className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-2 text-sm font-medium">No targets configured</p><p className="mt-1 text-xs text-muted-foreground">Add the first customer destination above.</p></div>}
      {(targets.data ?? []).map((target) => {
        const agentOnline = onlineAgents.get(target.agentId);
        const isProd = target.environment === 'Prod' || (!target.environment && project.environment === 'Prod') || /(^|[^a-z])prod/i.test(target.name);
        const confirmation = confirmations[target.id] ?? '';
        return <div key={target.id} className="rounded-lg border border-border/60 p-4">
          <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><p className="text-sm font-semibold">{target.name}</p><Badge variant={agentOnline ? 'secondary' : 'outline'}>{agentOnline ? 'agent online' : 'agent offline'}</Badge></div><p className="mt-1 break-words font-mono text-[11px] text-muted-foreground">{target.agentId} · {target.os} · {target.environment ?? project.environment}{target.basePath ? ` · ${target.basePath}` : ''}</p></div><div className="flex gap-1"><Button size="sm" variant="ghost" aria-label={`Edit target ${target.name}`} onClick={() => editTarget(target)}><Pencil className="h-3.5 w-3.5" /></Button><Button size="sm" variant="ghost" aria-label={`Delete target ${target.name}`} onClick={() => { if (window.confirm(`Delete target '${target.name}'?`)) void actions.deleteTarget.mutateAsync(target.id).catch((cause) => fail('Target could not be deleted', cause)); }}><Trash2 className="h-3.5 w-3.5" /></Button></div></div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">{components.map((component) => { const installed = target.currentVersions?.[component.name]; return <div key={component.name} className="rounded-md bg-accent/20 px-3 py-2"><p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{component.name}</p><p className="mt-0.5 font-mono text-xs font-semibold">{installed?.version ?? 'not installed'}</p>{installed?.deployedAt && <p className="mt-0.5 text-[10px] text-muted-foreground">{formatDate(installed.deployedAt)}</p>}</div>; })}</div>
          {isProd && <div className="mt-3"><Label className="text-[11px]">Type <span className="font-mono text-foreground">{target.name}</span> to confirm production config changes</Label><Input className="mt-1.5 h-8" value={confirmation} onChange={(event) => setConfirmations((current) => ({ ...current, [target.id]: event.target.value }))} /></div>}
          <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={actions.refreshTarget.isPending} onClick={() => void actions.refreshTarget.mutateAsync(target.id).catch((cause) => fail('Target status could not be refreshed', cause))}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh status</Button><Button size="sm" variant="outline" disabled={(isProd && confirmation !== target.name) || actions.applyConfig.isPending} onClick={() => void applyConfig(target)}>{actions.applyConfig.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileCog className="mr-1.5 h-3.5 w-3.5" />}Apply config</Button></div>
        </div>;
      })}
    </section>
  </div>;
};
