import { Loader2, Rocket, Server } from "lucide-react";
import type { Project } from "@/hooks/useProjects";
import { useArtifactAgents, useArtifactTargets } from "@/hooks/useArtifacts";
import { useSession } from "@/hooks/useSession";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export type DeploySelection = { targetId: string; component?: string };

type Props = {
  project: Project;
  onDeploy: (project: Project, selection: DeploySelection) => void;
  onAddTarget: (project: Project) => void;
};

const formatDate = (value: string | null | undefined) =>
  value ? new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : null;

const ACTION_CLASS =
  "inline-flex h-[24px] items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The customers of one project, and what each of them is running.
 *
 * A release is built once and then rolled out per customer, at different times
 * — so the rollout state belongs to the target, not the project, and the row's
 * single "Deploy" button could never express it. Each component gets its own
 * button because they move independently: a frontend fix should not restart the
 * backend service.
 *
 * The buttons open the deploy sheet with the target (and component)
 * preselected rather than deploying on the spot: choosing the release, the
 * production confirmation and the agent-offline guard all already live there,
 * and a second, shorter path around them is exactly how a wrong version reaches
 * a customer.
 */
export const ProjectTargetsPanel = ({ project, onDeploy, onAddTarget }: Props) => {
  const { data: session } = useSession();
  const canDeploy = can(session?.role, "deploy:trigger");
  const targets = useArtifactTargets(project.id);
  const agents = useArtifactAgents(true);
  const onlineAgents = new Map((agents.data ?? []).map((agent) => [agent.id, agent.online]));
  const projectComponents = (project.config?.artifactDeploy?.components ?? []).map((component) => component.name);

  if (targets.isLoading) {
    return (
      <div className="flex items-center gap-2 border-b border-line bg-surface/40 px-12 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        Loading customers…
      </div>
    );
  }

  if (targets.isError) {
    return (
      <div className="border-b border-line bg-surface/40 px-12 py-3 text-xs text-destructive">
        {targets.error instanceof Error ? targets.error.message : "Customers could not be loaded."}
      </div>
    );
  }

  const rows = targets.data ?? [];

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-between gap-3 border-b border-line bg-surface/40 px-12 py-3">
        <p className="text-xs text-muted-foreground">
          No customer configured for this project yet.
        </p>
        <button type="button" onClick={() => onAddTarget(project)} className={cn(ACTION_CLASS, "border border-line-strong hover:bg-accent")}>
          <Server className="h-3 w-3" aria-hidden="true" />
          Add customer
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-line bg-surface/40 py-1.5">
      {rows.map((target) => {
        // A target may host only part of the project's components.
        const components = (target.components ?? []).map((component) => component.name);
        const hosted = components.length > 0 ? components : projectComponents;
        const online = onlineAgents.get(target.agentId);

        return (
          <div key={target.id} className="px-12 py-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-[13px] font-semibold">{target.name}</span>
              <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {target.environment ?? project.environment}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 font-mono text-[10px]",
                  online ? "text-status-ok" : "text-status-fail",
                )}
              >
                <span aria-hidden="true" className={cn("h-[6px] w-[6px] rounded-full", online ? "bg-status-ok" : "bg-status-fail")} />
                {online ? "agent online" : "agent offline"}
              </span>
              {canDeploy && (
                <button
                  type="button"
                  onClick={() => onDeploy(project, { targetId: target.id })}
                  className={cn(ACTION_CLASS, "ml-auto border border-line-strong hover:bg-accent")}
                >
                  <Rocket className="h-3 w-3" aria-hidden="true" />
                  Deploy all
                </button>
              )}
            </div>

            <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {hosted.map((name) => {
                const installed = target.currentVersions?.[name];
                const deployedAt = formatDate(installed?.deployedAt);
                return (
                  <div key={name} className="flex items-center justify-between gap-2 rounded-md bg-background/60 px-2.5 py-1.5">
                    <div className="min-w-0">
                      <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{name}</p>
                      <p className="truncate font-mono text-xs font-semibold">
                        {installed?.version ?? <span className="text-muted-foreground">not installed</span>}
                      </p>
                      {deployedAt && <p className="text-[10px] text-muted-foreground">{deployedAt}</p>}
                    </div>
                    {canDeploy && (
                      <button
                        type="button"
                        onClick={() => onDeploy(project, { targetId: target.id, component: name })}
                        aria-label={`Deploy ${name} to ${target.name}`}
                        className={cn(ACTION_CLASS, "shrink-0 bg-primary font-semibold text-primary-foreground hover:bg-primary/90")}
                      >
                        Deploy
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
