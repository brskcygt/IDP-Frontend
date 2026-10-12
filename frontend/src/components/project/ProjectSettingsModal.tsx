import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Project } from "@/hooks/useProjects";
import { useUpdateProjectSettings, useDeleteProject } from "@/hooks/useProjects";
import { useToast } from "@/hooks/use-toast";
import { Check, Copy, Save } from "lucide-react";
import { JenkinsSettings } from "@/components/project/settings/JenkinsSettings";
import { ServerSettings } from "@/components/project/settings/ServerSettings";
import { PmpSettings } from "@/components/project/settings/PmpSettings";
import { PipelineSettings } from "@/components/project/settings/PipelineSettings";
import { ConnectionTestPanel } from "@/components/project/settings/ConnectionTestPanel";
import { DangerZone } from "@/components/project/settings/DangerZone";
import type { ProjectConfig } from "@/types/project";
import { getProviderMeta } from "@/lib/providers";
import { needsNewArtifactToken } from "@/components/project/settings/artifactDeployValidation";
import { ArtifactDeploySettings } from "@/components/project/settings/ArtifactDeploySettings";
import { ArtifactTargetsSettings } from "@/components/artifacts/ArtifactTargetsSettings";
import { useSession } from "@/hooks/useSession";
import { can } from "@/lib/permissions";

type ProjectSettingsModalProps = {
  project: Project | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: SettingsTabId;
  /** Opens the Müşteriler tab with this customer already in the edit form. */
  editTargetId?: string | null;
};

export type SettingsTabId = 'general' | 'artifacts' | 'targets';

const SETTINGS_TABS: ReadonlyArray<{ id: SettingsTabId; label: string }> = [
  { id: 'general', label: 'Genel' },
  { id: 'artifacts', label: 'Derleme ve kaynak' },
  { id: 'targets', label: 'Müşteriler' },
];

export const ProjectSettingsModal = ({ project, isOpen, onOpenChange, initialTab = 'general', editTargetId }: ProjectSettingsModalProps) => {
  const [config, setConfig] = useState<ProjectConfig>({});
  const [activeTab, setActiveTab] = useState<SettingsTabId>('general');
  const [projectIdCopied, setProjectIdCopied] = useState(false);
  const { data: session } = useSession();
  // Non-admins see the same screens read-only; the backend rejects their writes anyway.
  const canWrite = can(session?.role, 'project:write');
  // Müşteriler appears as soon as artifact deploy is switched on in the draft;
  // the tab itself explains that customers can only be added once it is saved.
  const visibleTabs = config.artifactDeploy || project?.config?.artifactDeploy
    ? SETTINGS_TABS
    : SETTINGS_TABS.filter((tab) => tab.id !== 'targets');

  /** Arrow keys move between tabs, Home/End jump to the ends — WAI-ARIA tablist. */
  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = visibleTabs.findIndex((tab) => tab.id === activeTab);
    let nextIndex: number | null = null;

    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % visibleTabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + visibleTabs.length) % visibleTabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = visibleTabs.length - 1;

    if (nextIndex === null) return;
    event.preventDefault();
    const next = visibleTabs[nextIndex];
    setActiveTab(next.id);
    document.getElementById(`settings-tab-${next.id}`)?.focus();
  };

  const { mutate, isPending } = useUpdateProjectSettings();
  const { mutate: deleteProject, isPending: isDeleting } = useDeleteProject();
  const { toast } = useToast();

  // Reset the draft when the dialog opens or another project is shown — not on
  // every refetch of the same project, which would wipe unsaved edits.
  useEffect(() => {
    if (project && isOpen) {
      setConfig(project.config || {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const canOpenInitialTab = initialTab !== 'targets' || Boolean(project?.config?.artifactDeploy);
    setActiveTab(canOpenInitialTab ? initialTab : 'general');
    // Only when the dialog opens: a save that flips artifactDeploy must not
    // throw the operator back to the first tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab, isOpen, project?.id]);

  if (!project) return null;

  const handleSave = () => {
    if (needsNewArtifactToken(project.config?.artifactDeploy, config.artifactDeploy)) {
      setActiveTab('artifacts');
      toast({ title: 'Depo token\'ı gerekli', description: 'Kaynak değişti. Kaydetmeden önce yeni kaynağın token\'ını girin.', variant: 'destructive' });
      return;
    }
    mutate({ id: project.id, config }, {
      onSuccess: () => {
        toast({ title: 'Ayarlar kaydedildi', description: project.name });
        onOpenChange(false);
      },
      onError: (err) => {
        toast({ title: 'Ayarlar kaydedilemedi', description: err.message, variant: 'destructive' });
      }
    });
  };

  const copyProjectId = async () => {
    try {
      await navigator.clipboard.writeText(project.id);
      setProjectIdCopied(true);
      window.setTimeout(() => setProjectIdCopied(false), 1400);
    } catch {
      toast({ title: 'Kopyalanamadı', description: 'Proje ID panoya kopyalanamadı.', variant: 'destructive' });
    }
  };

  const handleDelete = () => {
    deleteProject(project.id, {
      onSuccess: () => {
        toast({ title: 'Proje silindi', description: project.name });
        onOpenChange(false);
      },
      onError: (err) => {
        toast({ title: 'Proje silinemedi', description: err.message, variant: 'destructive' });
      }
    });
  };

  const providerMeta = getProviderMeta(project.provider, project.config?.targetOS);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 overflow-hidden sm:max-w-3xl">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="flex items-center gap-2.5 text-lg font-semibold">
            <span className="[&>svg]:h-4 [&>svg]:w-4">{providerMeta.icon}</span>
            {project.name}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{providerMeta.settingsTitle}</span>
            <span aria-hidden="true" className="text-border">•</span>
            <span className="inline-flex items-center gap-1.5">
              <span>Proje ID:</span>
              <code className="rounded border border-border/70 bg-accent/50 px-1.5 py-0.5 font-mono text-[11px] text-foreground">{project.id}</code>
              <button
                type="button"
                onClick={() => void copyProjectId()}
                className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Proje ID'yi kopyala"
                title="Proje ID'yi kopyala"
              >
                {projectIdCopied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{projectIdCopied ? 'Kopyalandı' : 'Kopyala'}</span>
              </button>
            </span>
          </DialogDescription>
        </DialogHeader>

        {/* Tab Navigation */}
        <div
          role="tablist"
          aria-label="Proje ayarları bölümleri"
          className="flex items-center gap-4 border-b border-border/50 px-6 mt-4"
          onKeyDown={handleTabKeyDown}
        >
          {visibleTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`settings-tab-${tab.id}`}
                role="tab"
                type="button"
                aria-selected={isActive}
                aria-controls={`settings-panel-${tab.id}`}
                // Roving tabindex: only the active tab is reachable with Tab;
                // the arrow keys move between them, which is what screen-reader
                // and keyboard users expect from a tablist.
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
                  isActive
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id={`settings-panel-${activeTab}`}
          aria-labelledby={`settings-tab-${activeTab}`}
          tabIndex={0}
          className="space-y-4 px-6 py-4 max-h-[72vh] overflow-y-auto"
        >
          {!canWrite && activeTab !== 'targets' && (
            <p className="rounded-md border border-border/60 bg-accent/30 px-3 py-2 text-xs text-muted-foreground">
              Salt okunur: ayarları yalnız admin değiştirebilir.
            </p>
          )}

          {activeTab === 'general' && (
            <>
              <fieldset disabled={!canWrite} className="min-w-0 space-y-4">
              {project.provider === 'Jenkins' && (
                <JenkinsSettings config={config} onChange={setConfig} />
              )}

              {project.provider === 'Pipeline' && (
                <PipelineSettings config={config} onChange={setConfig} />
              )}

              {['Server', 'SSH', 'WinRM'].includes(project.provider) && (
                <ServerSettings config={config} onChange={setConfig} provider={project.provider} />
              )}

              {project.provider === 'PMP' && (
                <PmpSettings config={config} onChange={setConfig} />
              )}
              </fieldset>

              <ConnectionTestPanel projectId={project.id} />

              <DangerZone
                projectName={project.name}
                isDeleting={isDeleting}
                onConfirmDelete={handleDelete}
              />
            </>
          )}

          {activeTab === 'artifacts' && (
            <fieldset disabled={!canWrite} className="min-w-0">
              <ArtifactDeploySettings config={config} original={project.config?.artifactDeploy} onChange={setConfig} />
            </fieldset>
          )}

          {activeTab === 'targets' && (project.config?.artifactDeploy ? (
            <ArtifactTargetsSettings project={project} canEdit={canWrite} editTargetId={editTargetId ?? null} />
          ) : (
            <p className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
              Artifact dağıtımı bu taslakta açık ama henüz kaydedilmedi. Önce kaydedin; müşteriler ondan sonra eklenebilir.
            </p>
          ))}

        </div>

        <DialogFooter className="px-6 pb-6">
          {!canWrite || (activeTab === 'targets' && project.config?.artifactDeploy) ? <Button variant="outline" onClick={() => onOpenChange(false)}>Kapat</Button> : <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Vazgeç</Button>
            <Button onClick={handleSave} disabled={isPending}>
              <Save className="mr-2 h-4 w-4" />
              {isPending ? 'Kaydediliyor…' : 'Kaydet'}
            </Button>
          </>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
