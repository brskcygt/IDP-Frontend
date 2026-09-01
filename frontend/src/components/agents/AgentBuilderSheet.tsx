import { useState } from 'react';
import { Check, CheckCircle2, Copy, Download, Loader2, PackagePlus, ShieldCheck } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getTransport } from '@/services/transport';
import type { AgentBuildInput } from '@/services/transport/types';

type Props = { isOpen: boolean; onOpenChange: (open: boolean) => void };

const initialValue: AgentBuildInput = {
  agentId: '', serverUrl: '', gatewayToken: '', workingDirectory: '', logLevel: 'INFO',
};

const fields: Array<{ key: keyof AgentBuildInput; label: string; placeholder: string; hint: string }> = [
  { key: 'agentId', label: 'Agent kimliği', placeholder: 'WIN-PROD-01', hint: 'IDP içinde bu makineyi tanımlayan benzersiz ad.' },
  { key: 'serverUrl', label: 'IDP WebSocket adresi', placeholder: 'wss://idp.example.com', hint: 'Agent komutları ve durum mesajları için güvenli bağlantı.' },
  { key: 'gatewayToken', label: 'Gateway erişim tokenı', placeholder: 'Yerelde boş bırakılabilir', hint: 'Şirket sunucusunda backend ile aynı IDP_AGENT_API_TOKEN değeri.' },
  { key: 'workingDirectory', label: 'Repository dizini', placeholder: 'C:\\Apps\\PaymentApi', hint: 'Git repository’nin hedef sunucudaki tam dizini. Deployment komutu burada çalışır.' },
];

export const AgentBuilderSheet = ({ isOpen, onOpenChange }: Props) => {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ filePath: string; sha256: string; agentId: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const complete = fields.filter(({ key }) => key !== 'gatewayToken').every(({ key }) => String(value[key]).trim().length > 0);

  const build = async () => {
    setBusy(true); setError(null); setResult(null);
    try {
      const output = await getTransport().agentBuilder.build(value);
      if (!output.canceled && output.filePath && output.sha256) setResult({ filePath: output.filePath, sha256: output.sha256, agentId: value.agentId.trim() });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Agent kurulum paketi oluşturulamadı.'); }
    finally { setBusy(false); }
  };

  return <Sheet open={isOpen} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="w-[min(920px,calc(100vw-3.5rem))] max-w-none overflow-y-auto border-l-line-strong bg-background p-0 sm:max-w-none">
      <div className="border-b border-line-strong bg-bar px-7 py-6">
        <SheetHeader><SheetTitle className="flex items-center gap-3 text-xl"><PackagePlus className="h-5 w-5 text-primary" />IDP Agent oluştur</SheetTitle><SheetDescription>Hedef makineye özel agent kurulum ZIP’ini üretin ve bilgisayarınıza kaydedin.</SheetDescription></SheetHeader>
      </div>
      <div className="grid gap-6 p-7 lg:grid-cols-[1fr_280px]">
        <section className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
          {fields.map((field) => <div key={field.key} className={field.key === 'workingDirectory' ? 'sm:col-span-2' : ''}>
            <Label htmlFor={`agent-${field.key}`} className="text-xs font-semibold">{field.label}</Label>
            <Input id={`agent-${field.key}`} value={String(value[field.key])} onChange={(event) => setValue((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.placeholder} className="mt-2 font-mono text-xs" />
            <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">{field.hint}</p>
          </div>)}
        </section>
        <aside className="space-y-4">
          <div className="rounded-lg border border-primary/25 bg-primary/[0.035] p-4">
            <div className="flex items-center gap-2 text-primary"><ShieldCheck className="h-4 w-4" /><p className="text-xs font-semibold uppercase tracking-[0.14em]">Tek ZIP çıktısı</p></div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">ZIP içinde agent JAR’ı ve tek seferlik Windows kurulum betiği birlikte bulunur.</p>
            <button type="button" disabled={!complete || busy} onClick={() => void build()} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-40">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{busy ? 'Paket hazırlanıyor…' : 'ZIP oluştur ve kaydet'}
            </button>
          </div>
          <div className="rounded-lg border border-line bg-surface p-4 text-[11px] leading-relaxed text-muted-foreground"><p className="font-semibold text-foreground">Yerel gereksinimler</p><p className="mt-2">JDK 17+ ve Maven 3.9+ kurulu olmalıdır. Token ZIP içindeki JAR’a gömüldüğü için paketi gizli dosya olarak koruyun.</p></div>
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
                <code className="block break-all font-mono text-[9px] leading-relaxed text-zinc-300">{`powershell -ExecutionPolicy Bypass -File ".\\install-idp-agent-${result.agentId}.ps1"`}</code>
                <button type="button" className="absolute right-2 top-2 text-zinc-500 hover:text-zinc-200" aria-label="Kurulum komutunu kopyala" onClick={() => void navigator.clipboard.writeText(`powershell -ExecutionPolicy Bypass -File ".\\install-idp-agent-${result.agentId}.ps1"`).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); })}>
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <dl className="mt-3 space-y-1 font-mono text-[9px] text-dim">
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
