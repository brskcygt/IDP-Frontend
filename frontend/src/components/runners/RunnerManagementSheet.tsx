import { useEffect, useState } from 'react';
import { CheckCircle2, Copy, HardDriveDownload, RefreshCw, ServerCog, ShieldCheck } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { getTransport } from '@/services/transport';
import type { RunnerAgent, RunnerRelease, RunnerReleaseHistory, RunnerReleaseUploadToken } from '@/services/transport/types';

type Props = { isOpen: boolean; onOpenChange: (open: boolean) => void };

export const RunnerManagementSheet = ({ isOpen, onOpenChange }: Props) => {
  const [agents, setAgents] = useState<RunnerAgent[]>([]);
  const [release, setRelease] = useState<RunnerRelease | null>(null);
  const [releases, setReleases] = useState<RunnerReleaseHistory[]>([]);
  const [agentName, setAgentName] = useState('');
  const [approvalCode, setApprovalCode] = useState('');
  const [prepared, setPrepared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [releaseUpload, setReleaseUpload] = useState<RunnerReleaseUploadToken | null>(null);

  const load = async () => {
    setBusy(true); setError(null);
    try {
      const [nextAgents, nextRelease, history] = await Promise.all([
        getTransport().runners.list(), getTransport().runners.getRelease(), getTransport().runners.listReleases(),
      ]);
      setAgents(nextAgents); setRelease(nextRelease); setReleases(history);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Runner workspace yüklenemedi.'); }
    finally { setBusy(false); }
  };

  useEffect(() => { if (isOpen) void load(); }, [isOpen]);
  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  const validName = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(agentName.trim());
  const installCommand = prepared && release ? [
    '$B="https://idp-runner-api.bariskoc-249.workers.dev/v1/releases/current"; $D=Join-Path $env:TEMP "mdp-runner-setup"; New-Item -ItemType Directory -Path $D -Force|Out-Null',
    'Invoke-WebRequest "$B/root.cer" -OutFile "$D/root.cer" -UseBasicParsing; Invoke-WebRequest "$B/publisher.cer" -OutFile "$D/publisher.cer" -UseBasicParsing',
    `$R=New-Object Security.Cryptography.X509Certificates.X509Certificate2("$D/root.cer"); if($R.Thumbprint-ne"${release.rootThumbprint}"){throw "Root certificate mismatch"}`,
    String.raw`Import-Certificate -FilePath "$D/root.cer" -CertStoreLocation Cert:\LocalMachine\Root|Out-Null; Import-Certificate -FilePath "$D/publisher.cer" -CertStoreLocation Cert:\LocalMachine\TrustedPublisher|Out-Null`,
    'Invoke-WebRequest "$B/installer" -OutFile "$D/setup.exe" -UseBasicParsing',
    `if((Get-FileHash "$D/setup.exe" -Algorithm SHA256).Hash-ne"${release.installerSha256}"){throw "Installer hash mismatch"}`,
    `$S=Get-AuthenticodeSignature "$D/setup.exe"; if($S.Status-ne"Valid"-or$S.SignerCertificate.Thumbprint-ne"${release.publisherThumbprint}"){throw "Installer signature mismatch"}`,
    `& "$D/setup.exe" --agent-name "${agentName.trim()}"`,
  ].join('\n') : '';

  const approve = async () => {
    setBusy(true); setError(null);
    try { await getTransport().runners.approveBootstrap(approvalCode.trim().toUpperCase()); setApprovalCode(''); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Cihaz kodu onaylanamadı.'); }
    finally { setBusy(false); }
  };

  const createReleaseUpload = async () => {
    setBusy(true); setError(null);
    try { setReleaseUpload(await getTransport().runners.createReleaseUploadToken()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Release upload tokenı oluşturulamadı.'); }
    finally { setBusy(false); }
  };

  const publishCommand = releaseUpload ? [
    '$T="C:\\Windows\\Temp\\Build-And-Publish-IDPRunner.ps1"; Invoke-WebRequest "https://idp-runner-api.bariskoc-249.workers.dev/downloads/release/Build-And-Publish-IDPRunner.ps1" -OutFile $T -UseBasicParsing',
    'if((Get-FileHash $T -Algorithm SHA256).Hash-ne"EEC15B299EE074821FFC153CB5F8D566AF43259F256F480D714843A0557349A4"){throw "Build & Publish tool hash mismatch"}',
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -File $T',
  ].join('\n') : '';

  const copyUpgrade = async () => {
    if (!release) return;
    const command = [
      '$B="https://idp-runner-api.bariskoc-249.workers.dev/v1/releases/current"; $D=Join-Path $env:TEMP "mdp-runner-upgrade"; New-Item -ItemType Directory -Path $D -Force|Out-Null',
      'Invoke-WebRequest "$B/installer" -OutFile "$D/setup.exe" -UseBasicParsing',
      `if((Get-FileHash "$D/setup.exe" -Algorithm SHA256).Hash-ne"${release.installerSha256}"){throw "Installer hash mismatch"}`,
      `$S=Get-AuthenticodeSignature "$D/setup.exe"; if($S.Status-ne"Valid"-or$S.SignerCertificate.Thumbprint-ne"${release.publisherThumbprint}"){throw "Installer signature mismatch"}`,
      '& "$D/setup.exe" --upgrade',
    ].join('\n');
    await navigator.clipboard.writeText(command); setCopied(true); window.setTimeout(() => setCopied(false), 1500);
  };

  const retire = async (id: string) => {
    setBusy(true); setError(null);
    try { await getTransport().runners.retire(id); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Runner emekliye ayrılamadı.'); }
    finally { setBusy(false); }
  };

  const activate = async (id: string) => {
    setBusy(true); setError(null);
    try { await getTransport().runners.activateRelease(id); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Release aktifleştirilemedi.'); }
    finally { setBusy(false); }
  };

  return <Sheet open={isOpen} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="w-[min(1180px,calc(100vw-3.5rem))] max-w-none overflow-y-auto border-l-line-strong bg-background p-0 sm:max-w-none">
      <div className="border-b border-line-strong bg-bar px-7 py-6">
        <SheetHeader><SheetTitle className="flex items-center gap-3 text-xl"><ServerCog className="h-5 w-5 text-primary" />Runner workspace</SheetTitle><SheetDescription>Windows agent filosu, enrollment ve release operasyonları tek merkezde.</SheetDescription></SheetHeader>
      </div>
      <div className="grid gap-5 p-7 lg:grid-cols-[1.45fr_0.9fr]">
        <section className="space-y-3">
          <div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Agent fleet</p><p className="mt-1 text-sm text-dim">{agents.length} etkin runner</p></div><button onClick={() => void load()} className="rounded-md border border-line-strong p-2 text-dim hover:text-foreground"><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /></button></div>
          <div className="space-y-2">{agents.map((agent) => <article key={agent.id} className="rounded-lg border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${agent.health === 'online' ? 'bg-emerald-500' : agent.health === 'degraded' ? 'bg-amber-500' : 'bg-red-500'}`} /><h3 className="font-semibold">{agent.name}</h3><span className="font-mono text-[10px] uppercase text-dim">{agent.health}</span></div><p className="mt-2 font-mono text-[10px] text-muted-foreground">{agent.id}</p></div><button disabled={busy} onClick={() => void retire(agent.id)} className="text-[10px] font-semibold text-amber-500 hover:underline">Emekliye ayır</button></div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground"><span>v{agent.version ?? '—'}</span><span>release {agent.installedReleaseId ?? 'bilinmiyor'}</span><span>son görülme {agent.secondsSinceSeen ?? '—'} sn</span>{agent.currentJob && <span className="text-primary">job {agent.currentJob.status}</span>}{agent.updateAvailable && <button onClick={() => void copyUpgrade()} className="ml-auto font-semibold text-primary hover:underline">Upgrade komutunu kopyala</button>}</div>
          </article>)}</div>
        </section>
        <div className="space-y-5">
          <section className="rounded-lg border border-primary/25 bg-primary/[0.035] p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Yeni agent</p><div className="mt-3 space-y-3"><Input value={agentName} onChange={(e) => { setAgentName(e.target.value); setPrepared(false); }} placeholder="WINDOWS-SERVER-01" className="font-mono" />{!prepared ? <button disabled={!validName || !release} onClick={() => setPrepared(true)} className="h-9 rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-40">Kurulumu hazırla</button> : <><div className="relative rounded-md bg-zinc-950 p-3"><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-[9px] text-zinc-300">{installCommand}</pre><button onClick={() => void navigator.clipboard.writeText(installCommand).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); })} className="absolute right-2 top-2 text-zinc-400">{copied ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}</button></div><div className="flex gap-2"><Input value={approvalCode} onChange={(e) => setApprovalCode(e.target.value.toUpperCase())} maxLength={8} placeholder="ONAY KODU" className="font-mono tracking-widest" /><button disabled={!/^[A-Z2-9]{8}$/.test(approvalCode) || busy} onClick={() => void approve()} className="rounded-md bg-foreground px-3 text-xs font-semibold text-background disabled:opacity-40">Onayla</button></div></>}</div></section>
          <section className="rounded-lg border border-line bg-surface p-4"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-500" /><p className="text-xs font-semibold uppercase tracking-[0.14em]">Release channel</p></div><p className="mt-2 font-mono text-xs text-foreground">{release?.releaseId ?? 'Aktif release yok'}</p><div className="mt-3 space-y-1.5">{releases.slice(0, 6).map((item) => <div key={item.releaseId} className="flex items-center gap-2 border-t border-line pt-2 text-[10px]"><HardDriveDownload className="h-3 w-3 text-dim" /><code className="flex-1">{item.releaseId}</code>{item.active ? <span className="text-emerald-500">aktif</span> : <button onClick={() => void activate(item.releaseId)} className="text-primary hover:underline">Aktifleştir / rollback</button>}</div>)}</div><div className="mt-4 border-t border-line pt-3">{!releaseUpload ? <button disabled={busy} onClick={() => void createReleaseUpload()} className="text-xs font-semibold text-primary hover:underline">Build & Publish başlat</button> : <div className="space-y-2"><div className="flex gap-2 rounded bg-background p-2"><code className="min-w-0 flex-1 truncate text-[9px]">{releaseUpload.uploadToken}</code><button onClick={() => void navigator.clipboard.writeText(releaseUpload.uploadToken)}><Copy className="h-3 w-3" /></button></div><div className="relative rounded bg-zinc-950 p-3"><pre className="max-h-28 overflow-auto whitespace-pre-wrap break-all text-[9px] text-zinc-300">{publishCommand}</pre><button onClick={() => void navigator.clipboard.writeText(publishCommand)} className="absolute right-2 top-2"><Copy className="h-3 w-3 text-zinc-400" /></button></div></div>}</div></section>
          {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">{error}</p>}
        </div>
      </div>
    </SheetContent>
  </Sheet>;
};
