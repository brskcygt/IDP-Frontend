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

type ProjectSettingsModalProps = {
  project: Project | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: SettingsTabId;
  onArtifactRunStarted?: (deploymentId: string) => void;
};

export type SettingsTabId = 'general' | 'artifacts' | 'targets';

const SETTINGS_TABS: ReadonlyArray<{ id: SettingsTabId; label: string }> = [
  { id: 'general', label: 'General Settings' },
  { id: 'artifacts', label: 'Artifact Deploy' },
  { id: 'targets', label: 'Targets' },
];

export const ProjectSettingsModal = ({ project, isOpen, onOpenChange, initialTab = 'general', onArtifactRunStarted }: ProjectSettingsModalProps) => {
  const [config, setConfig] = useState<ProjectConfig>({});
  const [activeTab, setActiveTab] = useState<SettingsTabId>('general');
  const [projectIdCopied, setProjectIdCopied] = useState(false);
  const visibleTabs = project?.config?.artifactDeploy
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

  useEffect(() => {
    if (project) {
      setConfig(project.config || {});
    }
  }, [project]);

  useEffect(() => {
    if (!isOpen) return;
    const canOpenInitialTab = initialTab !== 'targets' || Boolean(project?.config?.artifactDeploy);
    setActiveTab(canOpenInitialTab ? initialTab : 'general');
  }, [initialTab, isOpen, project?.id, project?.config?.artifactDeploy]);

  if (!project) return null;

  const handleSave = () => {
    if (needsNewArtifactToken(project.config?.artifactDeploy, config.artifactDeploy)) {
      setActiveTab('artifacts');
      toast({ title: 'Repository token required', description: 'The artifact source changed. Enter the token for the new source before saving.', variant: 'destructive' });
      return;
    }
    mutate({ id: project.id, config }, {
      onSuccess: () => {
        toast({ title: 'Settings Saved', description: 'Deployment configuration updated successfully.' });
        onOpenChange(false);
      },
      onError: (err) => {
        toast({ title: 'Error', description: err.message, variant: 'destructive' });
      }
    });
  };

  const copyProjectId = async () => {
    try {
      await navigator.clipboard.writeText(project.id);
      setProjectIdCopied(true);
      window.setTimeout(() => setProjectIdCopied(false), 1400);
    } catch {
      toast({ title: 'Copy failed', description: 'Project ID could not be copied to the clipboard.', variant: 'destructive' });
    }
  };

  const handleDelete = () => {
    deleteProject(project.id, {
      onSuccess: () => {
        toast({ title: 'Project Deleted', description: 'The project has been removed.' });
        onOpenChange(false);
      },
      onError: (err) => {
        toast({ title: 'Error', description: err.message, variant: 'destructive' });
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
              <span>Project ID:</span>
              <code className="rounded border border-border/70 bg-accent/50 px-1.5 py-0.5 font-mono text-[11px] text-foreground">{project.id}</code>
              <button
                type="button"
                onClick={() => void copyProjectId()}
                className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Copy project ID"
                title="Copy project ID"
              >
                {projectIdCopied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{projectIdCopied ? 'Copied' : 'Copy'}</span>
              </button>
            </span>
          </DialogDescription>
        </DialogHeader>

        {/* Tab Navigation */}
        <div
          role="tablist"
          aria-label="Project settings sections"
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
          {activeTab === 'general' && (
            <>
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

              <ConnectionTestPanel projectId={project.id} />

              <DangerZone
                projectName={project.name}
                isDeleting={isDeleting}
                onConfirmDelete={handleDelete}
              />
            </>
          )}

          {activeTab === 'artifacts' && (
            <ArtifactDeploySettings config={config} original={project.config?.artifactDeploy} onChange={setConfig} />
          )}

          {activeTab === 'targets' && project.config?.artifactDeploy && (
            <ArtifactTargetsSettings project={project} onRunStarted={onArtifactRunStarted} />
          )}

        </div>

        <DialogFooter className="px-6 pb-6">
          {activeTab === 'targets' ? <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button> : <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isPending}>
              <Save className="mr-2 h-4 w-4" />
              {isPending ? 'Saving...' : 'Save Settings'}
            </Button>
          </>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
