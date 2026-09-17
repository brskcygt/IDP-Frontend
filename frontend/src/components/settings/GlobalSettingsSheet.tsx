import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useBuildParameters, useUpdateBuildParameters } from '@/hooks/useSettings';
import { KeyValueEditor } from './KeyValueEditor';

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editing is admin-only; everyone else sees the values read-only. */
  canEdit: boolean;
};

const formatUpdated = (at: string | null, by: string | null) => {
  if (!at) return 'Not configured yet.';
  const when = new Date(at).toLocaleString();
  return by ? `Last changed ${when} by ${by}.` : `Last changed ${when}.`;
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
  const { data, isLoading, isError, error } = useBuildParameters();
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
        title: 'Build parameters saved',
        description: `${Object.keys(result.parameters).length} parameter(s) apply to every project.`,
      });
    } catch (cause) {
      toast({
        title: 'Could not save the build parameters',
        description: cause instanceof Error ? cause.message : 'Unknown error.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={close}>
      <SheetContent side="right" className="w-[min(640px,calc(100vw-3.5rem))] max-w-none overflow-y-auto border-l-line-strong bg-background">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2.5 text-lg">
            <Settings2 className="h-5 w-5 text-primary" />
            Settings
          </SheetTitle>
          <SheetDescription>
            Applies to every project on this server. A project can override any of it from its own
            Artifact Deploy settings.
          </SheetDescription>
        </SheetHeader>

        <section className="mt-6 space-y-3 rounded-lg border border-border/60 p-4">
          <div>
            <h3 className="text-sm font-semibold">Build parameters</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Sent to the CI job alongside the version every time a release is built. Useful for the
              values that are identical everywhere, e.g. POSTHOG_HOST or the id of a shared
              credential.
            </p>
          </div>

          {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
          {isError && (
            <p className="text-xs text-destructive">
              {error instanceof Error ? error.message : 'Could not read the build parameters.'}
            </p>
          )}

          {!isLoading && !isError && (
            <>
              <KeyValueEditor
                value={current}
                onChange={setDraft}
                noun="Parameter"
                emptyHint="No global parameters yet."
                footnote={
                  'Parameters are not secret: they reach the CI tool as job parameters and appear in ' +
                  'its build log. For a credential, store it in the CI tool and pass only its id here.'
                }
                disabled={!canEdit}
              />
              <p className="text-[11px] text-muted-foreground">
                {canEdit ? formatUpdated(data?.updatedAt ?? null, data?.updatedBy ?? null) : 'Read-only — an admin can change these.'}
              </p>
            </>
          )}
        </section>

        {canEdit && (
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDraft(null)} disabled={!isDirty || save.isPending}>
              Discard
            </Button>
            <Button type="button" onClick={handleSave} disabled={!isDirty || save.isPending}>
              {save.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
