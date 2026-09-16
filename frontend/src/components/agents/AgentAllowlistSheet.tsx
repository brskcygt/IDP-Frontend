import { useState } from "react";
import { Network, Plus, Trash2, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSession } from "@/hooks/useSession";
import { useAddAllowlistEntry, useAgentAllowlist, useRemoveAllowlistEntry } from "@/hooks/useAgentAllowlist";
import { can } from "@/lib/permissions";

type AgentAllowlistSheetProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Source-IP allowlist for the agent listener (admin-only).
 *
 * The gateway checks a connecting agent's address against this list before it
 * verifies any credential. An empty list means no restriction — that is a
 * deliberate choice (see idp-agent-gateway/src/allowlist.js) and the banner
 * below says so outright, because an empty list otherwise reads like a
 * restriction that blocks everyone.
 *
 * This is not the only gate: the cloud security list and the host firewall
 * still sit in front, and they are managed outside the product.
 *
 * UI-level gating only; every mutation goes through the backend's own
 * `requirePermission('project:write')` check.
 */
export const AgentAllowlistSheet = ({ isOpen, onOpenChange }: AgentAllowlistSheetProps) => {
  const { data: session } = useSession();
  const isAdmin = can(session?.role, 'project:write');
  const { data, isLoading, isError } = useAgentAllowlist(isOpen && isAdmin);
  const addEntry = useAddAllowlistEntry();
  const removeEntry = useRemoveAllowlistEntry();

  const [isAdding, setIsAdding] = useState(false);
  const [entry, setEntry] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isAdmin) return null;

  const entries = data?.entries ?? [];
  const enforcing = data?.enforcing ?? false;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await addEntry.mutateAsync({ entry: entry.trim(), note: note.trim() });
      setEntry('');
      setNote('');
      setIsAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Adres eklenemedi.');
    }
  };

  const remove = async (value: string) => {
    setError(null);
    try {
      await removeEntry.mutateAsync(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Adres çıkarılamadı.');
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l-line-strong bg-background p-0 sm:max-w-[480px]"
      >
        <div className="shrink-0 border-b border-line-strong bg-bar px-5 py-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2.5 text-[15px] font-bold tracking-tight">
              <Network className="h-4 w-4 text-primary" aria-hidden="true" />
              Agent erişim listesi
            </SheetTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 border-line-strong bg-surface px-2 text-xs"
              onClick={() => { setIsAdding((v) => !v); setError(null); }}
            >
              {isAdding ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
              {isAdding ? 'Vazgeç' : 'Adres ekle'}
            </Button>
          </div>
          <SheetDescription className="mt-1 font-mono text-[10.5px] tracking-[0.04em] text-dim">
            AGENT'LARIN BAĞLANABİLECEĞİ KAYNAK ADRESLER
          </SheetDescription>
        </div>

        {!isLoading && !isError && (
          <div
            className={`shrink-0 border-b border-line px-5 py-3 text-xs leading-5 ${
              enforcing ? 'bg-status-ok/[0.06] text-muted-foreground' : 'bg-amber-500/[0.06] text-amber-200'
            }`}
          >
            {enforcing ? (
              <>Liste uygulanıyor: yalnızca aşağıdaki adreslerden gelen agent'lar bağlanabilir.</>
            ) : (
              <>
                <strong>Liste boş, kısıt uygulanmıyor.</strong> Şu anda her kaynaktan bağlantı kabul
                ediliyor. İlk adresi eklediğiniz anda kısıt devreye girer — kendi erişiminizi
                kaybetmemek için bağlı agent'ların adreslerini önce eklediğinizden emin olun.
              </>
            )}
          </div>
        )}

        {isAdding && (
          <form onSubmit={submit} className="shrink-0 space-y-3 border-b border-line bg-surface/40 px-5 py-4">
            <div>
              <Input
                autoFocus
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                placeholder="203.0.113.4 veya 203.0.113.0/24"
                className="font-mono text-xs"
              />
              <p className="mt-1.5 font-mono text-[10.5px] text-dim">
                IPv4/IPv6 adresi ya da CIDR bloğu
              </p>
            </div>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Not (örn. müşteri sunucusu)"
              className="text-xs"
            />
            <Button type="submit" size="sm" className="h-7 text-xs" disabled={!entry.trim() || addEntry.isPending}>
              {addEntry.isPending ? 'Ekleniyor…' : 'Ekle'}
            </Button>
          </form>
        )}

        {error && (
          <p className="shrink-0 border-b border-line bg-status-fail/[0.08] px-5 py-2.5 text-xs text-status-fail">
            {error}
          </p>
        )}

        <div className="min-h-0 flex-grow overflow-y-auto">
          {isError ? (
            <p className="px-5 py-6 text-sm text-status-fail">Erişim listesi alınamadı.</p>
          ) : isLoading ? (
            <p className="px-5 py-6 font-mono text-[11px] text-dim">Yükleniyor…</p>
          ) : entries.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">Listede adres yok.</p>
          ) : (
            <ul className="divide-y divide-line">
              {entries.map((item) => (
                <li key={item.entry} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs text-foreground">{item.entry}</p>
                    {item.note && <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.note}</p>}
                    <p className="mt-0.5 font-mono text-[10px] text-dim">
                      {new Date(item.addedAt).toLocaleString()}
                      {item.addedBy ? ` · ${item.addedBy}` : ''}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`${item.entry} adresini çıkar`}
                    className="h-7 shrink-0 px-2 text-dim hover:text-status-fail"
                    disabled={removeEntry.isPending}
                    onClick={() => remove(item.entry)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="tabular flex h-[34px] shrink-0 items-center justify-between border-t border-line-strong bg-bar px-5 font-mono text-[10.5px] text-dim">
          <span>{entries.length} adres</span>
          <span>{enforcing ? 'KISIT AKTİF' : 'KISIT YOK'}</span>
        </div>
      </SheetContent>
    </Sheet>
  );
};
