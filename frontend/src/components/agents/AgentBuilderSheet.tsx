import { useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, Copy, Download, Loader2, PackagePlus, ShieldCheck } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getTransport } from '@/services/transport';
import type { AgentBuildInput } from '@/services/transport/types';

type Props = { isOpen: boolean; onOpenChange: (open: boolean) => void };
type FormValue = Required<AgentBuildInput>;
type FieldKey = 'agentId' | 'proxy' | 'workingDirectory';
/** Building for an ID that already has credentials rotates them — ask first. */
type RotationPrompt = { agentId: string; reason: 'exists' | 'unknown'; detail?: string };

const initialValue: FormValue = { agentId: '', proxy: '', workingDirectory: '', logLevel: 'INFO' };

const fields: Array<{ key: FieldKey; label: string; placeholder: string; hint: string; optional?: boolean }> = [
  { key: 'agentId', label: 'Agent kimliği', placeholder: 'WIN-PROD-01', hint: 'IDP içinde bu makineyi tanımlayan benzersiz ad. Bu ID’ye özel gizli anahtar IDP sunucusunda üretilir.' },
  { key: 'proxy', label: 'HTTP proxy (opsiyonel)', placeholder: 'proxy.sirket.local:8080', hint: 'Hedef makine dışarıya proxy üzerinden çıkıyorsa host:port. Gerekmiyorsa boş bırakın.', optional: true },
  { key: 'workingDirectory', label: 'Repository dizini', placeholder: 'C:\\Apps\\PaymentApi', hint: 'Git repository’nin hedef sunucudaki tam dizini. Deployment komutu burada çalışır.' },
];

export const AgentBuilderSheet = ({ isOpen, onOpenChange }: Props) => {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rotation, setRotation] = useState<RotationPrompt | null>(null);
  const [result, setResult] = useState<{ filePath: string; sha256: string; agentId: string; gatewayUrl: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const complete = fields.filter((field) => !field.optional).every(({ key }) => value[key].trim().length > 0);

  const build = async (agentId: string) => {
    setBusy(true); setError(null); setResult(null); setRotation(null);
    try {
      const output = await getTransport().agentBuilder.build({ ...value, agentId, proxy: value.proxy.trim() });
      if (!output.canceled && output.filePath && output.sha256) setResult({ filePath: output.filePath, sha256: output.sha256, agentId, gatewayUrl: output.gatewayUrl ?? null });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Agent kurulum paketi oluşturulamadı.'); }
    finally { setBusy(false); }
  };

  const requestBuild = async () => {
    const agentId = value.agentId.trim();
    setBusy(true); setError(null); setResult(null); setRotation(null);
    let prompt: RotationPrompt | null = null;
    try {
      const agents = await getTransport().agents.list();
      if (agents.some((agent) => agent.id.toLowerCase() === agentId.toLowerCase())) prompt = { agentId, reason: 'exists' };
    } catch (cause) {
      prompt = { agentId, reason: 'unknown', detail: cause instanceof Error ? cause.message : undefined };
    }
    if (prompt) { setRotation(prompt); setBusy(false); return; }
    await build(agentId);
  };

  const installCommand = result ? `powershell -ExecutionPolicy Bypass -File ".\\install-idp-agent-${result.agentId}.ps1"` : '';

  return <Sheet open={isOpen} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="w-[min(920px,calc(100vw-3.5rem))] max-w-none overflow-y-auto border-l-line-strong bg-background p-0 sm:max-w-none">
      <div className="border-b border-line-strong bg-bar px-7 py-6">
        <SheetHeader><SheetTitle className="flex items-center gap-3 text-xl"><PackagePlus className="h-5 w-5 text-primary" />IDP Agent oluştur</SheetTitle><SheetDescription>Hedef makineye özel agent kurulum ZIP’ini üretin ve bilgisayarınıza kaydedin.</SheetDescription></SheetHeader>
      </div>
      <div className="grid gap-6 p-7 lg:grid-cols-[1fr_280px]">
        <section className="grid content-start gap-x-4 gap-y-5 sm:grid-cols-2">
          {fields.map((field) => <div key={field.key} className={field.key === 'workingDirectory' ? 'sm:col-span-2' : ''}>
            <Label htmlFor={`agent-${field.key}`} className="text-xs font-semibold">{field.label}</Label>
            <Input id={`agent-${field.key}`} value={value[field.key]} onChange={(event) => { const next = event.target.value; setValue((current) => ({ ...current, [field.key]: next })); if (field.key === 'agentId') setRotation(null); }} placeholder={field.placeholder} className="mt-2 font-mono text-xs" />
            <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">{field.hint}</p>
          </div>)}
        </section>
        <aside className="space-y-4">
          <div className="rounded-lg border border-primary/25 bg-primary/[0.035] p-4">
            <div className="flex items-center gap-2 text-primary"><ShieldCheck className="h-4 w-4" /><p className="text-xs font-semibold uppercase tracking-[0.14em]">Tek ZIP çıktısı</p></div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">ZIP içinde agent JAR’ı ve tek seferlik Windows kurulum betiği birlikte bulunur. Gateway adresi ve agent’a özel kimlik IDP sunucusundan alınır.</p>
            <button type="button" disabled={!complete || busy || rotation !== null} onClick={() => void requestBuild()} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-40">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{busy ? 'Paket hazırlanıyor…' : 'ZIP oluştur ve kaydet'}
            </button>
          </div>
          {rotation && <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="flex items-center gap-2 text-xs font-semibold text-amber-500"><AlertTriangle className="h-4 w-4" />Yeni kimlik üretilecek</p>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              {rotation.reason === 'exists'
                ? <>Bu ID için yeni kimlik üretilecek; eski kurulum bağlantısını kaybeder. <span className="font-mono text-foreground">{rotation.agentId}</span> için daha önce üretilen ZIP’ler de artık çalışmaz.</>
                : <>Agent listesi alınamadı{rotation.detail ? ` (${rotation.detail})` : ''}. Bu ID zaten kullanılıyorsa yeni kimlik üretilecek; eski kurulum bağlantısını kaybeder.</>}
            </p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => void build(rotation.agentId)} className="inline-flex h-9 flex-1 items-center justify-center rounded-md bg-amber-500 px-3 text-xs font-semibold text-zinc-950 hover:bg-amber-400">Yeni kimlik üret</button>
              <button type="button" onClick={() => setRotation(null)} className="inline-flex h-9 items-center justify-center rounded-md border border-line-strong px-3 text-xs text-muted-foreground hover:text-foreground">Vazgeç</button>
            </div>
          </div>}
          <div className="rounded-lg border border-line bg-surface p-4 text-[11px] leading-relaxed text-muted-foreground"><p className="font-semibold text-foreground">Gereksinimler</p><p className="mt-2">Bu bilgisayarda JDK 17+ ve Maven 3.9+, hedef makinede Java 17+ kurulu olmalıdır. Agent’a özel gizli anahtar ZIP içindeki JAR’a gömüldüğü için paketi gizli dosya olarak koruyun; aynı ID ile yeniden üretmek önceki paketi geçersiz kılar.</p></div>
          {result && <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-4">
            <p className="flex items-center gap-2 text-xs font-semibold text-emerald-500"><CheckCircle2 className="h-4 w-4" />ZIP paketi hazır</p>
            <p className="mt-2 break-all font-mono text-[10px] text-primary">{result.filePath}</p>
            <div className="mt-4 border-t border-emerald-500/15 pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground">Windows’ta kurulum</p>
              <ol className="mt-2 space-y-2 text-[10px] leading-relaxed text-muted-foreground">
                <li><span className="mr-1.5 font-mono text-primary">01</span> ZIP’i hedef makinede bir klasöre çıkarın.</li>
                <li><span className="mr-1.5 font-mono text-primary">02</span> Bu klasörde Yönetici PowerShell açın.</li>
                <li><span className="mr-1.5 font-mono text-primary">03</span> Aşağıdaki komutu yalnızca bir kez çalıştırın.</li>
              </ol>
              <div className="relative mt-3 rounded-md border border-line bg-zinc-950 p-3 pr-9">
                <code className="block break-all font-mono text-[9px] leading-relaxed text-zinc-300">{installCommand}</code>
                <button type="button" className="absolute right-2 top-2 text-zinc-500 hover:text-zinc-200" aria-label="Kurulum komutunu kopyala" onClick={() => void navigator.clipboard.writeText(installCommand).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); })}>
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <dl className="mt-3 space-y-1 font-mono text-[9px] text-dim">
                {result.gatewayUrl && <div><dt className="inline text-muted-foreground">Gateway: </dt><dd className="inline break-all">{result.gatewayUrl}</dd></div>}
                <div><dt className="inline text-muted-foreground">Görev: </dt><dd className="inline">IDP-Agent-{result.agentId}</dd></div>
                <div><dt className="inline text-muted-foreground">Log: </dt><dd className="inline break-all">C:\ProgramData\IDP\Agent\{result.agentId}\agent.log</dd></div>
              </dl>
            </div>
            <p className="mt-3 break-all font-mono text-[9px] text-dim">SHA-256 {result.sha256}</p>
          </div>}
          {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">{error}</p>}
        </aside>
      </div>
    </SheetContent>
  </Sheet>;
};
