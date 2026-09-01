import { useMemo, useState } from 'react';
import { CheckCircle2, FileUp, FolderOpen, Loader2, LockKeyhole, Server } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getTransport } from '@/services/transport';

type Props = { isOpen: boolean; onOpenChange: (open: boolean) => void };

export const ServerFileTransferSheet = ({ isOpen, onOpenChange }: Props) => {
  const [localFile, setLocalFile] = useState<{ filePath: string; name: string; size: number } | null>(null);
  const [host, setHost] = useState(''); const [port, setPort] = useState('22');
  const [username, setUsername] = useState(''); const [password, setPassword] = useState('');
  const [remotePath, setRemotePath] = useState('C:/IDP-Agent/idp-agent.jar');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ remotePath: string; bytes: number } | null>(null);
  const ready = Boolean(localFile && host.trim() && username.trim() && password && remotePath.trim());
  const sizeLabel = useMemo(() => localFile ? `${(localFile.size / 1024 / 1024).toFixed(2)} MB` : '', [localFile]);

  const choose = async () => {
    setError(null); setSuccess(null);
    try { const result = await getTransport().fileTransfer.selectFile(); if (!result.canceled && result.filePath && result.name && result.size !== undefined) setLocalFile({ filePath: result.filePath, name: result.name, size: result.size }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Dosya seçilemedi.'); }
  };
  const upload = async () => {
    if (!localFile) return;
    setBusy(true); setError(null); setSuccess(null);
    try {
      const result = await getTransport().fileTransfer.upload({ localPath: localFile.filePath, host: host.trim(), port: Number(port), username: username.trim(), password, remotePath: remotePath.trim() });
      setSuccess(result); setPassword('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Dosya aktarılamadı.'); }
    finally { setBusy(false); }
  };

  return <Sheet open={isOpen} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="w-[min(820px,calc(100vw-3.5rem))] max-w-none overflow-y-auto border-l-line-strong bg-background p-0 sm:max-w-none">
      <div className="border-b border-line-strong bg-bar px-7 py-6"><SheetHeader><SheetTitle className="flex items-center gap-3 text-xl"><FileUp className="h-5 w-5 text-primary" />Sunucuya dosya gönder</SheetTitle><SheetDescription>Yerel bir dosyayı SSH üzerinden hedef makineye güvenli biçimde aktarın.</SheetDescription></SheetHeader></div>
      <div className="grid gap-6 p-7 lg:grid-cols-[1fr_270px]">
        <section className="space-y-5">
          <button type="button" onClick={() => void choose()} className="group flex min-h-28 w-full items-center gap-4 rounded-lg border border-dashed border-line-strong bg-surface/50 p-5 text-left transition-colors hover:border-primary/60 hover:bg-primary/[0.025]">
            <span className="grid h-11 w-11 place-items-center rounded-md border border-line bg-background text-primary"><FolderOpen className="h-5 w-5" /></span>
            <span className="min-w-0"><span className="block text-sm font-semibold">{localFile?.name ?? 'Yerel dosya seçin'}</span><span className="mt-1 block truncate font-mono text-[10px] text-muted-foreground">{localFile ? `${localFile.filePath} · ${sizeLabel}` : 'JAR, ZIP veya başka bir deployment çıktısı'}</span></span>
          </button>
          <div className="grid gap-4 sm:grid-cols-[1fr_110px]">
            <div><Label htmlFor="transfer-host">Sunucu / IP</Label><Input id="transfer-host" value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.1.50" className="mt-2 font-mono" /></div>
            <div><Label htmlFor="transfer-port">SSH portu</Label><Input id="transfer-port" type="number" min={1} max={65535} value={port} onChange={(e) => setPort(e.target.value)} className="mt-2 font-mono" /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="transfer-user">Kullanıcı adı</Label><Input id="transfer-user" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="pc" className="mt-2 font-mono" /></div>
            <div><Label htmlFor="transfer-password">Parola</Label><Input id="transfer-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="mt-2" /></div>
          </div>
          <div><Label htmlFor="transfer-remote">Uzak hedef dosya yolu</Label><Input id="transfer-remote" value={remotePath} onChange={(e) => setRemotePath(e.target.value)} placeholder="C:/IDP-Agent/idp-agent.jar" className="mt-2 font-mono" /><p className="mt-1.5 text-[10px] text-muted-foreground">Windows OpenSSH/SFTP için ileri eğik çizgi kullanın. Hedef klasör önceden mevcut olmalıdır.</p></div>
        </section>
        <aside className="space-y-4">
          <div className="rounded-lg border border-primary/25 bg-primary/[0.035] p-4"><div className="flex items-center gap-2 text-primary"><Server className="h-4 w-4" /><p className="text-xs font-semibold uppercase tracking-[0.14em]">SFTP aktarımı</p></div><p className="mt-3 text-xs leading-relaxed text-muted-foreground">IDP hedefin SSH host key’ini ilk bağlantıda sabitler. Sonraki bağlantıda anahtar değişirse aktarım güvenlik nedeniyle reddedilir.</p><button type="button" disabled={!ready || busy} onClick={() => void upload()} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}{busy ? 'Aktarılıyor…' : 'Dosyayı gönder'}</button></div>
          <div className="flex gap-3 rounded-lg border border-line bg-surface p-4 text-[11px] leading-relaxed text-muted-foreground"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /><p>Parola yalnızca bu aktarım için Electron ana sürecine iletilir; diske veya proje ayarlarına kaydedilmez.</p></div>
          {success && <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-4"><p className="flex items-center gap-2 text-xs font-semibold text-emerald-500"><CheckCircle2 className="h-4 w-4" />Aktarım tamamlandı</p><p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">{success.remotePath}</p><p className="mt-1 text-[10px] text-dim">{success.bytes.toLocaleString('tr-TR')} bayt</p></div>}
          {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">{error}</p>}
        </aside>
      </div>
    </SheetContent>
  </Sheet>;
};
