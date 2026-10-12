import { useEffect, useState, type KeyboardEvent } from 'react';
import { FolderGit2, Package, Server, Settings } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ReleaseComposerSheet } from '@/components/artifacts/ReleaseComposerSheet';
import { environmentLabel, projectComponentNames } from '@/lib/deployTarget';
import { CustomersTab } from './CustomersTab';
import { ReleasesTab, type NewReleasePath } from './ReleasesTab';
import { SourceTab } from './SourceTab';
import { InstallDialog, type InstallPreselect } from './InstallDialog';
import { BranchReleaseDialog, ImportReleaseDialog, TagReleaseDialog } from './NewReleaseDialogs';
import type { Project } from '@/hooks/useProjects';
import type { SettingsTabId } from '@/components/project/ProjectSettingsModal';

export type WorkspaceTabId = 'customers' | 'releases' | 'source';

const TABS: ReadonlyArray<{ id: WorkspaceTabId; label: string; icon: typeof Server }> = [
  { id: 'customers', label: 'Müşteriler', icon: Server },
  { id: 'releases', label: 'Sürümler', icon: Package },
  { id: 'source', label: 'Kaynak kod', icon: FolderGit2 },
];

type Props = {
  project: Project | null;
  isOpen: boolean;
  initialTab: WorkspaceTabId;
  onOpenChange: (open: boolean) => void;
  /** Opens the project settings dialog on top of the workspace; `targetId` starts editing that customer. */
  onOpenSettings: (project: Project, tab: SettingsTabId, targetId?: string) => void;
  onRunStarted: (project: Project, deploymentId: string) => void;
};

type BuildDialog = { path: 'tag'; tag?: string | null } | { path: 'branch'; branch?: string | null } | { path: 'import' } | null;

/**
 * One project, everything about its versions: who runs what (Müşteriler), what
 * exists (Sürümler) and where versions come from (Kaynak kod). Every dialog the
 * tabs open is rendered here so a tab can hand over to another (a tag in
 * Kaynak kod → "Tag'den sürüm") without the dialogs knowing about each other.
 */
export const ProjectWorkspaceSheet = ({ project, isOpen, initialTab, onOpenChange, onOpenSettings, onRunStarted }: Props) => {
  const [tab, setTab] = useState<WorkspaceTabId>(initialTab);
  const [install, setInstall] = useState<InstallPreselect | null>(null);
  const [build, setBuild] = useState<BuildDialog>(null);
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setTab(initialTab);
    setInstall(null);
    setBuild(null);
    setComposing(false);
  }, [isOpen, initialTab, project?.id]);

  if (!project) return null;

  const started = (deploymentId: string) => onRunStarted(project, deploymentId);

  /** Arrow keys move between tabs, Home/End jump to the ends — WAI-ARIA tablist. */
  const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = TABS.findIndex((item) => item.id === tab);
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    if (next === null) return;
    event.preventDefault();
    setTab(TABS[next].id);
    document.getElementById(`workspace-tab-${TABS[next].id}`)?.focus();
  };

  const newRelease = (path: NewReleasePath) => {
    if (path === 'compose') setComposing(true);
    else setBuild({ path });
  };

  const components = projectComponentNames(project);
  const meta = [
    project.tenant,
    environmentLabel(project.environment),
    components.length > 0 ? `${components.length} bileşen: ${components.join(', ')}` : 'bileşen tanımlı değil',
  ].filter(Boolean).join(' · ');

  return <Sheet open={isOpen} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="flex w-[min(1200px,calc(100vw-3rem))] max-w-none flex-col overflow-hidden border-l-line-strong bg-background p-0 sm:max-w-none">
      <div className="shrink-0 border-b border-line-strong bg-bar px-7 pt-6">
        <div className="flex items-start justify-between gap-4 pr-8">
          <SheetHeader className="min-w-0">
            <SheetTitle className="truncate text-xl">{project.name}</SheetTitle>
            <SheetDescription className="truncate">{meta}</SheetDescription>
          </SheetHeader>
          <Button size="sm" variant="outline" onClick={() => onOpenSettings(project, 'general')}><Settings className="h-3.5 w-3.5" />Ayarlar</Button>
        </div>

        <div role="tablist" aria-label="Proje bölümleri" className="mt-5 flex items-center gap-5" onKeyDown={handleTabKeyDown}>
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return <button
              key={id}
              id={`workspace-tab-${id}`}
              role="tab"
              type="button"
              aria-selected={active}
              aria-controls={`workspace-panel-${id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition-colors ${active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}
            </button>;
          })}
        </div>
      </div>

      <div role="tabpanel" id={`workspace-panel-${tab}`} aria-labelledby={`workspace-tab-${tab}`} tabIndex={0} className="min-h-0 flex-1 overflow-y-auto p-7 focus-visible:outline-none">
        {tab === 'customers' && <CustomersTab
          project={project}
          onInstall={(targetId) => setInstall({ targetId })}
          onAddCustomer={() => onOpenSettings(project, 'targets')}
          onEditCustomer={(targetId) => onOpenSettings(project, 'targets', targetId)}
          onRunStarted={started}
        />}
        {tab === 'releases' && <ReleasesTab project={project} onInstall={(releaseId) => setInstall({ releaseId })} onNewRelease={newRelease} />}
        {tab === 'source' && <SourceTab
          project={project}
          onBuildFromTag={(tag) => setBuild({ path: 'tag', tag })}
          onBuildFromBranch={(branch) => setBuild({ path: 'branch', branch })}
        />}
      </div>

      <InstallDialog
        project={project}
        open={install !== null}
        onOpenChange={(open) => !open && setInstall(null)}
        preselect={install}
        onRunStarted={started}
        onGoToReleases={() => { setInstall(null); setTab('releases'); }}
        onAddCustomer={() => { setInstall(null); onOpenSettings(project, 'targets'); }}
      />
      <TagReleaseDialog
        project={project}
        open={build?.path === 'tag'}
        onOpenChange={(open) => !open && setBuild(null)}
        onRunStarted={started}
        initialTag={build?.path === 'tag' ? build.tag : null}
        onGoToSource={() => { setBuild(null); setTab('source'); }}
      />
      <BranchReleaseDialog
        project={project}
        open={build?.path === 'branch'}
        onOpenChange={(open) => !open && setBuild(null)}
        onRunStarted={started}
        initialBranch={build?.path === 'branch' ? build.branch : null}
      />
      <ImportReleaseDialog project={project} open={build?.path === 'import'} onOpenChange={(open) => !open && setBuild(null)} />
      <ReleaseComposerSheet project={project} isOpen={composing} onOpenChange={setComposing} onRunStarted={started} />
    </SheetContent>
  </Sheet>;
};
