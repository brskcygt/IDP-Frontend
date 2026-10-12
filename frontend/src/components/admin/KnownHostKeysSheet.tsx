import { KeyRound } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useSession } from "@/hooks/useSession";
import { useHostKeys } from "@/hooks/useHostKeys";
import { can } from "@/lib/permissions";
import { KnownHostKeyList } from "./KnownHostKeyList";
import { Button } from "@/components/ui/button";

type KnownHostKeysSheetProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Admin-only known SSH host keys panel (T-17b): lists every host key the
 * backend has learned under the TOFU policy (or recorded some other way),
 * with a "forget" action per row so a decommissioned or rotated host can be
 * re-learned on its next connection. Opened from the rail's Yönetim →
 * Bilinen host anahtarları, which itself only renders for an admin with `vpn:manage` — this
 * component re-checks independently, same as UserManagementSheet, so a
 * session downgrade mid-use doesn't leave it usable.
 *
 * UI-level gating only: the backend independently enforces
 * `requirePermission('vpn:manage')` on both endpoints this sheet calls.
 */
export const KnownHostKeysSheet = ({ isOpen, onOpenChange }: KnownHostKeysSheetProps) => {
  const { data: session } = useSession();
  const isAllowed = can(session?.role, 'vpn:manage');
  const { data: hostKeys, isLoading, isError, refetch, isFetching } = useHostKeys(isOpen && isAllowed);

  if (!isAllowed) return null;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        resizeKey="host-keys"
        side="right"
        className="flex w-full flex-col gap-0 border-l-line-strong bg-background p-0 sm:max-w-[440px]"
      >
        <div className="shrink-0 border-b border-line-strong bg-bar px-5 py-4">
          <SheetTitle className="flex items-center gap-2.5 text-[15px] font-bold tracking-tight">
            <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />
            Bilinen host anahtarları
          </SheetTitle>
          <SheetDescription className="mt-1 text-xs text-muted-foreground">
            SSH sunucularından öğrenilen anahtarlar. Anahtarı değişen ya da kaldırılan bir sunucuyu unutun; bir sonraki bağlantıda yeniden öğrenilir.
          </SheetDescription>
        </div>

        <div className="min-h-0 flex-grow overflow-y-auto">
          {isError ? (
            <div className="space-y-2 px-5 py-6">
              <p className="text-sm text-status-fail">Host anahtarları yüklenemedi.</p>
              <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>Tekrar dene</Button>
            </div>
          ) : isLoading ? (
            <p className="px-5 py-6 font-mono text-[11px] text-dim">Host anahtarları yükleniyor…</p>
          ) : !hostKeys || hostKeys.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">Henüz öğrenilmiş host anahtarı yok. SSH projeleri ilk bağlantıda anahtarı buraya kaydeder.</p>
          ) : (
            <KnownHostKeyList hostKeys={hostKeys} />
          )}
        </div>

        <div className="tabular flex h-[34px] shrink-0 items-center justify-between border-t border-line-strong bg-bar px-5 font-mono text-[10.5px] text-dim">
          <span>{hostKeys?.length ?? 0} anahtar</span>
        </div>
      </SheetContent>
    </Sheet>
  );
};
