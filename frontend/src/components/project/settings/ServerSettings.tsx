import { useEffect, useRef, useState } from "react";
import { Monitor, Server, User, KeyRound, RefreshCw, Plus, Copy, CheckCircle2, Terminal, Archive } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SettingsField } from "@/components/project/settings/SettingsField";
import { SecretHint, SAVED_SECRET_PLACEHOLDER } from "@/components/project/settings/SecretHint";
import { PmpAuthFields } from "@/components/project/settings/PmpAuthFields";
import { ScriptEditor } from "@/components/project/settings/ScriptEditor";
import { HostKeyPolicyField } from "@/components/project/settings/HostKeyPolicyField";
import { TelemetryToggleField } from "@/components/project/settings/TelemetryToggleField";
import type { ProjectConfig } from "@/types/project";
import type { IdpAgent, RunnerAgent, RunnerRelease, RunnerReleaseHistory, RunnerReleaseUploadToken } from "@/services/transport/types";
import { getTransport } from "@/services/transport";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface ServerSettingsProps {
  config: ProjectConfig;
  onChange: (nextConfig: ProjectConfig) => void;
  /** The project's provider, used to pick the default target OS (WinRM defaults to Windows). */
  provider: string;
}

/** Settings for the Server/SSH/WinRM provider: OS, host, auth, and deploy script. */
export const ServerSettings = ({ config, onChange, provider }: ServerSettingsProps) => {
  const { toast } = useToast();
  const previousHealth = useRef<Record<string, RunnerAgent['health']>>({});
  const isWindows = (config.targetOS || (provider === 'WinRM' ? 'windows' : 'linux')) === 'windows';
  // Legacy Cloudflare runner UI remains below but can no longer be activated.
  const usesRunner = false;
  const usesAgent = isWindows && config.windowsTransport === 'idp-agent';
  const [companyAgents, setCompanyAgents] = useState<IdpAgent[]>([]);
  const [companyAgentsLoading, setCompanyAgentsLoading] = useState(false);
  const [companyAgentsError, setCompanyAgentsError] = useState<string | null>(null);
  const [agents, setAgents] = useState<RunnerAgent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [installReady, setInstallReady] = useState(false);
  const [approvalCode, setApprovalCode] = useState('');
  const [enrollmentBusy, setEnrollmentBusy] = useState(false);
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'token' | 'command' | 'publish' | 'uninstall' | 'upgrade' | null>(null);
  const [retireConfirm, setRetireConfirm] = useState(false);
  const [retireBusy, setRetireBusy] = useState(false);
  const [retireError, setRetireError] = useState<string | null>(null);
  const [release, setRelease] = useState<RunnerRelease | null>(null);
  const [releaseUpload, setReleaseUpload] = useState<RunnerReleaseUploadToken | null>(null);
  const [releases, setReleases] = useState<RunnerReleaseHistory[]>([]);

  const loadAgents = async () => {
    setAgentsLoading(true);
    setAgentsError(null);
    try {
      const [latestAgents, latestRelease, releaseHistory] = await Promise.all([getTransport().runners.list(), getTransport().runners.getRelease(), getTransport().runners.listReleases()]);
      setAgents(latestAgents);
      for (const agent of latestAgents) {
        if (previousHealth.current[agent.id] && previousHealth.current[agent.id] !== 'offline' && agent.health === 'offline') {
          toast({ title: 'Runner çevrimdışı', description: `${agent.name} üç dakikadır IDP ile iletişim kurmuyor.`, variant: 'destructive' });
        }
        previousHealth.current[agent.id] = agent.health;
      }
      setRelease(latestRelease);
      setReleases(releaseHistory);
    } catch (error) {
      setAgentsError(error instanceof Error ? error.message : 'Runner listesi alınamadı.');
    } finally {
      setAgentsLoading(false);
    }
  };

  useEffect(() => {
    if (!usesRunner) return;
    void loadAgents();
    const timer = window.setInterval(() => void loadAgents(), 15000);
    return () => window.clearInterval(timer);
  }, [usesRunner]);

  const loadCompanyAgents = async () => {
    setCompanyAgentsLoading(true);
    setCompanyAgentsError(null);
    try { setCompanyAgents(await getTransport().agents.list()); }
    catch (error) { setCompanyAgentsError(error instanceof Error ? error.message : 'Agent listesi alınamadı.'); }
    finally { setCompanyAgentsLoading(false); }
  };

  useEffect(() => {
    if (!usesAgent) return;
    void loadCompanyAgents();
  }, [usesAgent]);

  useEffect(() => {
    if (!installReady) return;
    const timer = window.setInterval(async () => {
      try {
        const latest = await getTransport().runners.list();
        setAgents(latest);
        const enrolled = latest.find((agent) => agent.name.toLowerCase() === newAgentName.trim().toLowerCase());
        if (enrolled) {
          onChange({ ...config, runnerAgentId: enrolled.id });
          setInstallReady(false);
          setWizardOpen(false);
        }
      } catch {
        // The normal runner-list status area already surfaces persistent errors.
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [installReady, newAgentName, config, onChange]);

  const createEnrollment = async () => {
    if (!release) { setEnrollmentError('Önce imzalı runner installer release’ini yayınlayın.'); return; }
    const name = newAgentName.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(name)) {
      setEnrollmentError('3-64 karakter kullanın: harf, rakam, nokta, alt çizgi veya tire.');
      return;
    }
    setEnrollmentBusy(true);
    setEnrollmentError(null);
    try {
      setInstallReady(true);
    } catch (error) {
      setEnrollmentError(error instanceof Error ? error.message : 'Kurulum hazırlanamadı.');
    } finally {
      setEnrollmentBusy(false);
    }
  };

  const approveBootstrap = async () => {
    setEnrollmentBusy(true); setEnrollmentError(null);
    try { await getTransport().runners.approveBootstrap(approvalCode.trim().toUpperCase()); }
    catch (error) { setEnrollmentError(error instanceof Error ? error.message : 'Cihaz kodu onaylanamadı.'); }
    finally { setEnrollmentBusy(false); }
  };

  const createReleaseUpload = async () => {
    setEnrollmentBusy(true); setEnrollmentError(null);
    try { setReleaseUpload(await getTransport().runners.createReleaseUploadToken()); }
    catch (error) { setEnrollmentError(error instanceof Error ? error.message : 'Yayınlama tokenı oluşturulamadı.'); }
    finally { setEnrollmentBusy(false); }
  };

  const activateRelease = async (releaseId: string) => {
    setEnrollmentBusy(true); setEnrollmentError(null);
    try { await getTransport().runners.activateRelease(releaseId); await loadAgents(); }
    catch (error) { setEnrollmentError(error instanceof Error ? error.message : 'Release etkinleştirilemedi.'); }
    finally { setEnrollmentBusy(false); }
  };

  const copyText = async (kind: 'token' | 'command' | 'publish' | 'uninstall' | 'upgrade', value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1800);
  };

  const retireSelectedAgent = async () => {
    if (!config.runnerAgentId) return;
    setRetireBusy(true);
    setRetireError(null);
    try {
      await getTransport().runners.retire(config.runnerAgentId);
      onChange({ ...config, runnerAgentId: undefined });
      setRetireConfirm(false);
      await loadAgents();
    } catch (error) {
      setRetireError(error instanceof Error ? error.message : 'Runner kaydı emekliye ayrılamadı.');
    } finally {
      setRetireBusy(false);
    }
  };

  const installCommand = installReady && release ? [
    '$B="https://idp-runner-api.bariskoc-249.workers.dev/v1/releases/current"; $D=Join-Path $env:TEMP "mdp-runner-setup"; New-Item -ItemType Directory -Path $D -Force|Out-Null',
    'Invoke-WebRequest "$B/root.cer" -OutFile "$D/root.cer" -UseBasicParsing; Invoke-WebRequest "$B/publisher.cer" -OutFile "$D/publisher.cer" -UseBasicParsing',
    `$R=New-Object Security.Cryptography.X509Certificates.X509Certificate2("$D/root.cer"); if($R.Thumbprint-ne"${release.rootThumbprint}"){throw "Root certificate mismatch"}`,
    String.raw`Import-Certificate -FilePath "$D/root.cer" -CertStoreLocation Cert:\LocalMachine\Root|Out-Null; Import-Certificate -FilePath "$D/publisher.cer" -CertStoreLocation Cert:\LocalMachine\TrustedPublisher|Out-Null`,
    'Invoke-WebRequest "$B/installer" -OutFile "$D/setup.exe" -UseBasicParsing',
    `if((Get-FileHash "$D/setup.exe" -Algorithm SHA256).Hash-ne"${release.installerSha256}"){throw "Installer hash mismatch"}`,
    `$S=Get-AuthenticodeSignature "$D/setup.exe"; if($S.Status-ne"Valid"-or$S.SignerCertificate.Thumbprint-ne"${release.publisherThumbprint}"){throw "Installer signature mismatch"}`,
    `& "$D/setup.exe" --agent-name "${newAgentName.trim()}"`,
  ].join('\n') : '';
  const publishCommand = releaseUpload ? [
    '$T=Join-Path $env:TEMP "Build-And-Publish-IDPRunner.ps1"; Invoke-WebRequest "https://idp-runner-api.bariskoc-249.workers.dev/downloads/release/Build-And-Publish-IDPRunner.ps1" -OutFile $T -UseBasicParsing',
    'if((Get-FileHash $T -Algorithm SHA256).Hash-ne"EEC15B299EE074821FFC153CB5F8D566AF43259F256F480D714843A0557349A4"){throw "Build & Publish tool hash mismatch"}',
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -File $T',
  ].join('\n') : '';
  const uninstallCommand = release ? [
    '$B="https://idp-runner-api.bariskoc-249.workers.dev/v1/releases/current"; $D=Join-Path $env:TEMP "mdp-runner-remove"; New-Item -ItemType Directory -Path $D -Force|Out-Null',
    'Invoke-WebRequest "$B/root.cer" -OutFile "$D/root.cer" -UseBasicParsing; Invoke-WebRequest "$B/publisher.cer" -OutFile "$D/publisher.cer" -UseBasicParsing; Invoke-WebRequest "$B/installer" -OutFile "$D/setup.exe" -UseBasicParsing',
    `$R=New-Object Security.Cryptography.X509Certificates.X509Certificate2("$D/root.cer"); if($R.Thumbprint-ne"${release.rootThumbprint}"){throw "Root certificate mismatch"}`,
    `if((Get-FileHash "$D/setup.exe" -Algorithm SHA256).Hash-ne"${release.installerSha256}"){throw "Installer hash mismatch"}`,
    String.raw`Import-Certificate -FilePath "$D/root.cer" -CertStoreLocation Cert:\LocalMachine\Root|Out-Null; Import-Certificate -FilePath "$D/publisher.cer" -CertStoreLocation Cert:\LocalMachine\TrustedPublisher|Out-Null`,
    `$S=Get-AuthenticodeSignature "$D/setup.exe"; if($S.Status-ne"Valid"-or$S.SignerCertificate.Thumbprint-ne"${release.publisherThumbprint}"){throw "Installer signature mismatch"}`,
    '& "$D/setup.exe" --uninstall',
  ].join('\n') : '';
  const upgradeCommand = release ? [
    '$B="https://idp-runner-api.bariskoc-249.workers.dev/v1/releases/current"; $D=Join-Path $env:TEMP "mdp-runner-upgrade"; New-Item -ItemType Directory -Path $D -Force|Out-Null',
    'Invoke-WebRequest "$B/installer" -OutFile "$D/setup.exe" -UseBasicParsing',
    `if((Get-FileHash "$D/setup.exe" -Algorithm SHA256).Hash-ne"${release.installerSha256}"){throw "Installer hash mismatch"}`,
    `$S=Get-AuthenticodeSignature "$D/setup.exe"; if($S.Status-ne"Valid"-or$S.SignerCertificate.Thumbprint-ne"${release.publisherThumbprint}"){throw "Installer signature mismatch"}`,
    '& "$D/setup.exe" --upgrade',
  ].join('\n') : '';

  return (
    <>
      <div className="flex items-center gap-4 bg-accent/30 p-1 rounded-md border border-border/50">
        <button
          onClick={() => onChange({ ...config, targetOS: 'windows', port: '5985' })}
          className={`flex-1 py-1.5 text-xs font-medium rounded-sm transition-colors ${
            isWindows
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
          }`}
        >
          🪟 Windows (WinRM)
        </button>
        <button
          onClick={() => onChange({ ...config, targetOS: 'linux', port: '22' })}
          className={`flex-1 py-1.5 text-xs font-medium rounded-sm transition-colors ${
            !isWindows
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
          }`}
        >
          🐧 Linux (SSH)
        </button>
      </div>

      {isWindows && (
        <SettingsField icon={<Monitor className="h-3.5 w-3.5" />} label="Windows bağlantısı">
          <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={usesAgent}
              onChange={(e) => onChange({ ...config, windowsTransport: e.target.checked ? 'idp-agent' : 'winrm' })}
              className="mt-0.5 rounded border-border bg-accent/50 text-primary focus:ring-primary/20"
            />
            <span>Şirket agent altyapısını kullan</span>
          </label>
        </SettingsField>
      )}

      {usesAgent && (
        <>
          <SettingsField icon={<Server className="h-3.5 w-3.5" />} label="Agent">
            <div className="space-y-2">
              <div className="flex gap-2">
                <Select value={config.agentId || undefined} onValueChange={(agentId) => onChange({ ...config, agentId })}>
                  <SelectTrigger className="bg-accent/50 border-border/50">
                    <SelectValue placeholder={companyAgentsLoading ? 'Agentlar yükleniyor…' : 'Bir agent seçin'} />
                  </SelectTrigger>
                  <SelectContent>
                    {companyAgents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id} disabled={!agent.online}>
                        <span className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${agent.online ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.65)]' : 'bg-muted-foreground/45'}`} />
                          <span>{agent.id}</span>
                          <span className={`text-[10px] ${agent.online ? 'text-emerald-500' : 'text-muted-foreground'}`}>{agent.online ? 'çevrimiçi' : 'çevrimdışı'}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button type="button" onClick={() => void loadCompanyAgents()} disabled={companyAgentsLoading}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-border/60 bg-accent/40 text-muted-foreground hover:bg-accent disabled:opacity-50"
                  aria-label="Agent listesini yenile">
                  <RefreshCw className={`h-3.5 w-3.5 ${companyAgentsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
              {companyAgentsError && <p className="text-[10px] text-destructive">{companyAgentsError}</p>}
            </div>
          </SettingsField>
          <SettingsField icon={<Monitor className="h-3.5 w-3.5" />} label="Komut zaman aşımı (saniye)">
            <Input type="number" min={1} max={3600} value={config.agentCommandTimeoutSeconds || 180}
              onChange={(e) => onChange({ ...config, agentCommandTimeoutSeconds: Number(e.target.value) })}
              className="bg-accent/50 border-border/50" />
          </SettingsField>
        </>
      )}

      {usesRunner && (
        <>
          <SettingsField icon={<Server className="h-3.5 w-3.5" />} label="Runner Agent ID">
            <div className="space-y-2">
              <div className="flex gap-2">
                <Select
                  value={config.runnerAgentId || undefined}
                  onValueChange={(runnerAgentId) => onChange({ ...config, runnerAgentId })}
                  disabled={agentsLoading && agents.length === 0}
                >
                  <SelectTrigger className="bg-accent/50 border-border/50">
                    <SelectValue placeholder={agentsLoading ? 'Runnerlar yükleniyor…' : 'Bir Windows runner seçin'} />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id} disabled={!agent.enabled}>
                        <span className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${agent.online ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.65)]' : 'bg-muted-foreground/45'}`} />
                          <span>{agent.name}</span>
                          <span className="text-[10px] text-muted-foreground">{agent.online ? 'online' : 'offline'}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  onClick={() => void loadAgents()}
                  disabled={agentsLoading}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-border/60 bg-accent/40 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                  aria-label="Runner listesini yenile"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${agentsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setWizardOpen((open) => !open);
                  setInstallReady(false);
                  setApprovalCode('');
                  setEnrollmentError(null);
                }}
                className="hidden"
              >
                <Plus className="h-3 w-3" /> Yeni runner ekle
              </button>

              {wizardOpen && (
                <div className="overflow-hidden rounded-lg border border-primary/25 bg-primary/[0.035] shadow-[inset_3px_0_0_hsl(var(--primary))]">
                  <div className="border-b border-border/40 px-4 py-3">
                    <p className="text-xs font-semibold text-foreground">Windows runner enrollment</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">PowerShell’i hedef makinede yönetici olarak çalıştırın.</p>
                  </div>
                  <div className="space-y-3 p-4">
                    <div className={`space-y-2 rounded-md border p-3 ${release ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-amber-500/25 bg-amber-500/5'}`}>
                        <p className={`text-[10px] font-semibold ${release ? 'text-emerald-500' : 'text-amber-400'}`}>
                          {release ? `Aktif installer · ${release.releaseId}` : 'Aktif imzalı installer bulunamadı'}
                        </p>
                        {!releaseUpload ? (
                          <button type="button" disabled={enrollmentBusy} onClick={() => void createReleaseUpload()} className="rounded bg-amber-500 px-2.5 py-1.5 text-[10px] font-semibold text-black disabled:opacity-50">{release ? 'Yeni release yayımla' : 'Yayınlama tokenı oluştur'}</button>
                        ) : (
                          <>
                            <div className="flex items-center gap-2 rounded border border-border/40 bg-background/60 p-2"><code className="min-w-0 flex-1 truncate text-[9px]">{releaseUpload.uploadToken}</code><button type="button" onClick={() => void copyText('token', releaseUpload.uploadToken)}><Copy className="h-3 w-3" /></button></div>
                            <div className="relative rounded bg-zinc-950 p-3 pr-9"><pre className="max-h-28 overflow-auto whitespace-pre-wrap break-all text-[9px] text-zinc-300">{publishCommand}</pre><button type="button" className="absolute right-2 top-2" onClick={() => void copyText('publish', publishCommand)}>{copied === 'publish' ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}</button></div>
                            <p className="text-[9px] text-muted-foreground">Signing makinesinde komutu çalıştırın ve sorulduğunda yukarıdaki tokenı girin.</p>
                          </>
                        )}
                        {releases.length > 1 && <div className="space-y-1 border-t border-border/40 pt-2">{releases.slice(0, 4).map((item) => <div key={item.releaseId} className="flex items-center gap-2 text-[9px]"><code className="flex-1">{item.releaseId}</code>{item.active ? <span className="text-emerald-500">aktif</span> : <button type="button" disabled={enrollmentBusy} onClick={() => void activateRelease(item.releaseId)} className="text-primary hover:underline">Aktifleştir / rollback</button>}</div>)}</div>}
                      </div>
                    {!installReady ? (
                      <>
                        <label className="block space-y-1.5">
                          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Bilgisayar / agent adı</span>
                          <Input
                            value={newAgentName}
                            onChange={(event) => setNewAgentName(event.target.value)}
                            placeholder="WINDOWS-SERVER-01"
                            className="h-9 bg-background/70 font-mono text-xs"
                          />
                        </label>
                        {enrollmentError && <p className="text-[10px] text-destructive">{enrollmentError}</p>}
                        <button
                          type="button"
                          disabled={enrollmentBusy || !release}
                          onClick={() => void createEnrollment()}
                          className="inline-flex h-8 items-center gap-2 rounded-md bg-primary px-3 text-[11px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                          {enrollmentBusy && <RefreshCw className="h-3 w-3 animate-spin" />}
                          Kurulum komutunu hazırla
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">1 · Kurulum komutunu çalıştırın</span>
                          <div className="relative rounded-md border border-border/50 bg-zinc-950 p-3 pr-10">
                            <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-all font-mono text-[9px] leading-relaxed text-zinc-300">{installCommand}</pre>
                            <button className="absolute right-2 top-2" type="button" onClick={() => void copyText('command', installCommand)} aria-label="Kurulum komutunu kopyala">
                              {copied === 'command' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-zinc-500" />}
                            </button>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">2 · PowerShell’de görünen 8 karakterli kodu onaylayın</span>
                          <div className="flex gap-2"><Input value={approvalCode} onChange={(event) => setApprovalCode(event.target.value.toUpperCase())} maxLength={8} placeholder="ABCD2345" className="h-9 bg-background/70 font-mono uppercase tracking-widest" /><button type="button" disabled={enrollmentBusy || !/^[A-Z2-9]{8}$/.test(approvalCode)} onClick={() => void approveBootstrap()} className="rounded bg-primary px-3 text-[10px] font-semibold text-primary-foreground disabled:opacity-50">Kodu onayla</button></div>
                        </div>
                        {enrollmentError && <p className="text-[10px] text-destructive">{enrollmentError}</p>}
                        <div className="flex gap-2 rounded-md bg-accent/40 p-2.5 text-[10px] leading-relaxed text-muted-foreground">
                          <Terminal className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>Enrollment sırrı komut satırına veya PowerShell geçmişine yazılmaz. Kod onayından sonra servis hesabı parolası hedef makinede istenir.</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
              {agentsError && <p className="text-[10px] text-destructive">{agentsError}</p>}
              {!agentsError && !agentsLoading && agents.length === 0 && (
                <p className="text-[10px] text-muted-foreground">Kayıtlı runner bulunamadı.</p>
              )}
              {config.runnerAgentId && agents.find((agent) => agent.id === config.runnerAgentId) && (() => {
                const selected = agents.find((agent) => agent.id === config.runnerAgentId)!;
                return (
                  <div className={`space-y-2 rounded-md border px-3 py-2 text-[10px] text-muted-foreground ${selected.health === 'offline' ? 'border-destructive/50 bg-destructive/10' : selected.health === 'degraded' ? 'border-amber-500/40 bg-amber-500/10' : 'border-border/40 bg-background/40'}`}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className={selected.health === 'online' ? 'text-emerald-500' : selected.health === 'degraded' ? 'text-amber-500' : 'text-destructive'}>
                        {selected.health === 'online' ? '● Çevrimiçi' : selected.health === 'degraded' ? '● Bağlantı gecikiyor' : '● Çevrimdışı — deployment başlatmayın'}
                      </span>
                      <span>Son görülme: {selected.secondsSinceSeen === null ? 'hiç' : `${selected.secondsSinceSeen} sn önce`}</span>
                      {selected.version && <span>v{selected.version}</span>}
                      {selected.installedReleaseId && <span>Release {selected.installedReleaseId}</span>}
                      {selected.currentJob && <span className="text-primary">İş: {selected.currentJob.status}</span>}
                    </div>
                    {!retireConfirm ? (
                      <div className="hidden">
                        <button type="button" onClick={() => { setRetireConfirm(true); setRetireError(null); }} className="inline-flex items-center gap-1 text-amber-500 hover:text-amber-400"><Archive className="h-3 w-3" /> Kaydı emekliye ayır</button>
                        {release && <button type="button" onClick={() => void copyText('uninstall', uninstallCommand)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">{copied === 'uninstall' ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />} Kaldırma komutunu kopyala</button>}
                        {release && selected.updateAvailable && <button type="button" onClick={() => void copyText('upgrade', upgradeCommand)} className="inline-flex items-center gap-1 text-primary hover:text-primary/80">{copied === 'upgrade' ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />} Upgrade komutunu kopyala</button>}
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 rounded bg-amber-500/10 p-2 text-amber-200">
                        <span className="mr-auto">Bu kayıt devre dışı kalır; iş geçmişi korunur.</span>
                        <button type="button" disabled={retireBusy} onClick={() => setRetireConfirm(false)} className="rounded px-2 py-1 hover:bg-background/40">Vazgeç</button>
                        <button type="button" disabled={retireBusy} onClick={() => void retireSelectedAgent()} className="rounded bg-amber-500 px-2 py-1 font-semibold text-black disabled:opacity-50">
                          {retireBusy ? 'İşleniyor…' : 'Emekliye ayır'}
                        </button>
                      </div>
                    )}
                    {retireError && <p className="text-destructive">{retireError}</p>}
                  </div>
                );
              })()}
            </div>
          </SettingsField>
          <SettingsField icon={<Monitor className="h-3.5 w-3.5" />} label="Zaman aşımı (saniye)">
            <Input
              type="number"
              min={1}
              max={3600}
              value={config.runnerTimeoutSeconds || 900}
              onChange={(e) => onChange({ ...config, runnerTimeoutSeconds: Number(e.target.value) })}
              className="bg-accent/50 border-border/50"
            />
          </SettingsField>
        </>
      )}

      {!usesRunner && !usesAgent && <SettingsField icon={<Monitor className="h-3.5 w-3.5" />} label="Server IP / Host">
        <Input
          value={config.host || ''}
          onChange={(e) => onChange({ ...config, host: e.target.value })}
          placeholder={isWindows ? "192.168.1.4" : "10.0.0.1"}
          className="bg-accent/50 border-border/50"
        />
      </SettingsField>}
      {!usesRunner && !usesAgent && <SettingsField icon={<Server className="h-3.5 w-3.5" />} label={isWindows ? "WinRM HTTP / HTTPS" : "SSH (Secure Shell)"}>
        <Input
          value={config.port || (isWindows ? '5985' : '22')}
          onChange={(e) => onChange({ ...config, port: e.target.value })}
          placeholder={isWindows ? "5985" : "22"}
          className="bg-accent/50 border-border/50"
        />
      </SettingsField>}

      {!isWindows && <HostKeyPolicyField config={config} onChange={onChange} />}

      <TelemetryToggleField config={config} onChange={onChange} />

      {!usesRunner && !usesAgent && <div className="border-t border-border/50 pt-4 mt-2">
        <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Authentication (Kimlik Doğrulama)</h5>
        <div className="flex items-center gap-4 bg-accent/30 p-1 rounded-md border border-border/50 mb-4">
          <button
            onClick={() => onChange({ ...config, authType: 'manual' })}
            className={`flex-1 py-1.5 text-xs font-medium rounded-sm transition-colors ${
              (!config.authType || config.authType === 'manual')
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            }`}
          >
            Manual Password / Key
          </button>
          <button
            onClick={() => onChange({ ...config, authType: 'pmp' })}
            className={`flex-1 py-1.5 text-xs font-medium rounded-sm transition-colors ${
              config.authType === 'pmp'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            }`}
          >
            ManageEngine PMP
          </button>
        </div>

        {(!config.authType || config.authType === 'manual') && (
          <>
            <SettingsField icon={<User className="h-3.5 w-3.5" />} label="Username">
              <Input
                value={config.username || ''}
                onChange={(e) => onChange({ ...config, username: e.target.value })}
                placeholder="deployer"
                className="bg-accent/50 border-border/50"
              />
            </SettingsField>
            <SettingsField icon={<KeyRound className="h-3.5 w-3.5" />} label="Password">
              <Input
                type="password"
                value={config.password || ''}
                onChange={(e) => onChange({ ...config, password: e.target.value })}
                placeholder={config.hasPassword ? SAVED_SECRET_PLACEHOLDER : "••••••••••••"}
                className="bg-accent/50 border-border/50"
              />
              <SecretHint show={!!config.hasPassword} />
            </SettingsField>
          </>
        )}

        {config.authType === 'pmp' && <PmpAuthFields config={config} onChange={onChange} />}
      </div>}

      <ScriptEditor config={config} onChange={onChange} isWindows={isWindows} />
    </>
  );
};
