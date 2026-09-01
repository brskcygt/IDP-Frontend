import { useEffect, useState } from 'react';
import { useProjects, type Project } from '@/hooks/useProjects';
import { useDeploymentRuns } from '@/hooks/useDeploymentRun';
import type { DeploymentSession } from '@/hooks/useDeploymentSessions';
import { useProjectFilters } from '@/hooks/useProjectFilters';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { getTransport } from '@/services/transport';
import { useVpnSessions } from '@/hooks/useVpnSessions';
import { formatDuration } from '@/lib/format';
import { useAppVersion } from '@/hooks/useAppVersion';

import { AppRail } from '@/components/layout/AppRail';
import { TopBar } from '@/components/layout/TopBar';
import { StatusFooter } from '@/components/layout/StatusFooter';
import { DashboardError } from '@/components/layout/DashboardError';
import { LiveDeploymentPanel } from '@/components/deployment/LiveDeploymentPanel';
import { DeployActivityPanel } from '@/components/metrics/DeployActivityPanel';
import { AttentionPanel } from '@/components/metrics/AttentionPanel';
import { FilterStrip } from '@/components/project/FilterStrip';
import { ProjectTable } from '@/components/project/ProjectTable';
import { TriggerModal } from '@/components/deployment/TriggerModal';
import { LiveTerminalStream } from '@/components/deployment/LiveTerminalStream';
import { DeploymentRunsHost } from '@/components/deployment/DeploymentRunsHost';
import { MfaGlobalModal } from '@/components/deployment/MfaGlobalModal';
import { DeploymentsSheet } from '@/components/deployment/DeploymentsSheet';
import { ProjectSettingsModal } from '@/components/project/ProjectSettingsModal';
import { ProjectHistorySheet } from '@/components/project/ProjectHistorySheet';
import { CreateProjectModal } from '@/components/project/CreateProjectModal';
import { ActivityLogSheet } from '@/components/audit/ActivityLogSheet';
import { VpnSessionsSheet } from '@/components/vpn/VpnSessionsSheet';
import { Toaster } from '@/components/ui/toaster';
// Legacy Cloudflare runner UI retained on disk but intentionally disabled.
// import { RunnerManagementSheet } from '@/components/runners/RunnerManagementSheet';
import { WorkspaceTransferSheet } from '@/components/transfer/WorkspaceTransferSheet';
import { AgentBuilderSheet } from '@/components/agents/AgentBuilderSheet';
import { ServerFileTransferSheet } from '@/components/transfer/ServerFileTransferSheet';
import { useSession } from '@/hooks/useSession';
import { can } from '@/lib/permissions';

const RUNNING_STATUSES = new Set(['running', 'connecting']);
// Stable reference so a missing active run doesn't hand LiveDeploymentPanel
// a freshly-allocated array on every render.
const EMPTY_LOGS: string[] = [];

const TERMINAL_RUN_STATUSES: readonly string[] = ['succeeded', 'failed', 'aborted'];

export const Dashboard = ({ onLogout }: { onLogout?: () => void }) => {
  const appVersion = useAppVersion();
  const { data: session } = useSession();
  const canDeploy = can(session?.role, 'deploy:trigger');
  const canCreateProject = can(session?.role, 'project:write');
  const canManageVpn = can(session?.role, 'vpn:manage');
  const { data: projects, isLoading, isError } = useProjects();
  const { data: vpnSessions } = useVpnSessions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const {
    runs,
    records,
    activeRunKey,
    activeRun,
    setActiveRunKey,
    start,
    attach,
    close,
    reportSnapshot,
    reportTriggerFailed,
    lastFailure,
    clearLastFailure,
  } = useDeploymentRuns();
  const {
    filters,
    providers,
    visible,
    failed,
    total,
    setSearch,
    setProvider,
    toggleFailedOnly,
  } = useProjectFilters(projects);

  const [triggerTarget, setTriggerTarget] = useState<Project | null>(null);
  const [settingsTarget, setSettingsTarget] = useState<Project | null>(null);
  const [historyTarget, setHistoryTarget] = useState<Project | null>(null);
  const [openPanel, setOpenPanel] = useState<
    'trigger' | 'settings' | 'create' | 'stream' | 'sessions' | 'activity' | 'vpn' | 'history' | 'transfer' | 'agent-builder' | 'file-transfer' | null
  >(null);

  // Surfaces the backend's per-project 409 concurrency lock (or any other
  // trigger failure) instead of letting it disappear as a silently-dropped
  // request — see DeploymentRunController's trigger-failed detection.
  useEffect(() => {
    if (!lastFailure) return;
    toast({ title: 'Deployment could not start', description: lastFailure, variant: 'destructive' });
    clearLastFailure();
  }, [lastFailure, clearLastFailure, toast]);

  if (isError) return <DashboardError />;

  const openTrigger = (project: Project) => {
    setTriggerTarget(project);
    setOpenPanel('trigger');
  };

  const openSettings = (project: Project) => {
    setSettingsTarget(project);
    setOpenPanel('settings');
  };

  const openHistory = (project: Project) => {
    setHistoryTarget(project);
    setOpenPanel('history');
  };

  const confirmDeploy = (_projectId: string) => {
    if (!triggerTarget) return;
    const { isDuplicate } = start(triggerTarget, {});
    setOpenPanel('stream');
    toast(
      isDuplicate
        ? {
            title: 'Already deploying',
            description: `${triggerTarget.name} already has a deployment in progress — showing that run.`,
          }
        : { title: 'Deployment triggered', description: triggerTarget.name },
    );
  };

  /**
   * Aborts the run belonging to a specific project.
   *
   * This used to abort "whichever run is focused", which was harmless while only
   * one deployment could exist at a time. With concurrent runs that meant the
   * Abort button on one project's row could stop a different project's
   * deployment — so the caller now has to say which project it means.
   */
  const abortDeploy = (projectId: string) => {
    const target = runs.find(
      (run) => run.projectId === projectId && !TERMINAL_RUN_STATUSES.includes(run.status)
    );

    if (target) {
      void target.abort();
      toast({
        title: 'Deployment aborted',
        description: `${target.project?.name ?? projectId} deployment stopped.`,
        variant: 'destructive',
      });
      return;
    }

    // Nothing tracked here doesn't mean nothing is running. A reload drops this
    // component's run list while the deployment carries on in the backend —
    // still holding the project's lock, so the operator can neither cancel it
    // nor start another. Ask the backend directly before giving up.
    void abortUntrackedDeployment(projectId);
  };

  const abortUntrackedDeployment = async (projectId: string) => {
    try {
      const sessions = await getTransport().deploy.sessions();
      const live = sessions.find(
        (s) => s.projectId === projectId && !TERMINAL_RUN_STATUSES.includes(s.status)
      );

      if (!live) {
        toast({
          title: 'Nothing to abort',
          description: 'No running deployment was found for this project.',
        });
        return;
      }

      await getTransport().deploy.abort(live.id);
      toast({
        title: 'Deployment aborted',
        description: 'A deployment this window was not tracking has been stopped.',
        variant: 'destructive',
      });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      void queryClient.invalidateQueries({ queryKey: ['deployment-history'] });
    } catch (err) {
      toast({
        title: 'Could not abort',
        description: err instanceof Error ? err.message : 'Unknown error.',
        variant: 'destructive',
      });
    }
  };

  const abortRun = (runKey: string) => {
    const target = runs.find((run) => run.runKey === runKey);
    if (!target) return;
    void target.abort();
    toast({
      title: 'Deployment aborted',
      description: `${target.project?.name ?? target.projectId} deployment stopped.`,
      variant: 'destructive',
    });
  };

  const closeStream = (open: boolean) => {
    setOpenPanel(open ? 'stream' : null);
    if (!open && runs.some((run) => RUNNING_STATUSES.has(run.status))) {
      toast({
        title: 'Still deploying',
        description: 'The stream closed but deployments continue in the background.',
      });
    }
  };

  const attachSession = (session: DeploymentSession) => {
    const project = projects?.find((p) => p.id === session.projectId) ?? null;
    attach(session.id, session.projectId, project);
    setOpenPanel('stream');
  };

  const clearFilters = () => {
    setSearch('');
    setProvider(null);
    if (filters.failedOnly) toggleFailedOnly();
  };

  const activeFilters = [
    filters.provider && `provider=${filters.provider}`,
    filters.failedOnly && 'failed only',
    filters.search && `search="${filters.search}"`,
  ].filter(Boolean) as string[];

  const elapsedLabel = formatDuration(activeRun?.elapsedMs ?? 0);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <DeploymentRunsHost records={records} onSnapshot={reportSnapshot} onTriggerFailed={reportTriggerFailed} />

      <AppRail
        vpnActive={(vpnSessions?.length ?? 0) > 0}
        canManageProjects={canCreateProject}
        canManageVpn={canManageVpn}
        onOpenActivityLog={() => setOpenPanel('activity')}
        onOpenVpnSessions={() => setOpenPanel('vpn')}
        onOpenTransfer={() => setOpenPanel('transfer')}
        onOpenAgentBuilder={() => setOpenPanel('agent-builder')}
        onOpenFileTransfer={() => setOpenPanel('file-transfer')}
        onLogout={onLogout}
      />

      <div className="flex min-w-0 flex-grow flex-col">
        <TopBar
          search={filters.search}
          onSearchChange={setSearch}
          onCreateProject={() => setOpenPanel('create')}
        />

        <div className="flex h-[248px] shrink-0 border-b border-line-strong bg-bar">
          <LiveDeploymentPanel
            project={activeRun?.project ?? null}
            status={activeRun?.status ?? 'idle'}
            logs={activeRun?.logs ?? EMPTY_LOGS}
            elapsedMs={activeRun?.elapsedMs ?? 0}
            onOpenStream={() => setOpenPanel('stream')}
            // This panel always reflects the focused run, so it aborts that
            // run's project rather than asking the user to pick one.
            onAbort={() => activeRun && abortDeploy(activeRun.projectId)}
          />
          <DeployActivityPanel />
          <AttentionPanel failed={failed} onRetry={canDeploy ? openTrigger : undefined} />
        </div>

        <FilterStrip
          providers={providers}
          activeProvider={filters.provider}
          failedOnly={filters.failedOnly}
          failedCount={failed.length}
          summary={activeFilters.join(' · ') || 'sorted by status'}
          onProviderChange={setProvider}
          onToggleFailedOnly={toggleFailedOnly}
        />

        <ProjectTable
          projects={visible}
          isLoading={isLoading}
          hasFilters={activeFilters.length > 0}
          deployingElapsed={elapsedLabel}
          onDeploy={openTrigger}
          onAbort={abortDeploy}
          onSettings={openSettings}
          onOpenHistory={openHistory}
          onClearFilters={clearFilters}
          onCreateProject={canCreateProject ? () => setOpenPanel('create') : undefined}
        />

        <StatusFooter
          version={appVersion}
          visibleCount={visible.length}
          totalCount={total}
          filterSummary={activeFilters.join(' · ')}
          streamState={
            runs.some((run) => RUNNING_STATUSES.has(run.status))
              ? 'streaming'
              : runs.some((run) => run.status === 'failed')
                ? 'failed'
                : 'idle'
          }
        />
      </div>

      {canDeploy && (
        <TriggerModal
          project={triggerTarget}
          isOpen={openPanel === 'trigger'}
          onOpenChange={(open) => setOpenPanel(open ? 'trigger' : null)}
          onConfirm={confirmDeploy}
        />
      )}

      <ProjectSettingsModal
        project={settingsTarget}
        isOpen={openPanel === 'settings'}
        onOpenChange={(open) => setOpenPanel(open ? 'settings' : null)}
      />

      <ProjectHistorySheet
        project={historyTarget}
        isOpen={openPanel === 'history'}
        onOpenChange={(open) => setOpenPanel(open ? 'history' : null)}
      />

      {canCreateProject && (
        <CreateProjectModal
          isOpen={openPanel === 'create'}
          onOpenChange={(open) => setOpenPanel(open ? 'create' : null)}
        />
      )}

      <LiveTerminalStream
        isOpen={openPanel === 'stream'}
        onOpenChange={closeStream}
        runs={runs}
        activeRunKey={activeRunKey}
        onSelectRun={setActiveRunKey}
        onCloseRun={close}
        onAbortRun={abortRun}
        onBrowseSessions={() => setOpenPanel('sessions')}
      />

      <DeploymentsSheet
        isOpen={openPanel === 'sessions'}
        onOpenChange={(open) => setOpenPanel(open ? 'sessions' : null)}
        onAttach={attachSession}
      />

      <ActivityLogSheet
        isOpen={openPanel === 'activity'}
        onOpenChange={(open) => setOpenPanel(open ? 'activity' : null)}
      />

      <VpnSessionsSheet
        isOpen={openPanel === 'vpn'}
        onOpenChange={(open) => setOpenPanel(open ? 'vpn' : null)}
      />

      {/* Legacy Cloudflare runner management sheet intentionally hidden. */}
      <WorkspaceTransferSheet isOpen={openPanel === 'transfer'} onOpenChange={(open) => setOpenPanel(open ? 'transfer' : null)} projects={projects ?? []} />
      <AgentBuilderSheet isOpen={openPanel === 'agent-builder'} onOpenChange={(open) => setOpenPanel(open ? 'agent-builder' : null)} />
      <ServerFileTransferSheet isOpen={openPanel === 'file-transfer'} onOpenChange={(open) => setOpenPanel(open ? 'file-transfer' : null)} />

      {/* Global, Sheet-independent (T-75): stays visible/blocking even while the terminal Sheet is closed. */}
      <MfaGlobalModal runs={runs} activeRunKey={activeRunKey} onCancel={abortRun} />

      <Toaster />
    </div>
  );
};
