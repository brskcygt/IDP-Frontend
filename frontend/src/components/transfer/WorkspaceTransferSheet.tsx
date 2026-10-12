import { useRef, useState } from 'react';
import { Download, Loader2, PackageOpen, Upload } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { getTransport } from '@/services/transport';
import type { Project } from '@/services/transport/types';
import type { ProjectConfig } from '@/types/project';
import { errorMessage } from '@/lib/errors';

type Props = { isOpen: boolean; onOpenChange: (open: boolean) => void; projects: Project[] };
type PortableProject = Pick<Project, 'name' | 'tenant' | 'environment' | 'provider'> & { config?: ProjectConfig };
type Bundle = { schema: 'mdp.idp.workspace'; version: 1; exportedAt: string; runners: Array<{ id: string; name: string }>; projects: PortableProject[] };

const SECRET_KEY = /password|passphrase|token|secret|privatekey|credential|haspassword|hastoken|hassecret|hasprivatekey/i;
/**
 * Legacy runners are switched off: listing them throws in both transports.
 * A bundle without runner references is still a complete project export, so
 * that failure must not stop export or import.
 */
const listRunnersOrNone = () => getTransport().runners.list().catch(() => [] as Array<{ id: string; name: string }>);

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
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const exportBundle = async () => {
    setBusy(true); setResult(null);
    try {
      const runners = await listRunnersOrNone();
      const bundle: Bundle = {
        schema: 'mdp.idp.workspace', version: 1, exportedAt: new Date().toISOString(),
        runners: runners.map(({ id, name }) => ({ id, name })),
        projects: projects.map((project) => ({ name: project.name, tenant: project.tenant, environment: project.environment, provider: project.provider, config: stripSecrets(project.config) as ProjectConfig | undefined })),
      };
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `idp-workspace-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url);
      setResult({ ok: true, message: `${bundle.projects.length} proje dışa aktarıldı. Parola, token ve anahtar değerleri pakete alınmadı.` });
    } catch (cause) { setResult({ ok: false, message: `Dışa aktarılamadı: ${errorMessage(cause)}` }); }
    finally { setBusy(false); }
  };

  const importBundle = async (file: File) => {
    setBusy(true); setResult(null);
    try {
      const parsed = JSON.parse(await file.text()) as Partial<Bundle>;
      if (parsed.schema !== 'mdp.idp.workspace' || parsed.version !== 1 || !Array.isArray(parsed.projects) || !Array.isArray(parsed.runners)) throw new Error('Dosya bir IDP dışa aktarma paketi değil ya da bozuk.');
      const existingProjects = await getTransport().projects.list();
      const existingNames = new Set(existingProjects.map((project) => `${project.tenant}\0${project.name}`.toLowerCase()));
      const localRunners = await listRunnersOrNone();
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
      setResult({ ok: true, message: `${imported} proje içe aktarıldı; ${skipped} kayıt zaten vardı ya da geçersizdi. Parola ve token alanlarını proje ayarlarından yeniden girin.` });
    } catch (cause) { setResult({ ok: false, message: `İçe aktarılamadı: ${errorMessage(cause)}` }); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ''; }
  };

  return <Sheet open={isOpen} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="w-[min(760px,calc(100vw-3.5rem))] max-w-none overflow-y-auto border-l-line-strong bg-background p-0 sm:max-w-none">
      <div className="border-b border-line-strong bg-bar px-7 py-6">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3 text-xl"><PackageOpen className="h-5 w-5 text-primary" />İçe/dışa aktar</SheetTitle>
          <SheetDescription>Projeleri bir JSON paketiyle başka bir IDP sunucusuna ya da ekip arkadaşınıza taşıyın.</SheetDescription>
        </SheetHeader>
      </div>
      <div className="space-y-5 p-7">
        <div className="grid gap-4 sm:grid-cols-2">
          <button type="button" disabled={busy} onClick={() => void exportBundle()} className="group rounded-xl border border-line bg-surface p-5 text-left hover:border-primary/50 disabled:opacity-60">
            {busy ? <Loader2 className="mb-6 h-6 w-6 animate-spin text-primary" /> : <Download className="mb-6 h-6 w-6 text-primary" />}
            <p className="font-semibold">Dışa aktar</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">Bu sunucudaki projelerin ayarları tek bir dosyaya iner. Parola, token ve private key değerleri pakete girmez.</p>
          </button>
          <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="group rounded-xl border border-line bg-surface p-5 text-left hover:border-primary/50 disabled:opacity-60">
            <Upload className="mb-6 h-6 w-6 text-primary" />
            <p className="font-semibold">İçe aktar…</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">Paketteki projeler eklenir. Aynı tenant ve proje adına sahip kayıtlar atlanır, var olanlar değişmez.</p>
          </button>
        </div>
        <input ref={inputRef} type="file" accept="application/json,.json" className="hidden" aria-label="İçe aktarılacak paket" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importBundle(file); }} />
        {result && <div role="status" className={`rounded-lg border p-4 text-xs leading-5 ${result.ok ? 'border-line bg-accent/30 text-muted-foreground' : 'border-destructive/30 bg-destructive/10 text-destructive'}`}>{result.message}</div>}
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-4 text-xs leading-5 text-amber-200">
          <strong>Gizli değerler taşınmaz.</strong> İçe aktarılan projelerde parola, API token'ı, MFA secret'ı ve private key yeniden girilmelidir.
        </div>
      </div>
    </SheetContent>
  </Sheet>;
};
