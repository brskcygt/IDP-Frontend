import { formatRelativeTimeTr } from "@/lib/format";
import { PROJECT_STATUS_LABEL } from "@/lib/projectMeta";
import type { Project } from "@/hooks/useProjects";

interface DeploySummaryProps {
  project: Project;
}

/** The "ÖZET" key/value block at the bottom of TriggerModal. */
export const DeploySummary = ({ project }: DeploySummaryProps) => {
  return (
    <>
      <p className="mb-2.5 font-mono text-[10px] tracking-[0.12em] text-muted-foreground">
        ÖZET
      </p>
      <dl className="rounded-md border border-line bg-surface-sunken px-3.5 py-3 font-mono text-[11.5px] leading-8">
        <div className="flex justify-between">
          <dt className="text-dim">sağlayıcı</dt>
          <dd>{project.provider}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-dim">tenant</dt>
          <dd>{project.tenant}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-dim">son çalışma</dt>
          <dd>
            {formatRelativeTimeTr(project.lastDeploy)} · {PROJECT_STATUS_LABEL[project.status] ?? project.status}
          </dd>
        </div>
      </dl>
    </>
  );
};
