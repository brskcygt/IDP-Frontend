import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useBuildParameters, useUpdateBuildParameters } from '@/hooks/useSettings';
import { KeyValueEditor } from './KeyValueEditor';
import { formatDateTime } from '@/lib/format';
import { errorMessage } from '@/lib/errors';

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editing is admin-only; everyone else sees the values read-only. */
  canEdit: boolean;
};

const formatUpdated = (at: string | null, by: string | null) => {
  if (!at) return 'Henüz ayarlanmadı.';
  const when = formatDateTime(at);
  return by ? `Son değişiklik: ${when}, ${by}.` : `Son değişiklik: ${when}.`;
};

/**
 * Server-wide settings. Today that is the build parameters every project's
 * release build inherits — the values that are the same for every project
 * (a PostHog region host, the id of a shared CI credential) and would
 * otherwise be copied into each project until they drifted apart.
 *
 * A project's own parameters override these, so this screen holds defaults,
 * not policy.
 */
export const GlobalSettingsSheet = ({ isOpen, onOpenChange, canEdit }: Props) => {
  const { toast } = useToast();
  const { data, isLoading, isError, error, refetch, isFetching } = useBuildParameters();
  const save = useUpdateBuildParameters();
  const [draft, setDraft] = useState<Record<string, string> | null>(null);

  const saved = data?.parameters ?? {};
  const current = draft ?? saved;
  const isDirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);

  const close = (open: boolean) => {
    if (!open) setDraft(null);
    onOpenChange(open);
  };

  const handleSave = async () => {
    if (draft === null) return;
    try {
      const result = await save.mutateAsync(draft);
      setDraft(null);
      toast({
        title: 'Derleme parametreleri kaydedildi',
        description: `${Object.keys(result.parameters).length} parametre tüm projelere uygulanır.`,
      });
    } catch (cause) {
      toast({
        title: 'Derleme parametreleri kaydedilemedi',
        description: errorMessage(cause),
        variant: 'destructive',
      });
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={close}>
      <SheetContent side="right" className="w-[min(640px,calc(100vw-3.5rem))] max-w-none overflow-y-auto border-l-line-strong bg-background p-0 sm:max-w-none">
        <div className="border-b border-line-strong bg-bar px-7 py-6">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-3 text-xl">
              <Settings2 className="h-5 w-5 text-primary" />
              Sunucu ayarları
            </SheetTitle>
            <SheetDescription>
              Bu sunucudaki tüm projeler için geçerlidir. Her proje, kendi Ayarlar → Derleme ve kaynak
              bölümünden bunları ezebilir.
            </SheetDescription>
          </SheetHeader>
        </div>

        <div className="p-7">
        <section className="space-y-3 rounded-lg border border-border/60 p-4">
          <div>
            <h3 className="text-sm font-semibold">Derleme parametreleri</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Her sürüm derlenirken sürüm numarasıyla birlikte CI job'una gönderilir. Her projede aynı
              olan değerler içindir; örn. POSTHOG_HOST ya da ortak bir kimlik bilgisinin id'si.
            </p>
          </div>

          {isLoading && <p className="text-xs text-muted-foreground">Derleme parametreleri yükleniyor…</p>}
          {isError && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-destructive">Derleme parametreleri okunamadı: {errorMessage(error)}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>Tekrar dene</Button>
            </div>
          )}

          {!isLoading && !isError && (
            <>
              <KeyValueEditor
                value={current}
                onChange={setDraft}
                noun="Parametre"
                emptyHint="Henüz sunucu geneli parametre yok."
                footnote={
                  'Parametreler gizli değildir: CI aracına job parametresi olarak gider ve build log\'unda ' +
                  'görünür. Kimlik bilgisini CI aracında tutun, burada yalnız id\'sini verin.'
                }
                disabled={!canEdit}
              />
              <p className="text-[11px] text-muted-foreground">
                {canEdit ? formatUpdated(data?.updatedAt ?? null, data?.updatedBy ?? null) : 'Salt okunur: bunları yalnız yönetici değiştirebilir.'}
              </p>
            </>
          )}
        </section>

        {canEdit && (
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDraft(null)} disabled={!isDirty || save.isPending}>
              Değişiklikleri at
            </Button>
            <Button type="button" onClick={handleSave} disabled={!isDirty || save.isPending}>
              {save.isPending ? 'Kaydediliyor…' : 'Kaydet'}
            </Button>
          </div>
        )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
