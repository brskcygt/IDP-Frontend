import { useRef, useState } from 'react';
import { Download, PackageOpen, Upload } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { getTransport } from '@/services/transport';
import type { Project } from '@/services/transport/types';
import type { ProjectConfig } from '@/types/project';

type Props = { isOpen: boolean; onOpenChange: (open: boolean) => void; projects: Project[] };
type PortableProject = Pick<Project, 'name' | 'tenant' | 'environment' | 'provider'> & { config?: ProjectConfig };
type Bundle = { schema: 'mdp.idp.workspace'; version: 1; exportedAt: string; runners: Array<{ id: string; name: string }>; projects: PortableProject[] };

const SECRET_KEY = /password|passphrase|token|secret|privatekey|credential|haspassword|hastoken|hassecret|hasprivatekey/i;
const stripSecrets = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !SECRET_KEY.test(key))
    .map(([key, nested]) => [key, stripSecrets(nested)]));
};

export const WorkspaceTransferSheet = ({ isOpen, onOpenChange, projects }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const exportBundle = async () => {
    setBusy(true); setResult(null);
    try {
      const runners = await getTransport().runners.list();
      const bundle: Bundle = {
        schema: 'mdp.idp.workspace', version: 1, exportedAt: new Date().toISOString(),
        runners: runners.map(({ id, name }) => ({ id, name })),
        projects: projects.map((project) => ({ name: project.name, tenant: project.tenant, environment: project.environment, provider: project.provider, config: stripSecrets(project.config) as ProjectConfig | undefined })),
      };
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `idp-workspace-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url);
      setResult(`${bundle.projects.length} proje ve ${bundle.runners.length} runner referansı dışa aktarıldı. Secret değerleri pakete alınmadı.`);
    } catch (cause) { setResult(cause instanceof Error ? cause.message : 'Export başarısız.'); }
    finally { setBusy(false); }
  };

  const importBundle = async (file: File) => {
    setBusy(true); setResult(null);
    try {
      const parsed = JSON.parse(await file.text()) as Partial<Bundle>;
      if (parsed.schema !== 'mdp.idp.workspace' || parsed.version !== 1 || !Array.isArray(parsed.projects) || !Array.isArray(parsed.runners)) throw new Error('Desteklenmeyen veya bozuk IDP workspace paketi.');
      const existingProjects = await getTransport().projects.list();
      const existingNames = new Set(existingProjects.map((project) => `${project.tenant}\0${project.name}`.toLowerCase()));
      const localRunners = await getTransport().runners.list();
      const runnerNameByOldId = new Map(parsed.runners.map((runner) => [runner.id, runner.name]));
      const localRunnerByName = new Map(localRunners.map((runner) => [runner.name.toLowerCase(), runner.id]));
      let imported = 0; let skipped = 0;
      for (const portable of parsed.projects) {
        if (!portable || typeof portable.name !== 'string' || typeof portable.tenant !== 'string' || typeof portable.environment !== 'string' || typeof portable.provider !== 'string') { skipped += 1; continue; }
        const identity = `${portable.tenant}\0${portable.name}`.toLowerCase();
        if (existingNames.has(identity)) { skipped += 1; continue; }
        const created = await getTransport().projects.create({ name: portable.name, tenant: portable.tenant, environment: portable.environment, provider: portable.provider });
        const config = stripSecrets(portable.config ?? {}) as ProjectConfig;
        if (config.runnerAgentId) {
          const oldName = runnerNameByOldId.get(config.runnerAgentId);
          config.runnerAgentId = oldName ? localRunnerByName.get(oldName.toLowerCase()) : undefined;
        }
        if (Object.keys(config).length > 0) await getTransport().projects.updateConfig(created.id, config);
        existingNames.add(identity); imported += 1;
      }
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      setResult(`${imported} proje içe aktarıldı, ${skipped} kayıt yinelendi veya geçersizdi. Secret alanlarını proje ayarlarından yeniden girin.`);
    } catch (cause) { setResult(cause instanceof Error ? cause.message : 'Import başarısız.'); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ''; }
  };

  return <Sheet open={isOpen} onOpenChange={onOpenChange}><SheetContent side="right" className="w-[min(760px,calc(100vw-3.5rem))] max-w-none border-l-line-strong bg-background p-0 sm:max-w-none"><div className="border-b border-line-strong bg-bar px-7 py-6"><SheetHeader><SheetTitle className="flex items-center gap-3 text-xl"><PackageOpen className="h-5 w-5 text-primary" />Workspace transfer</SheetTitle><SheetDescription>Projeleri ve runner eşlemelerini ekip üyeleri arasında sürümlü bir JSON paketiyle taşıyın.</SheetDescription></SheetHeader></div><div className="space-y-5 p-7"><div className="grid gap-4 sm:grid-cols-2"><button disabled={busy} onClick={() => void exportBundle()} className="group rounded-xl border border-line bg-surface p-5 text-left hover:border-primary/50"><Download className="mb-6 h-6 w-6 text-primary" /><p className="font-semibold">Export workspace</p><p className="mt-2 text-xs leading-5 text-muted-foreground">Proje konfigürasyonları ve runner ad/ID referansları. Parola, token ve private key değerleri dışarı çıkmaz.</p></button><button disabled={busy} onClick={() => inputRef.current?.click()} className="group rounded-xl border border-line bg-surface p-5 text-left hover:border-primary/50"><Upload className="mb-6 h-6 w-6 text-primary" /><p className="font-semibold">Import workspace</p><p className="mt-2 text-xs leading-5 text-muted-foreground">Aynı tenant + proje adına sahip kayıtlar atlanır; runnerlar isim üzerinden mevcut filoya eşlenir.</p></button></div><input ref={inputRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importBundle(file); }} />{result && <div className="rounded-lg border border-line bg-accent/30 p-4 text-xs leading-5 text-muted-foreground">{result}</div>}<div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-4 text-xs leading-5 text-amber-200"><strong>Secretsız paket:</strong> İçe aktarılan projelerde parola, API tokenı, MFA secretı ve private key yeniden tanımlanmalıdır. Runner cihaz kimlik bilgileri hiçbir zaman export edilmez.</div></div></SheetContent></Sheet>;
};
