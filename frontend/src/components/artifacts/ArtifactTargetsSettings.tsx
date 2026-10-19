import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Pencil, Plus, Server, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useArtifactActions, useArtifactReleases, useArtifactTargets, useOnlineAgents } from '@/hooks/useArtifacts';
import { ConfirmActionDialog } from '@/components/artifacts/ConfirmActionDialog';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { environmentLabel, isProdTarget, targetEnvironment } from '@/lib/deployTarget';
import type { Project } from '@/hooks/useProjects';
import type { DeployTarget, DeployTargetInput } from '@/services/transport/types';
import { errorMessage } from '@/lib/errors';
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
  /** project:write; everyone else sees the list read-only. */
  canEdit: boolean;
  /** Start with this customer loaded in the form (from "Müşteriyi düzenle"). */
  editTargetId?: string | null;
};

const initialTarget: DeployTargetInput = { name: '', agentId: '', os: 'windows', environment: 'Dev', basePath: '', ref: '', autoDeploy: false };

/**
 * Müşteriler in project settings: adding, editing and removing customers.
 * Acting on them (install, rollback, apply config) lives in the workspace.
 */
export const ArtifactTargetsSettings = ({ project, canEdit, editTargetId }: Props) => {
  const targets = useArtifactTargets(project.id);
  const agents = useOnlineAgents(true);
  const releases = useArtifactReleases(project.id);
  const actions = useArtifactActions(project.id);
  const { toast } = useToast();
  const components = useMemo(() => project.config?.artifactDeploy?.components ?? [], [project]);
  const [input, setInput] = useState<DeployTargetInput>(initialTarget);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [runtimeEditors, setRuntimeEditors] = useState<RuntimeConfigEditors>({});
  const [deleting, setDeleting] = useState<DeployTarget | null>(null);
  const editingTarget = (targets.data ?? []).find((target) => target.id === editingId);
  const schemaRelease = useMemo(
    () => pickConfigSchemaRelease(releases.data, editingTarget?.currentReleaseId),
    [releases.data, editingTarget?.currentReleaseId],
  );

  useEffect(() => {
    setInput(initialTarget);
    setEditingId(null);
    setRuntimeEditors(createRuntimeConfigEditors(components, null));
  }, [project.id, components]);

  const fail = (title: string, cause: unknown) => toast({ title, description: errorMessage(cause), variant: 'destructive' });
  // One rule for "is this Canlı" everywhere: environment, inherited environment or a "prod" name.
  const draftIsProd = isProdTarget({ environment: input.environment ?? null, name: input.name }, project);
  const resetEditor = () => {
    setInput(initialTarget);
    setEditingId(null);
    setRuntimeEditors(createRuntimeConfigEditors(components, null));
  };

  const saveTarget = async () => {
    try {
      const runtimeConfig = parseRuntimeConfigEditors(components, runtimeEditors);
      // A Canlı customer installs only named releases, so it never keeps a branch
      // -- even one typed before the environment was switched.
      const ref = draftIsProd ? null : input.ref?.trim() || null;
      // Automatic install follows a branch, so it goes with it. Sent only when on,
      // or when the server already reported the field: a server that predates it
      // rejects the unknown key and the save would fail.
      const autoDeploy = Boolean(ref && input.autoDeploy);
      const serverKnowsAutoDeploy = (targets.data ?? []).some((target) => target.autoDeploy !== undefined);
      const { autoDeploy: _draftAutoDeploy, ...rest } = input;
      const normalized = { ...rest, name: input.name.trim(), basePath: input.basePath?.trim() || null, ref, ...(autoDeploy || serverKnowsAutoDeploy ? { autoDeploy } : {}), runtimeConfig };
      if (editingId) await actions.updateTarget.mutateAsync({ id: editingId, input: normalized });
      else await actions.createTarget.mutateAsync(normalized);
      toast({ title: editingId ? 'Müşteri güncellendi' : 'Müşteri eklendi', description: normalized.name });
      resetEditor();
    } catch (cause) { fail(editingId ? 'Müşteri güncellenemedi' : 'Müşteri eklenemedi', cause); }
  };

  const editTarget = (target: DeployTarget) => {
    setEditingId(target.id);
    setInput({ name: target.name, agentId: target.agentId, os: target.os, environment: target.environment, basePath: target.basePath, ref: target.ref, autoDeploy: Boolean(target.autoDeploy), components: target.components });
    setRuntimeEditors(createRuntimeConfigEditors(components, target.runtimeConfig));
  };

  // "Müşteriyi düzenle" in the workspace lands here with that customer loaded.
  const appliedEdit = useRef<string | null>(null);
  useEffect(() => {
    if (!canEdit || !editTargetId || appliedEdit.current === editTargetId) return;
    const target = targets.data?.find((item) => item.id === editTargetId);
    if (!target) return;
    appliedEdit.current = editTargetId;
    setEditingId(target.id);
    setInput({ name: target.name, agentId: target.agentId, os: target.os, environment: target.environment, basePath: target.basePath, ref: target.ref, autoDeploy: Boolean(target.autoDeploy), components: target.components });
    setRuntimeEditors(createRuntimeConfigEditors(components, target.runtimeConfig));
  }, [canEdit, editTargetId, targets.data, components]);

  const removeTarget = async (target: DeployTarget) => {
    try {
      await actions.deleteTarget.mutateAsync(target.id);
      toast({ title: 'Müşteri silindi', description: target.name });
      if (editingId === target.id) resetEditor();
      setDeleting(null);
    } catch (cause) { fail('Müşteri silinemedi', cause); }
  };

  return <div className="space-y-6">
    <p className="text-xs text-muted-foreground">
      Müşteri, bir sürümün kurulacağı yerdir: agent, kurulum dizini, ortam ve çalışma ayarları. Değişiklikler anında kaydedilir.
      Kurulum, geri alma ve ayarları uygulama projenin Müşteriler sekmesinden yapılır.
    </p>

    {canEdit && <section className="rounded-lg border border-border/60 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Server className="h-4 w-4 text-primary" />{editingId ? 'Müşteriyi düzenle' : 'Müşteri ekle'}</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="target-name">Ad</Label><Input id="target-name" className="mt-1.5" value={input.name} onChange={(event) => setInput((current) => ({ ...current, name: event.target.value }))} placeholder="Acme Test" /></div>
        <div><Label>Agent</Label><Select value={input.agentId} onValueChange={(agentId) => setInput((current) => ({ ...current, agentId }))}><SelectTrigger className="mt-1.5"><SelectValue placeholder="Agent seçin" /></SelectTrigger><SelectContent>{(agents.data ?? []).map((agent) => <SelectItem key={agent.id} value={agent.id}>{agent.id} · {agent.online ? 'çevrimiçi' : 'çevrimdışı'}</SelectItem>)}</SelectContent></Select>{agents.isError && <p className="mt-1 text-[11px] text-destructive">{agents.error.message}</p>}</div>
        <div><Label>İşletim sistemi</Label><Select value={input.os} onValueChange={(os: 'windows' | 'linux') => setInput((current) => ({ ...current, os }))}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="windows">Windows</SelectItem><SelectItem value="linux">Linux</SelectItem></SelectContent></Select></div>
        <div><Label>Ortam</Label><Select value={input.environment ?? 'none'} onValueChange={(environment) => setInput((current) => {
          const next = environment === 'none' ? null : environment as 'Dev' | 'Stage' | 'Prod';
          // Switching to Canlı drops the branch right away, so it is not saved by accident.
          const prod = isProdTarget({ environment: next, name: current.name }, project);
          return { ...current, environment: next, ref: prod ? '' : current.ref, autoDeploy: prod ? false : current.autoDeploy };
        })}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Proje varsayılanı ({environmentLabel(project.environment)})</SelectItem><SelectItem value="Dev">Geliştirme</SelectItem><SelectItem value="Stage">Test</SelectItem><SelectItem value="Prod">Canlı</SelectItem></SelectContent></Select></div>
        {draftIsProd ? <p className="text-[11px] text-muted-foreground sm:col-span-2">
          Canlı müşteri: branch tanımlanmaz, yalnız adı verilmiş (tag'den derlenmiş) sürümler kurulur.{input.environment !== 'Prod' ? ' Adında "prod" geçtiği için canlı sayılıyor.' : ''}
        </p> : <div className="sm:col-span-2">
          <Label htmlFor="target-ref">Branch (isteğe bağlı)</Label>
          <Input id="target-ref" className="mt-1.5 font-mono" value={input.ref ?? ''} onChange={(event) => setInput((current) => ({ ...current, ref: event.target.value }))} placeholder="test" />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Tanımlanırsa Müşteriler sekmesinde bu müşteri için "Branch'ten yeniden derle" çıkar: branch'in son hâli derlenip
            otomatik sürüm adıyla kurulur.
          </p>
          <label className={cn('mt-2 inline-flex items-center gap-2 text-xs', input.ref?.trim() ? 'cursor-pointer' : 'cursor-not-allowed text-muted-foreground')}>
            <input type="checkbox" checked={Boolean(input.ref?.trim() && input.autoDeploy)} disabled={!input.ref?.trim()} onChange={(event) => setInput((current) => ({ ...current, autoDeploy: event.target.checked }))} className="h-3.5 w-3.5 accent-primary" />
            Push'ta otomatik kur
          </label>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Jenkins bu branch'e gelen bir push'la kendiliğinden derleyip IDP'ye yüklediğinde sürüm bu müşteriye hemen kurulur.
            Jenkins'te branch'in IDP_AUTO_RELEASE_BRANCHES listesinde olması gerekir.
          </p>
        </div>}
        <div className="sm:col-span-2"><Label htmlFor="target-base-path">Kurulum dizini (isteğe bağlı)</Label><Input id="target-base-path" className="mt-1.5 font-mono" value={input.basePath ?? ''} onChange={(event) => setInput((current) => ({ ...current, basePath: event.target.value }))} placeholder={input.os === 'windows' ? 'C:\\Apps\\PaymentApi' : '/opt/payment-api'} /></div>
        <div className="space-y-3 sm:col-span-2">
          <div><Label>Bileşen çalışma ayarları</Label><p className="mt-1 text-[11px] text-muted-foreground">Sunucuda gizli kayıt açıksa şifreli saklanır. Kurulu müşteriye yazmak için Müşteriler sekmesinde "Ayarları uygula" kullanın.</p></div>
          {components.length === 0 && <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">Önce Derleme ve kaynak sekmesinde bileşenleri tanımlayın.</p>}
          {components.map((component) => {
            const editor = runtimeEditors[component.name] ?? { format: component.runtime.type === 'iis-static' ? 'frontend-config-js' as const : 'env-file' as const, text: '' };
            return <div key={component.name} className="rounded-md border border-border/60 bg-accent/10 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-mono text-xs font-semibold">{component.name}</p><p className="text-[10px] text-muted-foreground">{component.subdir} · {component.runtime.type}</p></div><Select value={editor.format} onValueChange={(format: 'frontend-config-js' | 'env-file') => setRuntimeEditors((current) => ({ ...current, [component.name]: { ...editor, format } }))}><SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="frontend-config-js">config.js</SelectItem><SelectItem value="env-file">.env</SelectItem></SelectContent></Select></div>
              <Textarea aria-label={`${component.name} çalışma ayarları`} className="mt-2 min-h-24 font-mono text-xs" value={editor.text} onChange={(event) => setRuntimeEditors((current) => ({ ...current, [component.name]: { ...editor, text: event.target.value } }))} placeholder={editor.format === 'frontend-config-js' ? 'API_BASE_URL=https://api.example.com' : 'PORT=3000'} />
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
                    <p className="text-[10px] text-muted-foreground"><span className="font-mono">.env.example</span> anahtarları · sürüm {schemaRelease?.version}{missing.length === 0 ? ` · ${suggested.length} anahtarın hepsi tanımlı` : ''}</p>
                    {required.length > 1 && <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => append(required)}>{required.length} zorunlu anahtarı ekle</Button>}
                  </div>
                  {missing.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {missing.map((item) => <button
                      key={item.key}
                      type="button"
                      onClick={() => append([item])}
                      title={[item.description, `Varsayılan: ${item.defaultValue || '(boş)'}`, item.optional ? 'İsteğe bağlı' : null].filter(Boolean).join('\n')}
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
      <div className="mt-3 flex gap-2"><Button size="sm" disabled={!input.name.trim() || !input.agentId || actions.createTarget.isPending || actions.updateTarget.isPending} onClick={() => void saveTarget()}>{(actions.createTarget.isPending || actions.updateTarget.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editingId ? 'Müşteriyi kaydet' : 'Müşteri ekle'}</Button>{editingId && <Button size="sm" variant="outline" onClick={resetEditor}>Vazgeç</Button>}</div>
    </section>}

    <section className="space-y-2">
      <div className="flex items-end justify-between gap-3"><h3 className="text-sm font-semibold">Tanımlı müşteriler</h3>{targets.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}</div>
      {targets.isError && <p className="rounded-md border border-destructive/30 p-3 text-xs text-destructive">{targets.error.message}</p>}
      {(targets.data ?? []).length === 0 && !targets.isLoading && !targets.isError && <div className="rounded-md border border-dashed p-6 text-center"><Server className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-2 text-sm font-medium">Henüz müşteri yok</p>{canEdit && <p className="mt-1 text-xs text-muted-foreground">İlk müşteriyi yukarıdan ekleyin.</p>}</div>}
      {(targets.data ?? []).map((target) => {
        const online = agents.online.get(target.agentId);
        const isProd = isProdTarget(target, project);
        return <div key={target.id} className={cn('rounded-lg border p-3', editingId === target.id ? 'border-primary/50' : 'border-border/60')}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">{target.name}</p>
                <span className={cn('rounded border px-1.5 py-0.5 text-[10px]', isProd ? 'border-status-fail/40 text-status-fail' : 'border-border text-muted-foreground')}>{environmentLabel(targetEnvironment(target, project))}</span>
                <span className={cn('text-[11px]', online ? 'text-status-ok' : 'text-muted-foreground')}>agent {online ? 'çevrimiçi' : 'çevrimdışı'}</span>
              </div>
              <p className="mt-1 break-words font-mono text-[11px] text-muted-foreground">{target.agentId} · {target.os}{target.basePath ? ` · ${target.basePath}` : ''}{target.ref && !isProd ? ` · branch ${target.ref}` : ''}{target.ref && !isProd && target.autoDeploy ? ' · push\'ta otomatik kurulur' : ''}</p>
            </div>
            {canEdit && <div className="flex gap-1">
              <Button size="sm" variant="ghost" aria-label={`${target.name} müşterisini düzenle`} onClick={() => editTarget(target)}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button size="sm" variant="ghost" aria-label={`${target.name} müşterisini sil`} onClick={() => setDeleting(target)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>}
          </div>
        </div>;
      })}
    </section>

    <ConfirmActionDialog
      open={Boolean(deleting)}
      onOpenChange={(open) => !open && setDeleting(null)}
      title={`Müşteriyi sil · ${deleting?.name ?? ''}`}
      description="Müşteri IDP'den kaldırılır. Sunucudaki kurulu dosyalara dokunulmaz."
      confirmLabel="Sil"
      destructive
      pending={actions.deleteTarget.isPending}
      onConfirm={() => deleting && void removeTarget(deleting)}
    />
  </div>;
};
