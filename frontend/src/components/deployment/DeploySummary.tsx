import { formatRelativeTime } from "@/lib/format";
import type { Project } from "@/hooks/useProjects";

interface DeploySummaryProps {
  project: Project;
}

/** The "RUN SUMMARY" key/value block at the bottom of TriggerModal. */
export const DeploySummary = ({ project }: DeploySummaryProps) => {
  return (
    <>
      <p className="mb-2.5 font-mono text-[10px] tracking-[0.12em] text-muted-foreground">
        RUN SUMMARY
      </p>
      <dl className="rounded-md border border-line bg-surface-sunken px-3.5 py-3 font-mono text-[11.5px] leading-8">
        <div className="flex justify-between">
          <dt className="text-dim">provider</dt>
          <dd>{project.provider}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-dim">tenant</dt>
          <dd>{project.tenant}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-dim">last run</dt>
          <dd>
            {formatRelativeTime(project.lastDeploy)} · {project.status.toLowerCase()}
          </dd>
        </div>
      </dl>
    </>
  );
};
